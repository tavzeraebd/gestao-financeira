-- Núcleo · Etapa 9 · M4 · exclusão da própria conta (LGPD): public.delete_my_account(), private.erase_family(), private.require_recent_auth(),
-- private.account_erasure_log. Contrato: docs/contracts/etapa-9.md §3.1 (M4); ADR-0038; AB-128; CA-E9-17..22.
-- Erros: P0001 com mensagem = código (NOT_AUTHENTICATED, REAUTH_REQUIRED, OWNER_MUST_TRANSFER, ACCOUNT_ERASURE_UNAVAILABLE); 42501 = FORBIDDEN.
--
-- Desenho
--   * UMA função, UMA transação: delete_my_account() faz tudo ou nada. Qualquer erro (inclusive o de auth.users) desfaz o que veio antes.
--   * Reautenticação provada NO BANCO (ADR-0038 §2): private.require_recent_auth('5 minutes') lê auth.jwt() -> 'amr' e exige uma entrada
--     {"method":"password","timestamp":<epoch em segundos>} dentro do prazo (com tolerância de 60 s de relógio para o futuro). O formato é o
--     que o GoTrue emite depois de signInWithPassword. NEGADO por segurança (REAUTH_REQUIRED) quando: não há JWT/claim amr; amr não é array;
--     o elemento não é objeto; o método não é "password"; o timestamp falta, não é número JSON, é mais velho que o prazo ou está mais de
--     60 s no futuro. Um token roubado sem a senha não passa (a sessão nova só nasce com a senha).
--   * Regra do último owner (ADR-0038 §3): owner com OUTROS integrantes ativos -> OWNER_MUST_TRANSFER, sem tocar em nada; owner SOZINHO ->
--     a família inteira é apagada (private.erase_family); admin e member saem (efeitos de leave_family) e a família permanece.
--   * Quem sai NUNCA tem profiles/auth.users apagados: as FKs `restrict` de created_by/deleted_by/accepted_by/revoked_by/actor_user_id/user_id
--     (dezenas de tabelas) tornariam o hard delete impossível, e apagar levaria dado financeiro da família junto. O que se faz é anonimizar:
--     profiles.display_name = 'Conta excluída', avatar_url nulo; notifications e security_events do usuário apagadas (security_events.user_id é
--     ON DELETE RESTRICT, então as linhas precisam sair ANTES de qualquer remoção de perfil — nenhuma é feita aqui); convites: invited_email
--     nulo nos que ele criou e nos que ele aceitou (o e-mail ligado ao convite consumido é dado dele); audit_events não é tocada (metadata
--     sem PII por contrato).
--   * auth.users é o ÚLTIMO passo (neutralização + apagar identities, sessions, mfa_factors e one_time_tokens do usuário). O papel das
--     migrations pode não ter escrita em auth.* no Supabase hospedado; por isso (a) private.account_erasure_auth_ready confere os privilégios
--     ANTES de qualquer escrita e a função aborta com ACCOUNT_ERASURE_UNAVAILABLE (mensagem fixa, sem detalhe, nada alterado); (b) se uma
--     escrita em auth.* falhar mesmo assim, o erro SOBE (não há bloco que o engula) e a transação inteira é desfeita. Não existe estado parcial.
--     Plano B (Admin API/service_role) é decisão pendente: docs/log-execucao.md.
--   * banned_until recebe '9999-12-31 00:00:00+00' em vez de 'infinity' (o ADR diz "infinito"): efeito idêntico na prática (IsBanned() é
--     "agora < banned_until"), mas um valor finito evita que um driver Go não consiga ler o timestamp especial 'infinity' ao carregar a linha.
--   * Segunda chamada com o mesmo token: private.account_erasure_log já tem o usuário -> FORBIDDEN (42501), sem efeito.
--   * private.account_erasure_log (sem PII): id, user_id, erased_at, role, family_erased. Sem grant e sem policy; só delete_my_account insere.
--
-- Mapa de erase_family (ordem de apagamento = folhas primeiro; `restrict` é verificado ao fim de cada comando, então apagar uma tabela
-- inteira que referencia a si mesma — categories.parent, transactions.reversal_of — num único DELETE é seguro):
--   1 expense_splits      -> transactions, family_members
--   2 goal_contributions  -> goals, family_members
--   3 settlements         -> family_members
--   4 notifications       -> families (e profiles)
--   5 transactions        -> accounts, categories, family_members, recurrences, transactions (estorno)
--   6 recurrences         -> accounts, categories, family_members
--   7 budgets             -> categories
--   8 goals
--   9 categories          -> categories (pai). O trigger BEFORE DELETE categories_audit_bd grava category.deleted em audit_events: por isso
--  10 audit_events        só é apagada DEPOIS de categories (e de tudo que audite)
--  11 accounts
--  12 family_invites
--  13 family_members
--  14 families
-- pgTAP 660 confere este mapa contra pg_constraint (toda tabela com FK para families, direta ou por tabela da família, precisa de um
-- `delete from public.<tabela>` na função) e prova, com dados em todas as tabelas, que nada fica para trás e nada bloqueia.
--
-- Concorrência: o owner trava o vínculo (FOR UPDATE) e depois a linha de families (FOR UPDATE) antes de contar os outros integrantes; uma
-- aceitação de convite concorrente toma KEY SHARE em families (FK de family_members), então ou entra antes da contagem (-> OWNER_MUST_TRANSFER)
-- ou espera e falha na FK depois que a família some. Um deadlock com accept_family_invite é possível e resolve com erro 40P01 (a transação
-- que perde é desfeita sem efeito); tentar de novo basta.
--
-- Efeito em dados existentes: NENHUM no momento da migration (só cria objetos; nenhuma linha é lida ou escrita). Os efeitos acontecem
-- quando o usuário chama delete_my_account() e são irreversíveis (ver DOWN). Lock: DDL de objetos novos, breve.
-- Custo de uma exclusão de família grande: não medido neste ambiente. Uma família no teto de 100000 lançamentos apaga em um único comando
-- por tabela; o statement_timeout do papel que chama pode interromper (a transação é desfeita sem efeito). Se acontecer, a limpeza deve ser
-- feita por quem administra o banco (runbook).

