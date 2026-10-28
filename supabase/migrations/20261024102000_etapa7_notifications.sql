-- Núcleo · Etapa 7 · central de notificações: tabela notifications + refresh_notifications(). Contrato: docs/contracts/etapa-7.md §3.1;
-- ADR-0029; AB-114..116. Erros: P0001 com mensagem = código; 42501 = FORBIDDEN.
-- A notificação é por USUÁRIO e família, um instantâneo (texto e link são montados no app a partir de type/entity/data).
-- Ninguém insere nem apaga pela API: só refresh_notifications() (security definer, sem parâmetros) cria e limpa, e só para o
-- próprio chamador. O app lê e marca como lida (grant update só em read_at).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  type text not null
    constraint notifications_type_check check (type in ('bill_due_soon', 'bill_overdue', 'goal_near_target',
      'budget_near_limit', 'member_joined', 'financial_event')),
  entity_type text not null
    constraint notifications_entity_type_check check (entity_type in ('transaction', 'goal', 'budget', 'family_member', 'settlement')),
  entity_id uuid not null,  -- sem FK: a notificação não bloqueia nada; o app trata entidade ausente
  data jsonb not null default '{}'::jsonb
    constraint notifications_data_check check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 2048),
  dedupe_key text not null
    constraint notifications_dedupe_key_check check (dedupe_key ~ '^[a-z_]{1,40}:[0-9a-f-]{36}(:[0-9a-z-]{1,20})?$'),
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  -- idempotência de refresh_notifications (on conflict do nothing); também serve ao "ainda não existe" do refresh
  constraint notifications_user_dedupe_key unique (user_id, dedupe_key)
);

-- Central: listagem paginada do usuário, mais recentes primeiro (listNotifications) e limpeza por idade (refresh).
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
-- Contador do sino: getUnreadNotificationCount (count head) e "marcar todas como lidas" olham só as não lidas.
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- sem insert e sem delete pela API

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_family_member(family_id));

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and private.is_family_member(family_id))
  with check (user_id = (select auth.uid()) and private.is_family_member(family_id));

-- read_at: quem lê não "desmarca" (valor antigo não nulo é preservado) e o banco fixa o instante (o cliente não escolhe a data).
create function private.notifications_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.read_at is not null then
    new.read_at := old.read_at;
  elsif new.read_at is not null then
    new.read_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function private.notifications_before_update() from public, anon, authenticated;

create trigger notifications_before_update_bu
  before update on public.notifications
  for each row execute function private.notifications_before_update();

-- refresh_notifications ------------------------------------------------------------------------------------------------
-- Gera só para o chamador, na família dele (sem parâmetros: nada a forjar nem a sondar), idempotente, com teto de 100
-- inserções por chamada, na ordem da tabela do contrato. "Pode pagar" = owner/admin, autor ou responsável (regra de
-- pay_pending_transaction). "Desde" = greatest(joined_at do chamador, now() − 30 dias). Devolve quantas criou.
-- Roda como dono (lê tudo da família sem passar pela RLS): por isso TODA consulta filtra family_id = família do chamador.
-- budget_progress e goal_summary são funções invoker que filtram por private.current_family_id() (= a mesma família).
create function public.refresh_notifications() returns integer
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
  v_left integer := 100;
  v_n integer;
  v_total integer := 0;
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
  -- notificação com mais de 90 dias.
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

-- DOWN (manual): drop function public.refresh_notifications(); drop trigger notifications_before_update_bu on public.notifications;
--   drop function private.notifications_before_update(); drop table public.notifications (apaga as notificações: dado derivado e
--   regenerável por refresh_notifications; ainda assim, destrutivo, só com autorização).
-- Efeito em dados existentes: nenhum (tabela e funções novas; nada é gerado pela migration, só no primeiro refresh de cada usuário).
-- Lock: CREATE TABLE/INDEX em tabela nova, instantâneo. refresh_notifications lê transactions pelo índice
--   transactions_pending_date_idx (vencimentos) e transactions_family_date_idx; volume real não medido neste ambiente.
