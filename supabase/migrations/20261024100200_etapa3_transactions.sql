-- Núcleo · Etapa 3 · lançamentos (transactions): RLS direta + triggers de invariantes + auditoria.
-- Contrato: docs/contracts/etapa-3.md §3.1; ADR-0018 (transferência em uma linha, estorno por trigger, sem RPC de escrita).
-- Erros dos triggers: P0001 com mensagem = código; 42501 = FORBIDDEN.

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  type text not null  -- imutável: fora do grant de update
    constraint transactions_type_check check (type in ('income', 'expense', 'transfer')),
  account_id uuid not null,
  destination_account_id uuid null,
  category_id uuid null,
  assigned_member_id uuid null,
  created_by uuid not null default auth.uid(),
  description text not null
    constraint transactions_description_check check (char_length(btrim(description)) between 1 and 120),
  amount numeric(14, 2) not null
    constraint transactions_amount_check check (amount > 0),
  transaction_date date not null,
  due_date date null,  -- Etapa 5
  status text not null default 'paid'
    constraint transactions_status_check check (status in ('pending', 'paid', 'canceled')),
  notes text null
    constraint transactions_notes_check check (notes is null or char_length(notes) <= 1000),
  reversal_of_id uuid null,
  idempotency_key uuid null,
  deleted_at timestamptz null,
  deleted_by uuid null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_family_id_id_key unique (family_id, id),  -- alvo da FK de estorno
  constraint transactions_family_idempotency_key unique (family_id, idempotency_key),
  -- FKs compostas (family_id, x_id): a linha só referencia objetos da própria família
  constraint transactions_account_fk foreign key (family_id, account_id)
    references public.accounts (family_id, id) on delete restrict,
  constraint transactions_destination_account_fk foreign key (family_id, destination_account_id)
    references public.accounts (family_id, id) on delete restrict,
  constraint transactions_category_fk foreign key (family_id, category_id)
    references public.categories (family_id, id) on delete restrict,
  constraint transactions_assigned_member_fk foreign key (family_id, assigned_member_id)
    references public.family_members (family_id, id) on delete restrict,
  constraint transactions_reversal_of_fk foreign key (family_id, reversal_of_id)
    references public.transactions (family_id, id) on delete restrict,
  constraint transactions_created_by_fk foreign key (created_by)
    references public.profiles (id) on delete restrict,
  constraint transactions_transfer_shape_check check ((type = 'transfer') = (destination_account_id is not null)),
  constraint transactions_destination_differs_check check (
    destination_account_id is null or destination_account_id <> account_id
  ),
  constraint transactions_category_shape_check check ((type in ('income', 'expense')) = (category_id is not null)),
  constraint transactions_deleted_check check ((deleted_at is null) = (deleted_by is null))
);

-- Listagem da família, mais recentes primeiro (/transacoes sem filtro; exclui os excluídos).
create index transactions_family_date_idx
  on public.transactions (family_id, transaction_date desc, created_at desc) where deleted_at is null;
-- Saldo por conta (account_balances), filtro por conta e trigger de data do saldo inicial.
create index transactions_account_date_idx on public.transactions (account_id, transaction_date);
-- Saldo do destino das transferências.
create index transactions_destination_date_idx
  on public.transactions (destination_account_id, transaction_date) where destination_account_id is not null;
-- Filtro por categoria e período.
create index transactions_category_date_idx on public.transactions (family_id, category_id, transaction_date);
-- Filtro por responsável.
create index transactions_assigned_member_idx on public.transactions (family_id, assigned_member_id);
-- Estornos de um original (trigger de estorno, soma e bloqueios).
create index transactions_reversal_of_idx on public.transactions (reversal_of_id) where reversal_of_id is not null;

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function private.set_updated_at();

alter table public.transactions enable row level security;
revoke all on public.transactions from anon, authenticated;
grant select on public.transactions to authenticated;
grant insert (family_id, type, account_id, destination_account_id, category_id, assigned_member_id, description,
              amount, transaction_date, status, notes, reversal_of_id, idempotency_key)
  on public.transactions to authenticated;
grant update (account_id, destination_account_id, category_id, assigned_member_id, description, amount,
              transaction_date, notes, deleted_at)
  on public.transactions to authenticated;
-- sem delete: exclusão é lógica (deleted_at)

create policy transactions_select on public.transactions
  for select to authenticated
  using (private.is_family_member(family_id));

create policy transactions_insert on public.transactions
  for insert to authenticated
  with check (private.is_family_member(family_id) and created_by = (select auth.uid()));

-- Linha excluída não é atualizável: não existe "desexcluir".
create policy transactions_update on public.transactions
  for update to authenticated
  using (
    deleted_at is null
    and (private.has_family_role(family_id, array['owner', 'admin']) or created_by = (select auth.uid()))
  )
  with check (
    private.has_family_role(family_id, array['owner', 'admin']) or created_by = (select auth.uid())
  );

