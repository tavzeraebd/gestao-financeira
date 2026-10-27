-- Núcleo · Etapa 6 · metas e aportes (D9; ADR-0025). Contrato: docs/contracts/etapa-6.md §3.1.
-- Aporte é reserva registrada: sem lançamento vinculado, não move dinheiro nem altera saldo.
-- Erros dos triggers: P0001 com mensagem = código; 42501 = FORBIDDEN.

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  name text not null
    constraint goals_name_check check (char_length(btrim(name)) between 1 and 80),
  description text null
    constraint goals_description_check check (description is null or char_length(description) <= 500),
  target_amount numeric(14, 2) not null
    constraint goals_target_amount_check check (target_amount > 0 and target_amount <> 'NaN'::numeric and target_amount <= 99999999.99),
  target_date date null
    constraint goals_target_date_check check (target_date is null or target_date >= date '2000-01-01'),
  icon text not null default 'target'
    constraint goals_icon_check check (icon in ('target', 'plane', 'house', 'car', 'shield', 'graduation-cap',
      'heart-pulse', 'gift', 'baby', 'briefcase', 'laptop', 'piggy-bank')),
  status text not null default 'active'
    constraint goals_status_check check (status in ('active', 'paused', 'completed', 'canceled')),
  completed_at timestamptz null,  -- do banco: fora dos grants
  idempotency_key uuid null,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_family_id_id_key unique (family_id, id),  -- alvo da FK de goal_contributions
  constraint goals_family_idempotency_key unique (family_id, idempotency_key),
  constraint goals_completed_shape_check check ((status = 'completed') = (completed_at is not null))
);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function private.set_updated_at();

alter table public.goals enable row level security;
revoke all on public.goals from anon, authenticated;
grant select on public.goals to authenticated;
grant insert (family_id, name, description, target_amount, target_date, icon, idempotency_key)
  on public.goals to authenticated;
grant update (name, description, target_amount, target_date, icon, status) on public.goals to authenticated;
-- sem delete: a meta se cancela

create policy goals_select on public.goals
  for select to authenticated
  using (private.is_family_member(family_id));

create policy goals_insert on public.goals
  for insert to authenticated
  with check (private.has_family_role(family_id, array['owner', 'admin']) and created_by = (select auth.uid()));

create policy goals_update on public.goals
  for update to authenticated
  using (private.has_family_role(family_id, array['owner', 'admin']))
  with check (private.has_family_role(family_id, array['owner', 'admin']));

-- Transições de status (invoker). Concluída e cancelada são finais: qualquer update é rejeitado.
create function private.goals_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status in ('completed', 'canceled') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status = 'active' and new.status in ('paused', 'completed', 'canceled'))
      or (old.status = 'paused' and new.status in ('active', 'completed', 'canceled'))
    ) then
      raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
    end if;
    if new.status = 'completed' then
      new.completed_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.goals_before_update() from public, anon, authenticated;

create trigger goals_before_update_bu
  before update on public.goals
  for each row execute function private.goals_before_update();

-- Auditoria (security definer). Nome, descrição e ícone não são auditados.
create function private.goals_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_changed text[] := '{}';
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if new.status is distinct from old.status then
    perform private.log_audit(new.family_id, 'goal', new.id, 'goal.status_changed',
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.target_amount is distinct from old.target_amount then
    v_changed := array_append(v_changed, 'target_amount');
    v_old := v_old || jsonb_build_object('target_amount', old.target_amount::text);
    v_new := v_new || jsonb_build_object('target_amount', new.target_amount::text);
  end if;
  if new.target_date is distinct from old.target_date then
    v_changed := array_append(v_changed, 'target_date');
    v_old := v_old || jsonb_build_object('target_date', to_char(old.target_date, 'YYYY-MM-DD'));
    v_new := v_new || jsonb_build_object('target_date', to_char(new.target_date, 'YYYY-MM-DD'));
  end if;
  if cardinality(v_changed) > 0 then
    perform private.log_audit(new.family_id, 'goal', new.id, 'goal.updated',
      jsonb_build_object('changed', to_jsonb(v_changed), 'old', v_old, 'new', v_new));
  end if;
  return null;
end;
$$;
revoke execute on function private.goals_after_update() from public, anon, authenticated;

create trigger goals_after_update_au
  after update on public.goals
  for each row execute function private.goals_after_update();

-- Aportes e retiradas ------------------------------------------------------------------------------------------------
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  goal_id uuid not null,
  member_id uuid not null,
  kind text not null
    constraint goal_contributions_kind_check check (kind in ('deposit', 'withdrawal')),
  amount numeric(14, 2) not null
    constraint goal_contributions_amount_check check (amount > 0 and amount <> 'NaN'::numeric and amount <= 99999999.99),
  contribution_date date not null
    constraint goal_contributions_date_check check (contribution_date >= date '2000-01-01'),
  notes text null
    constraint goal_contributions_notes_check check (notes is null or char_length(notes) <= 500),
  idempotency_key uuid null,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  deleted_at timestamptz null,
  deleted_by uuid null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_contributions_family_idempotency_key unique (family_id, idempotency_key),
  constraint goal_contributions_deleted_shape_check check ((deleted_at is null) = (deleted_by is null)),
  constraint goal_contributions_goal_fk foreign key (family_id, goal_id)
    references public.goals (family_id, id) on delete restrict,
  constraint goal_contributions_member_fk foreign key (family_id, member_id)
    references public.family_members (family_id, id) on delete restrict
);

