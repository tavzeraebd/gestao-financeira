-- Núcleo · Etapa 3 · correções pós-revisão: SEC-14 (NaN/teto), SEC-15 (exclusão lógica), SEC-17 (auditoria de categoria),
-- revisor #5 (lock da conta) e #6 (reativar subcategoria). Migration nova: as anteriores não são editadas.

-- SEC-14 · numeric aceita 'NaN' e 'NaN' > 0 é true. Teto = 999999999999.99 (= MAX_CENTS/100 de src/lib/money e o máximo de numeric(14,2)).
-- NOT VALID + VALIDATE tolerante: linhas existentes com NaN não derrubam a migration (viram NOTICE e a constraint fica NOT VALID, valendo para novas escritas).
alter table public.transactions
  add constraint transactions_amount_range_check
  check (amount <> 'NaN'::numeric and amount <= 999999999999.99) not valid;
alter table public.accounts
  add constraint accounts_opening_balance_range_check
  check (opening_balance <> 'NaN'::numeric and abs(opening_balance) <= 999999999999.99) not valid;
alter table public.accounts
  add constraint accounts_credit_limit_range_check
  check (credit_limit is null or (credit_limit <> 'NaN'::numeric and credit_limit <= 999999999999.99)) not valid;

do $$
begin
  alter table public.transactions validate constraint transactions_amount_range_check;
  alter table public.accounts validate constraint accounts_opening_balance_range_check;
  alter table public.accounts validate constraint accounts_credit_limit_range_check;
exception when check_violation then
  raise notice 'SEC-14: existem linhas com NaN/valor acima do teto; constraints ficam NOT VALID (valem para novas escritas). Corrija e rode VALIDATE.';
end;
$$;

