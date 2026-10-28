-- Núcleo · Etapa 9 · M2 · eventos de segurança da conta: public.security_events + trigger de troca de senha em auth.users.
-- Contrato: docs/contracts/etapa-9.md §3.1 (M2); ADR-0035 §4; fecha a parte de banco de SEC-4; AB-121.
--
-- security_events é POR USUÁRIO (não por família): quem ainda não tem família também tem trilha, e a gestão da família não lê a
-- troca de senha de um integrante. Só o próprio usuário lê (RLS). Ninguém escreve pela API: a única escrita é o trigger abaixo,
-- que dispara em qualquer caminho do Auth que mude auth.users.encrypted_password (troca logada, recuperação por e-mail...).
--
-- RISCO CONTROLADO — trigger em schema gerenciado (auth). O padrão já existe e está em produção desde 20261023100100
-- (on_auth_user_created -> private.handle_new_user), o que demonstra que o papel das migrations tem TRIGGER em auth.users no
-- projeto hospedado. Mesmo assim, o bloco abaixo confere o privilégio ANTES de criar qualquer objeto e aborta com mensagem
-- explícita. A CLI executa o arquivo numa única transação: se qualquer comando falhar, NADA desta migration fica aplicado e
-- login/cadastro/recuperação não são tocados. A função do trigger também NUNCA lança erro (ver private.log_password_changed):
-- uma falha ao gravar o evento não pode impedir a troca de senha nem o login.
-- Se a verificação falhar em produção: NÃO contornar (sem reduzir segurança); registrar e decidir (ver docs/log-execucao.md).

do $$
begin
  if not has_table_privilege(current_user, 'auth.users', 'TRIGGER') then
    raise exception
      'ETAPA9_M2: o papel % nao tem o privilegio TRIGGER em auth.users; nada foi aplicado. Veja docs/log-execucao.md (decisao pendente M2).',
      current_user
      using errcode = '42501';
  end if;
end
$$;

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  action text not null
    constraint security_events_action_check check (action in ('password.changed')),
  metadata jsonb not null default '{}'::jsonb
    constraint security_events_metadata_check check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 1024),
  created_at timestamptz not null default now()
);

-- /configuracoes: as 10 últimas entradas do próprio usuário, mais recentes primeiro (listSecurityEvents).
create index security_events_user_created_idx on public.security_events (user_id, created_at desc);

alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;  -- sem insert/update/delete pela API

create policy security_events_select_own on public.security_events
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Trigger de troca de senha. Usuário sem linha em profiles (inconsistência legada) não gera evento e, principalmente, não falha.
-- O bloco interno engole qualquer erro (com WARNING sem dado pessoal): a trilha é secundária, a troca de senha não pode quebrar.
create function private.log_password_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.security_events (user_id, action)
    select p.id, 'password.changed'
    from public.profiles p
    where p.id = new.id;
  exception when others then
    raise warning 'log_password_changed: evento nao gravado (sqlstate %)', sqlstate;
  end;
  return null;
end;
$$;
revoke execute on function private.log_password_changed() from public, anon, authenticated;

-- "update of encrypted_password" + when: só dispara quando a coluna é alvo do UPDATE E o hash realmente mudou para um valor não nulo
-- (atualizar com o mesmo hash, tocar outras colunas ou zerar a senha não grava).
create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row
  when (new.encrypted_password is not null and old.encrypted_password is distinct from new.encrypted_password)
  execute function private.log_password_changed();

-- DOWN (manual): drop trigger on_auth_user_password_changed on auth.users; drop function private.log_password_changed();
--   drop table public.security_events (apaga os eventos já registrados: dado de trilha, só com autorização).
-- Efeito em dados existentes: nenhum (tabela, função e trigger novos; nada é lido nem escrito em auth.users pela migration).
--   Não há evento retroativo: só trocas de senha feitas depois da migration geram linha.
-- Lock: CREATE TRIGGER em auth.users exige SHARE ROW EXCLUSIVE na tabela por instantes (DDL; sem reescrita). Volume de auth.users não
--   medido neste ambiente. O trigger só executa trabalho quando encrypted_password muda (WHEN avaliado antes de chamar a função).
-- Residual conhecido: se o Auth reescrever o hash por motivo técnico (ex.: reajuste de custo do bcrypt no login), isso também é uma
--   troca de encrypted_password e geraria um evento "Senha alterada" sem ação do usuário; esperado raro (hash já no custo padrão).
-- Observação: public.security_events.user_id é ON DELETE RESTRICT (contrato). Excluir um perfil/usuário com eventos exige apagar os
--   eventos antes (M4/delete_my_account faz isso); exclusão manual pelo painel do Supabase falha até limpar a trilha.
