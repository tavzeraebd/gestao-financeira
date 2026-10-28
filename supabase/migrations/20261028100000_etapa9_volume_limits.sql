-- Núcleo · Etapa 9 · M1 · limites de volume e de frequência no banco + intervalo mínimo e teto em refresh_notifications.
-- Contrato: docs/contracts/etapa-9.md §3.1 (M1); ADR-0033; fecha SEC-24, SEC-28 e o resíduo de SEC-18; AB-122, AB-123.
-- Erros: P0001 com mensagem = código (VOLUME_LIMIT_REACHED, RATE_LIMITED), como os demais triggers.
--
-- Desenho:
--   * private.volume_limits guarda os tetos (ajustáveis por UPDATE de quem administra o banco, sem deploy; os pgTAP os baixam
--     dentro da transação). Sem grant a anon/authenticated e fora do schema exposto (a API só expõe public).
--   * private.enforce_volume_limit(...) faz dois testes por inserção: (a) volume ATIVO (linhas não excluídas, contagem limitada
--     a max_active, então o custo é O(max_active) no pior caso e não O(tabela)); (b) FREQUÊNCIA por created_by na última hora,
--     contando as excluídas logicamente (fecha o ciclo inserir/excluir/inserir).
--   * Sem oráculo entre famílias (AB-123): o BEFORE INSERT roda ANTES do WITH CHECK da RLS, então um family_id forjado chega
--     aqui. A função só conta se auth.uid() existe E private.is_family_member(p_family_id); senão retorna sem erro e deixa a
--     RLS/FK negar como antes (42501/23503). As contagens por meta também filtram por family_id (meta de outra família = 0).
--   * Sem lock: nenhum advisory lock nem FOR UPDATE. Sob concorrência o teto é "brando" (duas inserções simultâneas podem
--     ultrapassá-lo em poucas linhas); o objetivo é barrar centenas de milhares, não ser contador exato (ADR-0033 descartou
--     contador materializado).
--   * Caminhos sem auth.uid() (postgres, service_role, seed) não são limitados, por desenho: só a API do usuário é a ameaça.
--   * Os triggers são NOVOS e separados dos *_before_write_biu (nenhuma função de integridade financeira é reescrita). Por ordem
--     alfabética de nome, disparam depois deles: validações próprias (data futura, conta arquivada...) respondem primeiro.
--   * As funções de trigger são security definer (o chamador, authenticated, não tem EXECUTE nem leitura em private.*).
--   * Linhas com recurrence_id (materialize_recurrences, até 60 por chamada) entram no volume ativo e ficam FORA da frequência.

-- Tetos --------------------------------------------------------------------------------------------------------------------
create table private.volume_limits (
  kind text primary key,
  max_active integer not null constraint volume_limits_max_active_check check (max_active >= 0),
  max_per_hour integer not null constraint volume_limits_max_per_hour_check check (max_per_hour >= 0)  -- 0 = sem teste de frequência
);
revoke all on private.volume_limits from public, anon, authenticated;
alter table private.volume_limits enable row level security;  -- sem policy: defesa em profundidade (o dono das funções definer ignora a RLS)

insert into private.volume_limits (kind, max_active, max_per_hour) values
  ('transactions', 100000, 500),
  ('goal_contributions_goal', 10000, 0),
  ('goal_contributions_family', 50000, 500),
  ('settlements', 20000, 200),
  ('notifications_user', 500, 0);  -- lido por refresh_notifications (teto por usuário); não há trigger