-- Registro de prova (sem PII) ---------------------------------------------------------------------------------------------------------
create table private.account_erasure_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,  -- sem FK de propósito: a prova sobrevive a qualquer remoção futura de profiles/auth.users
  erased_at timestamptz not null default now(),
  role text null
    constraint account_erasure_log_role_check check (role is null or role in ('owner', 'admin', 'member')),
  family_erased boolean not null,
  constraint account_erasure_log_user_id_key unique (user_id)  -- uma exclusão por usuário; serve também ao teste "já excluída"
);
revoke all on private.account_erasure_log from public, anon, authenticated;
alter table private.account_erasure_log enable row level security;  -- sem policy: defesa em profundidade (o dono das funções definer ignora a RLS)

-- Reautenticação recente (reutilizável: SEC-27, se o usuário decidir) -------------------------------------------------------------------
create function private.require_recent_auth(p_max_age interval) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_amr jsonb := auth.jwt() -> 'amr';
  v_now numeric := extract(epoch from now());
  v_el jsonb;
  v_ts numeric;
begin
  if p_max_age is null or p_max_age <= interval '0 seconds'
     or v_amr is null or jsonb_typeof(v_amr) <> 'array' then
    raise exception 'REAUTH_REQUIRED' using errcode = 'P0001';
  end if;

  for v_el in select e.value from jsonb_array_elements(v_amr) e loop
    if jsonb_typeof(v_el) = 'object'
       and v_el ->> 'method' = 'password'
       and jsonb_typeof(v_el -> 'timestamp') = 'number' then
      v_ts := (v_el ->> 'timestamp')::numeric;
      if v_ts <= v_now + 60 and v_ts >= v_now - extract(epoch from p_max_age) then
        return;
      end if;
    end if;
  end loop;

  raise exception 'REAUTH_REQUIRED' using errcode = 'P0001';
end;
$$;
revoke execute on function private.require_recent_auth(interval) from public, anon, authenticated;

-- O papel dono da função consegue escrever em auth.*? (conferido ANTES de qualquer escrita; p_role = current_user dentro do definer) -------
create function private.account_erasure_auth_ready(p_role name) returns boolean
language sql stable security definer set search_path = '' as $$
  select has_table_privilege(p_role, 'auth.users', 'UPDATE')
     and has_table_privilege(p_role, 'auth.identities', 'DELETE')
     and has_table_privilege(p_role, 'auth.sessions', 'DELETE')
     and has_table_privilege(p_role, 'auth.mfa_factors', 'DELETE')
     and (to_regclass('auth.one_time_tokens') is null or has_table_privilege(p_role, 'auth.one_time_tokens', 'DELETE'));
$$;
revoke execute on function private.account_erasure_auth_ready(name) from public, anon, authenticated;