-- Invariantes ------------------------------------------------------------------------------------------------
-- Roda com o papel do chamador (RLS vale): referência de outra família é invisível e a checagem é pulada,
-- para a FK composta responder 23503 (BEFORE roda antes das FKs).
create function private.transactions_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_insert boolean := (tg_op = 'INSERT');
  v_acc public.accounts;
  v_dest public.accounts;
  v_cat public.categories;
  v_member public.family_members;
  v_orig public.transactions;
  v_reversed numeric;
begin
  if v_insert and new.status not in ('paid', 'pending') then
    raise exception 'transactions_status_insert_check' using errcode = '23514';
  end if;

  -- Exclusão lógica: o trigger fixa quem e quando; original com estorno ativo não pode ser excluído.
  if not v_insert and old.deleted_at is null and new.deleted_at is not null then
    if old.reversal_of_id is null and exists (
      select 1 from public.transactions r
      where r.reversal_of_id = old.id and r.family_id = old.family_id and r.deleted_at is null
    ) then
      raise exception 'TRANSACTION_HAS_REVERSALS' using errcode = 'P0001';
    end if;
    new.deleted_at := now();
    new.deleted_by := auth.uid();
    return new;
  end if;

  -- Campos financeiros travados: original com estorno ativo e o próprio estorno.
  if not v_insert and (
       new.amount is distinct from old.amount
    or new.transaction_date is distinct from old.transaction_date
    or new.account_id is distinct from old.account_id
    or new.category_id is distinct from old.category_id
  ) then
    if old.reversal_of_id is not null or exists (
      select 1 from public.transactions r
      where r.reversal_of_id = old.id and r.family_id = old.family_id and r.deleted_at is null
    ) then
      raise exception 'TRANSACTION_HAS_REVERSALS' using errcode = 'P0001';
    end if;
  end if;

  -- Conta e destino: ativos (quando a referência muda) e data >= saldo inicial.
  select * into v_acc from public.accounts a where a.id = new.account_id and a.family_id = new.family_id;
  if v_acc.id is not null then
    if (v_insert or new.account_id is distinct from old.account_id) and not v_acc.is_active then
      raise exception 'ACCOUNT_ARCHIVED' using errcode = 'P0001';
    end if;
    if (v_insert or new.account_id is distinct from old.account_id
        or new.transaction_date is distinct from old.transaction_date)
       and new.transaction_date < v_acc.opening_balance_date then
      raise exception 'DATE_BEFORE_OPENING_BALANCE' using errcode = 'P0001';
    end if;
  end if;

  if new.destination_account_id is not null then
    select * into v_dest from public.accounts a
    where a.id = new.destination_account_id and a.family_id = new.family_id;
    if v_dest.id is not null then
      if (v_insert or new.destination_account_id is distinct from old.destination_account_id) and not v_dest.is_active then
        raise exception 'ACCOUNT_ARCHIVED' using errcode = 'P0001';
      end if;
      if (v_insert or new.destination_account_id is distinct from old.destination_account_id
          or new.transaction_date is distinct from old.transaction_date)
         and new.transaction_date < v_dest.opening_balance_date then
        raise exception 'DATE_BEFORE_OPENING_BALANCE' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Categoria: mesmo tipo do lançamento (transferência com categoria cai no CHECK 23514) e ativa.
  if new.category_id is not null and (v_insert or new.category_id is distinct from old.category_id) then
    select * into v_cat from public.categories c where c.id = new.category_id and c.family_id = new.family_id;
    if v_cat.id is not null then
      if new.type in ('income', 'expense') and v_cat.type <> new.type then
        raise exception 'CATEGORY_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      if v_cat.archived_at is not null then
        raise exception 'CATEGORY_ARCHIVED' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Responsável: vínculo ativo (vínculo de outra família é invisível: a FK responde 23503).
  if new.assigned_member_id is not null and (v_insert or new.assigned_member_id is distinct from old.assigned_member_id) then
    select * into v_member from public.family_members m
    where m.id = new.assigned_member_id and m.family_id = new.family_id;
    if v_member.id is not null and v_member.status <> 'active' then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;
  end if;

  -- Efetivado não pode ter data futura em São Paulo.
  if new.status = 'paid' and new.transaction_date > private.today()
     and (v_insert or new.transaction_date is distinct from old.transaction_date) then
    raise exception 'FUTURE_DATE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  -- Estorno (D5): lock do original e validações.
  if v_insert and new.reversal_of_id is not null then
    perform 1 from public.transactions t where t.id = new.reversal_of_id and t.family_id = new.family_id;
    if not found then
      raise exception 'INVALID_REVERSAL' using errcode = 'P0001';
    end if;

    -- owner/admin ou autor do original (a linha é visível a todo integrante)
    if not private.has_family_role(new.family_id, array['owner', 'admin'])
       and not exists (
         select 1 from public.transactions t
         where t.id = new.reversal_of_id and t.family_id = new.family_id and t.created_by = auth.uid()
       ) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    -- a partir daqui o chamador passa na RLS de update; o lock serializa estornos concorrentes
    select * into v_orig from public.transactions t
    where t.id = new.reversal_of_id and t.family_id = new.family_id
    for update;
    if v_orig.id is null
       or v_orig.status <> 'paid'
       or v_orig.deleted_at is not null
       or v_orig.type = 'transfer'
       or v_orig.reversal_of_id is not null
       or new.type <> v_orig.type
       or new.account_id <> v_orig.account_id
       or new.category_id is distinct from v_orig.category_id
       or new.status <> 'paid'
       or new.transaction_date < v_orig.transaction_date then
      raise exception 'INVALID_REVERSAL' using errcode = 'P0001';
    end if;

    select coalesce(sum(r.amount), 0) into v_reversed
    from public.transactions r
    where r.reversal_of_id = v_orig.id and r.family_id = v_orig.family_id and r.deleted_at is null;
    if v_reversed + new.amount > v_orig.amount then
      raise exception 'REVERSAL_EXCEEDS_REMAINING' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function private.transactions_before_write() from public, anon, authenticated;