-- goal_summary (acumulado por meta) e histórico paginado da meta, mais recentes primeiro.
create index goal_contributions_goal_date_idx
  on public.goal_contributions (goal_id, contribution_date desc) where deleted_at is null;

create trigger goal_contributions_set_updated_at
  before update on public.goal_contributions
  for each row execute function private.set_updated_at();

alter table public.goal_contributions enable row level security;
revoke all on public.goal_contributions from anon, authenticated;
grant select on public.goal_contributions to authenticated;
grant insert (family_id, goal_id, member_id, kind, amount, contribution_date, notes, idempotency_key)
  on public.goal_contributions to authenticated;
grant update (deleted_at) on public.goal_contributions to authenticated;
-- sem delete: o aporte se exclui logicamente

create policy goal_contributions_select on public.goal_contributions
  for select to authenticated
  using (private.is_family_member(family_id));

create policy goal_contributions_insert on public.goal_contributions
  for insert to authenticated
  with check (private.is_family_member(family_id) and created_by = (select auth.uid()));

create policy goal_contributions_update on public.goal_contributions
  for update to authenticated
  using (
    deleted_at is null
    and (
      private.has_family_role(family_id, array['owner', 'admin'])
      or (created_by = (select auth.uid()) and private.is_family_member(family_id))
    )
  )
  with check (
    private.has_family_role(family_id, array['owner', 'admin'])
    or (created_by = (select auth.uid()) and private.is_family_member(family_id))
  );

-- Invariantes (invoker: a RLS do chamador vale; meta ou integrante de outra família é invisível e a FK responde 23503).
-- Acumulado sob lock da meta (advisory) para duas retiradas concorrentes não passarem juntas.
create function private.goal_contributions_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_goal public.goals;
  v_member public.family_members;
  v_saved numeric;
begin
  if tg_op = 'INSERT' then
    select * into v_goal from public.goals g where g.id = new.goal_id and g.family_id = new.family_id;
    if v_goal.id is not null and v_goal.status <> 'active' then
      raise exception 'GOAL_NOT_ACTIVE' using errcode = 'P0001';
    end if;

    select * into v_member from public.family_members m where m.id = new.member_id and m.family_id = new.family_id;
    if v_member.id is not null and v_member.status <> 'active' then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;

    if not private.has_family_role(new.family_id, array['owner', 'admin'])
       and new.member_id is distinct from private.current_member_id() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if new.contribution_date > private.today() then
      raise exception 'FUTURE_DATE_NOT_ALLOWED' using errcode = 'P0001';
    end if;

    if new.kind = 'withdrawal' then
      perform pg_advisory_xact_lock(hashtextextended('goal:' || new.goal_id::text, 0));
      select coalesce(sum(case c.kind when 'deposit' then c.amount else -c.amount end), 0) into v_saved
      from public.goal_contributions c
      where c.goal_id = new.goal_id and c.family_id = new.family_id and c.deleted_at is null;
      if v_saved - new.amount < 0 then
        raise exception 'GOAL_NEGATIVE_PROGRESS' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: só a exclusão lógica (deleted_at de nulo para não nulo); o banco fixa quando e por quem.
  if old.deleted_at is not null or new.deleted_at is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if old.kind = 'deposit' then
    perform pg_advisory_xact_lock(hashtextextended('goal:' || old.goal_id::text, 0));
    select coalesce(sum(case c.kind when 'deposit' then c.amount else -c.amount end), 0) into v_saved
    from public.goal_contributions c
    where c.goal_id = old.goal_id and c.family_id = old.family_id and c.deleted_at is null;
    if v_saved - old.amount < 0 then
      raise exception 'GOAL_NEGATIVE_PROGRESS' using errcode = 'P0001';
    end if;
  end if;
  new.deleted_at := now();
  new.deleted_by := auth.uid();
  return new;
end;
$$;
revoke execute on function private.goal_contributions_before_write() from public, anon, authenticated;

create trigger goal_contributions_before_write_biu
  before insert or update on public.goal_contributions
  for each row execute function private.goal_contributions_before_write();

create function private.goal_contributions_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    perform private.log_audit(new.family_id, 'goal_contribution', new.id, 'goal_contribution.deleted',
      jsonb_build_object('goal_id', new.goal_id, 'kind', new.kind, 'amount', new.amount::text));
  end if;
  return null;
end;
$$;
revoke execute on function private.goal_contributions_after_update() from public, anon, authenticated;

create trigger goal_contributions_after_update_au
  after update on public.goal_contributions
  for each row execute function private.goal_contributions_after_update();

-- DOWN (manual): drop table public.goal_contributions; drop table public.goals (apagam metas e aportes: destrutivo, só com
--   autorização); drop function private.goal_contributions_after_update(); drop function private.goal_contributions_before_write();
--   drop function private.goals_after_update(); drop function private.goals_before_update().
-- Efeito em dados existentes: nenhum (tabelas novas).