-- period_summary: acumuladores sem typmod (somar dois valores no teto não estoura 22003). Mesma assinatura.
create or replace function public.period_summary(p_from date, p_to date)
returns table (income text, expense text, result text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_income numeric;
  v_expense numeric;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select
    coalesce(sum(case when t.type = 'income' then (case when t.reversal_of_id is null then t.amount else -t.amount end) end), 0),
    coalesce(sum(case when t.type = 'expense' then (case when t.reversal_of_id is null then t.amount else -t.amount end) end), 0)
  into v_income, v_expense
  from public.transactions t
  where t.status = 'paid' and t.deleted_at is null
    and t.type in ('income', 'expense')
    and t.transaction_date between p_from and p_to;

  return query select round(v_income, 2)::text, round(v_expense, 2)::text, round(v_income - v_expense, 2)::text;
end;
$$;
-- account_balances é SQL puro sem variáveis tipadas: sum() já devolve numeric sem typmod; nada a mudar.

-- Revisor #5 · lê a conta com FOR SHARE (serializa com a mudança de opening_balance_date, que faz UPDATE na conta).
-- FOR SHARE direto no trigger exigiria a policy de update (owner/admin) e esconderia a conta de um member:
-- por isso um helper definer, restrito a integrantes da família, devolve a linha já travada.
create function private.lock_account_share(p_family_id uuid, p_account_id uuid) returns public.accounts
language plpgsql security definer set search_path = '' as $$
declare
  v_acc public.accounts;
begin
  if p_account_id is null or not private.is_family_member(p_family_id) then
    return null;
  end if;
  select * into v_acc from public.accounts a
  where a.id = p_account_id and a.family_id = p_family_id
  for share;
  return v_acc;
end;
$$;
revoke execute on function private.lock_account_share(uuid, uuid) from public, anon;
grant execute on function private.lock_account_share(uuid, uuid) to authenticated;

-- Trigger de lançamentos: mesma lógica da migration 100200 + SEC-15 (exclusão lógica não altera mais nada) + lock da conta.
create or replace function private.transactions_before_write() returns trigger
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

  -- Exclusão lógica: fixa quem e quando e descarta qualquer outra alteração enviada junto (SEC-15).
  if not v_insert and old.deleted_at is null and new.deleted_at is not null then
    if old.reversal_of_id is null and exists (
      select 1 from public.transactions r
      where r.reversal_of_id = old.id and r.family_id = old.family_id and r.deleted_at is null
    ) then
      raise exception 'TRANSACTION_HAS_REVERSALS' using errcode = 'P0001';
    end if;
    new.account_id := old.account_id;
    new.destination_account_id := old.destination_account_id;
    new.category_id := old.category_id;
    new.assigned_member_id := old.assigned_member_id;
    new.description := old.description;
    new.amount := old.amount;
    new.transaction_date := old.transaction_date;
    new.notes := old.notes;
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

  -- Conta e destino: ativos (quando a referência muda) e data >= saldo inicial. Linhas travadas com FOR SHARE.
  v_acc := private.lock_account_share(new.family_id, new.account_id);
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
    v_dest := private.lock_account_share(new.family_id, new.destination_account_id);
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

    if not private.has_family_role(new.family_id, array['owner', 'admin'])
       and not exists (
         select 1 from public.transactions t
         where t.id = new.reversal_of_id and t.family_id = new.family_id and t.created_by = auth.uid()
       ) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

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

-- Categorias: #6 reativar subcategoria com pai arquivado → INVALID_CATEGORY_PARENT.
create or replace function private.categories_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_parent public.categories;
begin
  if new.parent_id is not null and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    if new.parent_id = new.id then
      raise exception 'INVALID_CATEGORY_PARENT' using errcode = 'P0001';
    end if;
    select * into v_parent from public.categories c
    where c.id = new.parent_id and c.family_id = new.family_id;
    if v_parent.id is not null
       and (v_parent.parent_id is not null or v_parent.type <> new.type or v_parent.archived_at is not null) then
      raise exception 'INVALID_CATEGORY_PARENT' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and exists (
      select 1 from public.categories c where c.parent_id = new.id and c.family_id = new.family_id
    ) then
      raise exception 'INVALID_CATEGORY_PARENT' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.archived_at is not null and new.archived_at is null and new.parent_id is not null and exists (
    select 1 from public.categories c
    where c.id = new.parent_id and c.family_id = new.family_id and c.archived_at is not null
  ) then
    raise exception 'INVALID_CATEGORY_PARENT' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and old.archived_at is null and new.archived_at is not null and exists (
    select 1 from public.categories c
    where c.parent_id = new.id and c.family_id = new.family_id and c.archived_at is null
  ) then
    raise exception 'CATEGORY_HAS_CHILDREN' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- SEC-17 · category.unarchived e category.deleted (sem nome na metadata).
create or replace function private.categories_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    perform private.log_audit(new.family_id, 'category', new.id, 'category.archived', '{}'::jsonb);
  elsif old.archived_at is not null and new.archived_at is null then
    perform private.log_audit(new.family_id, 'category', new.id, 'category.unarchived', '{}'::jsonb);
  end if;
  return null;
end;
$$;

create function private.categories_audit_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.log_audit(old.family_id, 'category', old.id, 'category.deleted', '{}'::jsonb);
  return old;
end;
$$;
revoke execute on function private.categories_audit_delete() from public, anon, authenticated;

create trigger categories_audit_bd
  before delete on public.categories
  for each row execute function private.categories_audit_delete();

-- DOWN (manual): drop trigger categories_audit_bd on public.categories; drop function private.categories_audit_delete();
--   restaurar categories_audit/categories_before_write/transactions_before_write/period_summary das migrations 100100, 100200 e 100300;
--   drop function private.lock_account_share(uuid, uuid);
--   alter table public.transactions drop constraint transactions_amount_range_check;
--   alter table public.accounts drop constraint accounts_opening_balance_range_check, drop constraint accounts_credit_limit_range_check;
-- Efeito em dados existentes: nenhum dado alterado; linhas com NaN/acima do teto (se houvesse) deixariam as constraints NOT VALID, com NOTICE.