create trigger transactions_before_write_biu
  before insert or update on public.transactions
  for each row execute function private.transactions_before_write();

-- Auditoria (metadata sem descrição nem notas; valores em text). Roda como dono para gravar em audit_events.
create function private.transactions_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_changed text[] := '{}';
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    if new.reversal_of_id is not null then
      perform private.log_audit(
        new.family_id, 'transaction', new.reversal_of_id, 'transaction.reversed',
        jsonb_build_object(
          'reversal_id', new.id, 'amount', new.amount::text,
          'transaction_date', to_char(new.transaction_date, 'YYYY-MM-DD')
        )
      );
    end if;
    return null;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    perform private.log_audit(
      new.family_id, 'transaction', new.id, 'transaction.deleted',
      jsonb_build_object(
        'type', new.type, 'amount', new.amount::text,
        'transaction_date', to_char(new.transaction_date, 'YYYY-MM-DD')
      )
    );
    return null;
  end if;

  if new.amount is distinct from old.amount then
    v_changed := array_append(v_changed, 'amount');
    v_old := v_old || jsonb_build_object('amount', old.amount::text);
    v_new := v_new || jsonb_build_object('amount', new.amount::text);
  end if;
  if new.transaction_date is distinct from old.transaction_date then
    v_changed := array_append(v_changed, 'transaction_date');
    v_old := v_old || jsonb_build_object('transaction_date', to_char(old.transaction_date, 'YYYY-MM-DD'));
    v_new := v_new || jsonb_build_object('transaction_date', to_char(new.transaction_date, 'YYYY-MM-DD'));
  end if;
  if new.account_id is distinct from old.account_id then
    v_changed := array_append(v_changed, 'account_id');
    v_old := v_old || jsonb_build_object('account_id', old.account_id);
    v_new := v_new || jsonb_build_object('account_id', new.account_id);
  end if;
  if new.destination_account_id is distinct from old.destination_account_id then
    v_changed := array_append(v_changed, 'destination_account_id');
    v_old := v_old || jsonb_build_object('destination_account_id', old.destination_account_id);
    v_new := v_new || jsonb_build_object('destination_account_id', new.destination_account_id);
  end if;
  if new.category_id is distinct from old.category_id then
    v_changed := array_append(v_changed, 'category_id');
    v_old := v_old || jsonb_build_object('category_id', old.category_id);
    v_new := v_new || jsonb_build_object('category_id', new.category_id);
  end if;

  if cardinality(v_changed) > 0 then
    perform private.log_audit(
      new.family_id, 'transaction', new.id, 'transaction.updated',
      jsonb_build_object('changed', to_jsonb(v_changed), 'old', v_old, 'new', v_new)
    );
  end if;
  return null;
end;
$$;
revoke execute on function private.transactions_audit() from public, anon, authenticated;

create trigger transactions_audit_ai
  after insert on public.transactions
  for each row execute function private.transactions_audit();
create trigger transactions_audit_au
  after update on public.transactions
  for each row execute function private.transactions_audit();

-- Conta: o saldo inicial não pode passar de um lançamento não excluído (D2).
create function private.accounts_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.opening_balance_date > old.opening_balance_date and exists (
    select 1 from public.transactions t
    where t.family_id = new.family_id and t.deleted_at is null
      and (t.account_id = new.id or t.destination_account_id = new.id)
      and t.transaction_date < new.opening_balance_date
  ) then
    raise exception 'OPENING_DATE_AFTER_TRANSACTIONS' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.accounts_before_update() from public, anon, authenticated;

create trigger accounts_before_update_bu
  before update on public.accounts
  for each row execute function private.accounts_before_update();

-- DOWN (manual): drop trigger accounts_before_update_bu on public.accounts; drop function private.accounts_before_update();
--   drop table public.transactions; drop function private.transactions_audit(); drop function private.transactions_before_write();
-- Efeito em dados existentes: nenhum (tabela nova). O DOWN apaga lançamentos: operação destrutiva, só com autorização.