-- Apagar a família inteira (só quando quem pede é o ÚNICO integrante ativo e owner) -----------------------------------------------------
create function private.erase_family(p_family_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  -- defesa em profundidade: delete_my_account já conferiu; aqui o chamador precisa ser o owner ativo e o único ativo
  if v_uid is null or p_family_id is null
     or not exists (
       select 1 from public.family_members m
       where m.family_id = p_family_id and m.user_id = v_uid and m.role = 'owner' and m.status = 'active')
     or exists (
       select 1 from public.family_members m
       where m.family_id = p_family_id and m.status = 'active' and m.user_id <> v_uid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.expense_splits where family_id = p_family_id;
  delete from public.goal_contributions where family_id = p_family_id;
  delete from public.settlements where family_id = p_family_id;
  delete from public.notifications where family_id = p_family_id;
  delete from public.transactions where family_id = p_family_id;
  delete from public.recurrences where family_id = p_family_id;
  delete from public.budgets where family_id = p_family_id;
  delete from public.goals where family_id = p_family_id;
  delete from public.categories where family_id = p_family_id;   -- dispara categories_audit_bd (grava em audit_events)
  delete from public.audit_events where family_id = p_family_id;  -- por último entre os que auditam
  delete from public.accounts where family_id = p_family_id;
  delete from public.family_invites where family_id = p_family_id;
  delete from public.family_members where family_id = p_family_id;
  delete from public.families where id = p_family_id;
end;
$$;
revoke execute on function private.erase_family(uuid) from public, anon, authenticated;

-- RPC ------------------------------------------------------------------------------------------------------------------------------
create function public.delete_my_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_member public.family_members;
  v_others integer;
  v_erase boolean := false;
  v_revoked integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  perform private.require_recent_auth(interval '5 minutes');

  -- conta já excluída (token ainda válido por até 1 h): sem efeito
  if exists (select 1 from private.account_erasure_log l where l.user_id = v_uid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- falha SEGURA e explícita: se o papel não escreve em auth.*, nada é alterado
  if not private.account_erasure_auth_ready(current_user) then
    raise exception 'ACCOUNT_ERASURE_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- vínculo ativo travado (espera transferência/saída concorrente; o papel lido abaixo já é o confirmado por ela)
  select * into v_member from public.family_members m
  where m.user_id = v_uid and m.status = 'active'
  for update;

  if v_member.id is not null then
    if v_member.role = 'owner' then
      -- serializa com aceitação de convite (KEY SHARE em families) antes de contar os outros
      perform 1 from public.families f where f.id = v_member.family_id for update;
      select count(*)::integer into v_others
      from public.family_members m
      where m.family_id = v_member.family_id and m.status = 'active' and m.id <> v_member.id;
      if v_others > 0 then
        raise exception 'OWNER_MUST_TRANSFER' using errcode = 'P0001';
      end if;
      v_erase := true;
      perform private.erase_family(v_member.family_id);
    else
      -- efeitos de leave_family; a família permanece
      update public.family_members set status = 'left', ended_at = now() where id = v_member.id;
      v_revoked := private.revoke_member_invites(v_member.family_id, v_uid);
      perform private.log_audit(
        v_member.family_id, 'family_member', v_member.id, 'member.left',
        jsonb_build_object('member_id', v_member.id, 'from_role', v_member.role, 'revoked_invites', v_revoked,
                           'reason', 'account_deleted')
      );
    end if;
  end if;

  -- anonimização do titular (profiles permanece: as FKs das tabelas da família continuam íntegras)
  update public.profiles set display_name = 'Conta excluída', avatar_url = null where id = v_uid;
  delete from public.notifications where user_id = v_uid;
  delete from public.security_events where user_id = v_uid;
  delete from private.notification_refresh_state where user_id = v_uid;
  update public.family_invites set invited_email = null
  where (created_by = v_uid or accepted_by = v_uid) and invited_email is not null;

  -- prova de exclusão sem PII
  insert into private.account_erasure_log (user_id, role, family_erased) values (v_uid, v_member.role, v_erase);

  -- ÚLTIMO passo: neutralizar a identidade no Auth (qualquer erro daqui desfaz a transação inteira)
  update auth.users u set
    email = 'conta-excluida+' || u.id::text || '@excluida.invalid',
    encrypted_password = null,
    raw_user_meta_data = '{}'::jsonb,
    phone = null,
    confirmation_token = '',
    recovery_token = '',
    email_change_token_new = '',
    email_change = '',
    email_change_token_current = '',
    reauthentication_token = '',
    phone_change = '',
    phone_change_token = '',
    banned_until = timestamptz '9999-12-31 00:00:00+00',
    deleted_at = now(),
    updated_at = now()
  where u.id = v_uid;
  if not found then
    raise exception 'ACCOUNT_ERASURE_UNAVAILABLE' using errcode = 'P0001';
  end if;
  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;  -- refresh_tokens saem em cascata
  delete from auth.mfa_factors where user_id = v_uid;
  if to_regclass('auth.one_time_tokens') is not null then
    delete from auth.one_time_tokens where user_id = v_uid;
  end if;

  return jsonb_build_object('family_erased', v_erase);
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- DOWN (manual): drop function public.delete_my_account(); drop function private.erase_family(uuid);
--   drop function private.account_erasure_auth_ready(name); drop function private.require_recent_auth(interval);
--   drop table private.account_erasure_log (apaga a prova de exclusão: dado de conformidade, só com autorização).
--   IRREVERSÍVEL por desenho: contas já excluídas (famílias apagadas, perfis anonimizados, auth.users neutralizado) NÃO voltam com o DOWN;
--   a única recuperação é o backup (docs/runbooks/backup-recuperacao.md).
