-- Núcleo · Etapa 6 · liquidações entre integrantes (D10; ADR-0026). Contrato: docs/contracts/etapa-6.md §3.1.
-- A liquidação registra um pagamento entre integrantes: não altera conta nem consolidado.
-- Integrantes inativos são aceitos (dívida histórica). Erros: P0001 com mensagem = código.

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  from_member_id uuid not null,
  to_member_id uuid not null,
  amount numeric(14, 2) not null
    constraint settlements_amount_check check (amount > 0 and amount <> 'NaN'::numeric and amount <= 99999999.99),
  settlement_date date not null
    constraint settlements_date_check check (settlement_date >= date '2000-01-01'),
  notes text null
    constraint settlements_notes_check check (notes is null or char_length(notes) <= 500),
  idempotency_key uuid null,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  deleted_at timestamptz null,
  deleted_by uuid null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlements_family_idempotency_key unique (family_id, idempotency_key),
  constraint settlements_members_check check (from_member_id <> to_member_id),
  constraint settlements_deleted_shape_check check ((deleted_at is null) = (deleted_by is null)),
  constraint settlements_from_member_fk foreign key (family_id, from_member_id)
    references public.family_members (family_id, id) on delete restrict,
  constraint settlements_to_member_fk foreign key (family_id, to_member_id)
    references public.family_members (family_id, id) on delete restrict
);

-- listSettlements: acertos da família, mais recentes primeiro.
create index settlements_family_date_idx on public.settlements (family_id, settlement_date desc) where deleted_at is null;

create trigger settlements_set_updated_at
  before update on public.settlements
  for each row execute function private.set_updated_at();

alter table public.settlements enable row level security;
revoke all on public.settlements from anon, authenticated;
grant select on public.settlements to authenticated;
grant insert (family_id, from_member_id, to_member_id, amount, settlement_date, notes, idempotency_key)
  on public.settlements to authenticated;
grant update (deleted_at) on public.settlements to authenticated;
-- sem delete: o acerto se exclui logicamente

create policy settlements_select on public.settlements
  for select to authenticated
  using (private.is_family_member(family_id));

create policy settlements_insert on public.settlements
  for insert to authenticated
  with check (
    private.is_family_member(family_id)
    and created_by = (select auth.uid())
    and (
      private.has_family_role(family_id, array['owner', 'admin'])
      or from_member_id = private.current_member_id()
      or to_member_id = private.current_member_id()
    )
  );

create policy settlements_update on public.settlements
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

create function private.settlements_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.settlement_date > private.today() then
      raise exception 'FUTURE_DATE_NOT_ALLOWED' using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- UPDATE: só a exclusão lógica; o banco fixa quando e por quem.
  if old.deleted_at is not null or new.deleted_at is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  new.deleted_at := now();
  new.deleted_by := auth.uid();
  return new;
end;
$$;
revoke execute on function private.settlements_before_write() from public, anon, authenticated;

create trigger settlements_before_write_biu
  before insert or update on public.settlements
  for each row execute function private.settlements_before_write();

create function private.settlements_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_audit(new.family_id, 'settlement', new.id, 'settlement.created',
      jsonb_build_object('amount', new.amount::text, 'settlement_date', to_char(new.settlement_date, 'YYYY-MM-DD')));
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform private.log_audit(new.family_id, 'settlement', new.id, 'settlement.deleted',
      jsonb_build_object('amount', new.amount::text, 'settlement_date', to_char(new.settlement_date, 'YYYY-MM-DD')));
  end if;
  return null;
end;
$$;
revoke execute on function private.settlements_audit() from public, anon, authenticated;

create trigger settlements_audit_aiu
  after insert or update on public.settlements
  for each row execute function private.settlements_audit();

-- DOWN (manual): drop table public.settlements (apaga acertos: destrutivo, só com autorização);
--   drop function private.settlements_audit(); drop function private.settlements_before_write().
-- Efeito em dados existentes: nenhum (tabela nova).