-- Função comum -------------------------------------------------------------------------------------------------------------
create function private.enforce_volume_limit(
  p_kind text, p_family_id uuid, p_scope_id uuid, p_created_by uuid, p_count_rate boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_max_active integer;
  v_max_hour integer;
  v_n integer;
begin
  -- sem oráculo: quem não é integrante ativo da família (ou não tem sessão) não aprende nada sobre ela
  if auth.uid() is null or p_family_id is null or not private.is_family_member(p_family_id) then
    return;
  end if;

  select l.max_active, l.max_per_hour into v_max_active, v_max_hour
  from private.volume_limits l where l.kind = p_kind;
  if not found then
    return;  -- tipo sem teto cadastrado: não limita (os pgTAP garantem as cinco linhas do seed)
  end if;

  -- (a) volume ativo (não excluídos), contagem limitada
  if p_kind = 'transactions' then
    select count(*)::integer into v_n from (
      select 1 from public.transactions t
      where t.family_id = p_family_id and t.deleted_at is null
      limit v_max_active) s;
  elsif p_kind = 'goal_contributions_goal' then
    select count(*)::integer into v_n from (
      select 1 from public.goal_contributions c
      where c.goal_id = p_scope_id and c.family_id = p_family_id and c.deleted_at is null
      limit v_max_active) s;
  elsif p_kind = 'goal_contributions_family' then
    select count(*)::integer into v_n from (
      select 1 from public.goal_contributions c
      where c.family_id = p_family_id and c.deleted_at is null
      limit v_max_active) s;
  elsif p_kind = 'settlements' then
    select count(*)::integer into v_n from (
      select 1 from public.settlements s2
      where s2.family_id = p_family_id and s2.deleted_at is null
      limit v_max_active) s;
  else
    return;  -- notifications_user e tipos futuros sem consulta própria
  end if;
  if v_n >= v_max_active then
    raise exception 'VOLUME_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  -- (b) frequência por criador na última hora, INCLUINDO as excluídas logicamente
  if p_count_rate and v_max_hour > 0 then
    if p_kind = 'transactions' then
      select count(*)::integer into v_n from (
        select 1 from public.transactions t
        where t.created_by = p_created_by and t.created_at > now() - interval '1 hour'
          and t.recurrence_id is null  -- casa com o predicado do índice parcial
        limit v_max_hour) s;
    elsif p_kind = 'goal_contributions_family' then
      select count(*)::integer into v_n from (
        select 1 from public.goal_contributions c
        where c.created_by = p_created_by and c.created_at > now() - interval '1 hour'
        limit v_max_hour) s;
    elsif p_kind = 'settlements' then
      select count(*)::integer into v_n from (
        select 1 from public.settlements s2
        where s2.created_by = p_created_by and s2.created_at > now() - interval '1 hour'
        limit v_max_hour) s;
    else
      return;
    end if;
    if v_n >= v_max_hour then
      raise exception 'RATE_LIMITED' using errcode = 'P0001';
    end if;
  end if;
end;
$$;
revoke execute on function private.enforce_volume_limit(text, uuid, uuid, uuid, boolean) from public, anon, authenticated;

-- Triggers (before insert, novos) ------------------------------------------------------------------------------------------
create function private.transactions_volume_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.enforce_volume_limit('transactions', new.family_id, null, new.created_by, new.recurrence_id is null);
  return new;
end;
$$;
revoke execute on function private.transactions_volume_check() from public, anon, authenticated;

create trigger transactions_volume_bi
  before insert on public.transactions
  for each row execute function private.transactions_volume_check();

create function private.goal_contributions_volume_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- teto por meta (sem frequência) e teto por família (com frequência por usuário)
  perform private.enforce_volume_limit('goal_contributions_goal', new.family_id, new.goal_id, new.created_by, false);
  perform private.enforce_volume_limit('goal_contributions_family', new.family_id, null, new.created_by, true);
  return new;
end;
$$;
revoke execute on function private.goal_contributions_volume_check() from public, anon, authenticated;

create trigger goal_contributions_volume_bi
  before insert on public.goal_contributions
  for each row execute function private.goal_contributions_volume_check();

create function private.settlements_volume_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.enforce_volume_limit('settlements', new.family_id, null, new.created_by, true);
  return new;
end;
$$;
revoke execute on function private.settlements_volume_check() from public, anon, authenticated;

create trigger settlements_volume_bi
  before insert on public.settlements
  for each row execute function private.settlements_volume_check();

-- Índices da frequência (teste (b)) -----------------------------------------------------------------------------------------
-- Consulta que cada um serve (em enforce_volume_limit): where created_by = $1 and created_at > now() - interval '1 hour' [and recurrence_id is null].
-- Os índices por família/meta que sustentam (a) já existem: transactions_family_date_idx, goal_contributions_goal_date_idx e
-- settlements_family_date_idx (todos parciais em deleted_at is null). Para goal_contributions por família não há índice
-- parcial dedicado: a contagem limitada usa o prefixo family_id de goal_contributions_family_idempotency_key (unique) e filtra
-- deleted_at na tabela; custo O(até 50000) só perto do teto.
create index transactions_created_by_created_at_idx
  on public.transactions (created_by, created_at) where recurrence_id is null;
create index goal_contributions_created_by_created_at_idx
  on public.goal_contributions (created_by, created_at);
create index settlements_created_by_created_at_idx
  on public.settlements (created_by, created_at);

-- Estado do intervalo mínimo de refresh_notifications ----------------------------------------------------------------------
create table private.notification_refresh_state (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_run_at timestamptz not null
);
revoke all on private.notification_refresh_state from public, anon, authenticated;
alter table private.notification_refresh_state enable row level security;

-- refresh_notifications ----------------------------------------------------------------------------------------------------
-- Corpo copiado de 20261024102000_etapa7_notifications.sql; as ÚNICAS mudanças (marcadas com "ETAPA 9") são:
--   (a) gate atômico de 30 s por usuário, que pula SÓ a geração;
--   (b) a limpeza continua em toda chamada (CA-E7-54: a notificação de compromisso pago some na carga seguinte);
--   (c) teto de notificações por usuário (volume_limits 'notifications_user', 500) aplicado depois da limpeza: v_left =
--       least(100, greatest(0, teto - existentes)); o teto de 100 por chamada (d) continua.
-- Mesma assinatura (sem parâmetros, integer): create or replace preserva os grants; repetidos abaixo por clareza.
create or replace function public.refresh_notifications() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_member_id uuid;
  v_role text;
  v_joined timestamptz;
  v_manage boolean;
  v_today date := private.today();
  v_month date := date_trunc('month', private.today()::timestamp)::date;
  v_since timestamptz;
  v_left integer := 0;        -- ETAPA 9: era 100; agora calculado depois do gate e da limpeza
  v_n integer;
  v_total integer := 0;
  v_ran integer;              -- ETAPA 9
  v_cap integer;              -- ETAPA 9
  v_existing integer;         -- ETAPA 9
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    return 0;
  end if;

  select m.id, m.role, m.joined_at into v_member_id, v_role, v_joined
  from public.family_members m
  where m.family_id = v_family and m.user_id = v_uid and m.status = 'active';
  if v_member_id is null then
    return 0;
  end if;
  v_manage := v_role in ('owner', 'admin');
  v_since := greatest(v_joined, now() - interval '30 days');

  -- uma chamada por usuário de cada vez (duas abas): a segunda espera e já encontra tudo criado
  perform pg_advisory_xact_lock(hashtextextended('refresh_notifications:' || v_uid::text, 0));

  -- Limpeza (só do chamador): lembrete de compromisso que não está mais pendente (pago, cancelado ou excluído) e qualquer
  -- notificação com mais de 90 dias. ETAPA 9 (b): roda sempre, mesmo dentro da janela do gate.
  delete from public.notifications n
  where n.user_id = v_uid
    and (
      n.created_at < now() - interval '90 days'
      or (
        n.type in ('bill_due_soon', 'bill_overdue')
        and not exists (
          select 1 from public.transactions t
          where t.id = n.entity_id and t.family_id = n.family_id
            and t.status = 'pending' and t.deleted_at is null
        )
      )
    );

  -- ETAPA 9 (a): gate de 30 s. O upsert condicional é atômico: sem linha retornada, a geração é pulada (retorna 0). O advisory
  -- lock acima já serializa as chamadas do mesmo usuário; o upsert é a fonte da verdade do intervalo e é desfeito se a
  -- geração falhar (mesma transação). Outro usuário tem outra linha e não é afetado.
  insert into private.notification_refresh_state as s (user_id, last_run_at)
  values (v_uid, now())
  on conflict (user_id) do update set last_run_at = now()
    where s.last_run_at <= now() - interval '30 seconds'
  returning 1 into v_ran;
  if v_ran is null then
    return 0;
  end if;

  -- ETAPA 9 (c): teto por usuário, depois da limpeza; contagem limitada ao teto. Nunca negativo.
  select coalesce((select l.max_active from private.volume_limits l where l.kind = 'notifications_user'), 500)
    into v_cap;
  select count(*)::integer into v_existing from (
    select 1 from public.notifications n where n.user_id = v_uid limit v_cap) s2;
  v_left := least(100, greatest(0, v_cap - v_existing));

  -- 1. bill_overdue: pendente de receita/despesa com vencimento em [hoje − 30, hoje − 1] que o chamador pode pagar.
  --    O "ainda não existe" fica no SELECT (e não só no ON CONFLICT) para o teto de 100 contar apenas inserções novas.
  if v_left > 0 then
    with cand as (
      select t.id, t.type as kind, t.description, t.amount, t.transaction_date as due,
             'bill_overdue:' || t.id::text || ':' || to_char(t.transaction_date, 'YYYY-MM-DD') as dkey
      from public.transactions t
      where t.family_id = v_family
        and t.status = 'pending' and t.deleted_at is null and t.type in ('income', 'expense')
        and t.transaction_date between v_today - 30 and v_today - 1
        and (v_manage or t.created_by = v_uid or t.assigned_member_id = v_member_id)
    ), ins as (
      insert into public.notifications (family_id, user_id, type, entity_type, entity_id, data, dedupe_key)
      select v_family, v_uid, 'bill_overdue', 'transaction', c.id,
             jsonb_build_object('kind', c.kind, 'description', c.description, 'amount', c.amount::text,
                                'due_date', to_char(c.due, 'YYYY-MM-DD')),
             c.dkey
      from cand c
      where not exists (select 1 from public.notifications n where n.user_id = v_uid and n.dedupe_key = c.dkey)
      order by c.due, c.id
      limit v_left
      on conflict (user_id, dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_n from ins;
    v_total := v_total + v_n;
    v_left := v_left - v_n;
  end if;

  -- 2. bill_due_soon: pendente de receita/despesa com vencimento em [hoje, hoje + 3] que o chamador pode pagar.
  if v_left > 0 then
    with cand as (
      select t.id, t.type as kind, t.description, t.amount, t.transaction_date as due,
             'bill_due_soon:' || t.id::text || ':' || to_char(t.transaction_date, 'YYYY-MM-DD') as dkey
      from public.transactions t
      where t.family_id = v_family
        and t.status = 'pending' and t.deleted_at is null and t.type in ('income', 'expense')
        and t.transaction_date between v_today and v_today + 3
        and (v_manage or t.created_by = v_uid or t.assigned_member_id = v_member_id)
    ), ins as (
      insert into public.notifications (family_id, user_id, type, entity_type, entity_id, data, dedupe_key)
      select v_family, v_uid, 'bill_due_soon', 'transaction', c.id,
             jsonb_build_object('kind', c.kind, 'description', c.description, 'amount', c.amount::text,
                                'due_date', to_char(c.due, 'YYYY-MM-DD')),
             c.dkey
      from cand c
      where not exists (select 1 from public.notifications n where n.user_id = v_uid and n.dedupe_key = c.dkey)
      order by c.due, c.id
      limit v_left
      on conflict (user_id, dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_n from ins;
    v_total := v_total + v_n;
    v_left := v_left - v_n;
  end if;

  -- 3. budget_near_limit: orçamento não arquivado vigente no mês de hoje com realizado >= 80% do limite (budget_progress).
  --    Comparação exata em numeric (spent·100 >= limite·80); percent = piso do realizado / limite.
  if v_left > 0 then
    with bp as (
      select p.budget_id, p.spent as spent_txt, p.spent::numeric as spent_n
      from public.budget_progress(v_month, v_month) p
    ), cand as (
      select b.id, b.created_at, bp.spent_txt, b.amount_limit, c.name as category_name,
             floor(bp.spent_n * 100 / b.amount_limit)::bigint as pct,
             'budget_near_limit:' || b.id::text || ':' || to_char(v_month, 'YYYY-MM') as dkey
      from bp
      join public.budgets b on b.id = bp.budget_id and b.family_id = v_family
      left join public.categories c on c.id = b.category_id and c.family_id = b.family_id
      where b.archived_at is null
        and bp.spent_n * 100 >= b.amount_limit * 80
    ), ins as (
      insert into public.notifications (family_id, user_id, type, entity_type, entity_id, data, dedupe_key)
      select v_family, v_uid, 'budget_near_limit', 'budget', c.id,
             jsonb_build_object('category_name', c.category_name, 'month', to_char(v_month, 'YYYY-MM'),
                                'spent', c.spent_txt, 'limit', c.amount_limit::text, 'percent', c.pct),
             c.dkey
      from cand c
      where not exists (select 1 from public.notifications n where n.user_id = v_uid and n.dedupe_key = c.dkey)
      order by c.created_at, c.id
      limit v_left
      on conflict (user_id, dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_n from ins;
    v_total := v_total + v_n;
    v_left := v_left - v_n;
  end if;

  -- 4. goal_near_target: meta ativa com 80% <= acumulado/alvo < 100% (goal_summary; o acumulado independe do intervalo).
  --    A chave leva o alvo em centavos: mudar o alvo e voltar a 80% gera um aviso novo.
  if v_left > 0 then
    with cand as (
      select g.id, g.created_at, g.name, g.target_amount, s.saved as saved_txt,
             floor(s.saved::numeric * 100 / g.target_amount)::bigint as pct,
             'goal_near_target:' || g.id::text || ':' || round(g.target_amount * 100)::bigint::text as dkey
      from public.goal_summary(v_today, v_today) s
      join public.goals g on g.id = s.goal_id and g.family_id = v_family
      where g.status = 'active'
        and s.saved::numeric * 100 >= g.target_amount * 80
        and s.saved::numeric < g.target_amount
    ), ins as (
      insert into public.notifications (family_id, user_id, type, entity_type, entity_id, data, dedupe_key)
      select v_family, v_uid, 'goal_near_target', 'goal', c.id,
             jsonb_build_object('name', c.name, 'saved', c.saved_txt, 'target', c.target_amount::text, 'percent', c.pct),
             c.dkey
      from cand c
      where not exists (select 1 from public.notifications n where n.user_id = v_uid and n.dedupe_key = c.dkey)
      order by c.created_at, c.id
      limit v_left
      on conflict (user_id, dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_n from ins;
    v_total := v_total + v_n;
    v_left := v_left - v_n;
  end if;

  -- 5a. financial_event (lançamento): receita/despesa não excluída nem cancelada, que NÃO veio de série, em que o chamador é o
  --     responsável e que outra pessoa criou, criada "desde".
  if v_left > 0 then
    with cand as (
      select t.id, t.type as kind, t.description, t.amount, t.transaction_date as tdate, t.status as tstatus,
             t.created_at,
             'financial_event:' || t.id::text || ':assigned' as dkey
      from public.transactions t
      where t.family_id = v_family
        and t.deleted_at is null and t.status <> 'canceled'
        and t.type in ('income', 'expense')
        and t.recurrence_id is null
        and t.assigned_member_id = v_member_id
        and t.created_by <> v_uid
        and t.created_at >= v_since
    ), ins as (
      insert into public.notifications (family_id, user_id, type, entity_type, entity_id, data, dedupe_key)
      select v_family, v_uid, 'financial_event', 'transaction', c.id,
             jsonb_build_object('kind', c.kind, 'description', c.description, 'amount', c.amount::text,
                                'date', to_char(c.tdate, 'YYYY-MM-DD'), 'status', c.tstatus),
             c.dkey
      from cand c
      where not exists (select 1 from public.notifications n where n.user_id = v_uid and n.dedupe_key = c.dkey)
      order by c.created_at, c.id
      limit v_left
      on conflict (user_id, dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_n from ins;
    v_total := v_total + v_n;
    v_left := v_left - v_n;
  end if;

  -- 5b. financial_event (liquidação): acerto não excluído em que o chamador é parte, criado por outra pessoa, criado "desde".
  if v_left > 0 then
    with cand as (
      select s.id, s.amount, s.settlement_date as sdate, s.created_at,
             case when s.to_member_id = v_member_id then 'to_me' else 'from_me' end as direction,
             'financial_event:' || s.id::text || ':settlement' as dkey
      from public.settlements s
      where s.family_id = v_family
        and s.deleted_at is null
        and (s.from_member_id = v_member_id or s.to_member_id = v_member_id)
        and s.created_by <> v_uid
        and s.created_at >= v_since
    ), ins as (
      insert into public.notifications (family_id, user_id, type, entity_type, entity_id, data, dedupe_key)
      select v_family, v_uid, 'financial_event', 'settlement', c.id,
             jsonb_build_object('amount', c.amount::text, 'settlement_date', to_char(c.sdate, 'YYYY-MM-DD'),
                                'direction', c.direction),
             c.dkey
      from cand c
      where not exists (select 1 from public.notifications n where n.user_id = v_uid and n.dedupe_key = c.dkey)
      order by c.created_at, c.id
      limit v_left
      on conflict (user_id, dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_n from ins;
    v_total := v_total + v_n;
    v_left := v_left - v_n;
  end if;

  -- 6. member_joined: vínculos ativos de outras pessoas com entrada "desde" (quem entrou antes de mim não gera aviso).
  if v_left > 0 then
    with cand as (
      select m.id, m.role as mrole, m.joined_at,
             'member_joined:' || m.id::text as dkey
      from public.family_members m
      where m.family_id = v_family
        and m.status = 'active'
        and m.id <> v_member_id
        and m.joined_at >= v_since
    ), ins as (
      insert into public.notifications (family_id, user_id, type, entity_type, entity_id, data, dedupe_key)
      select v_family, v_uid, 'member_joined', 'family_member', c.id,
             jsonb_build_object('role', c.mrole),
             c.dkey
      from cand c
      where not exists (select 1 from public.notifications n where n.user_id = v_uid and n.dedupe_key = c.dkey)
      order by c.joined_at, c.id
      limit v_left
      on conflict (user_id, dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_n from ins;
    v_total := v_total + v_n;
    v_left := v_left - v_n;
  end if;

  return v_total;
end;
$$;

revoke execute on function public.refresh_notifications() from public, anon;
grant execute on function public.refresh_notifications() to authenticated;

-- DOWN (manual), nesta ordem:
--   1. Restaurar o corpo anterior de refresh_notifications(): reexecutar o `create or replace function public.refresh_notifications()`
--      de 20261024102000_etapa7_notifications.sql (sem gate e sem teto). Só depois dropar as tabelas abaixo.
--   2. drop trigger transactions_volume_bi on public.transactions; drop trigger goal_contributions_volume_bi on public.goal_contributions;
--      drop trigger settlements_volume_bi on public.settlements;
--      drop function private.transactions_volume_check(); drop function private.goal_contributions_volume_check();
--      drop function private.settlements_volume_check(); drop function private.enforce_volume_limit(text, uuid, uuid, uuid, boolean);
--   3. drop index public.transactions_created_by_created_at_idx; drop index public.goal_contributions_created_by_created_at_idx;
--      drop index public.settlements_created_by_created_at_idx;
--   4. drop table private.notification_refresh_state; drop table private.volume_limits.
--   Nada disto apaga dado de negócio (as tabelas private só guardam configuração e estado do intervalo).
-- Efeito em dados existentes: nenhum (nenhuma linha de transactions, goal_contributions, settlements ou notifications é lida ou
--   escrita pela migration). Famílias que JÁ estejam acima de um teto continuam com os dados, mas não conseguem inserir novas
--   linhas até excluir (volume) ou esperar a janela (frequência) — nenhuma conhecida em produção; volume real não medido aqui.
--   Notificações: usuário com mais de 500 existentes insere 0 até a limpeza reduzir (nunca apaga por causa do teto).
-- Lock: CREATE TABLE/TRIGGER/FUNCTION são breves. CREATE INDEX (não concorrente: a CLI roda cada migration numa transação) toma
--   SHARE na tabela e bloqueia ESCRITA enquanto constrói; o tempo depende do volume, que não foi medido neste ambiente (app
--   com poucas famílias). CREATE TRIGGER exige SHARE ROW EXCLUSIVE em cada uma das três tabelas, também breve.
-- EXPLAIN (pendente, exige banco): ver docs/log-execucao.md, seção Etapa 9 · M1, com as três consultas a rodar.
