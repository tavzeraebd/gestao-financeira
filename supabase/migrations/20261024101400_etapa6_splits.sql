-- Núcleo · Etapa 6 · divisão de despesas (D10, D13; ADR-0026). Contrato: docs/contracts/etapa-6.md §3.1.
-- A divisão só registra responsabilidade: nenhuma função de saldo, total ou orçamento lê expense_splits.
-- Escrita só pela RPC set_transaction_splits e pelo trigger de reescala. Erros: P0001 com mensagem = código; 42501 = FORBIDDEN.

create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  transaction_id uuid not null,
  member_id uuid not null,
  amount numeric(14, 2) not null
    constraint expense_splits_amount_check check (amount > 0 and amount <> 'NaN'::numeric),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_splits_transaction_member_key unique (transaction_id, member_id),
  constraint expense_splits_transaction_fk foreign key (family_id, transaction_id)
    references public.transactions (family_id, id) on delete restrict,
  constraint expense_splits_member_fk foreign key (family_id, member_id)
    references public.family_members (family_id, id) on delete restrict
);

create trigger expense_splits_set_updated_at
  before update on public.expense_splits
  for each row execute function private.set_updated_at();

alter table public.expense_splits enable row level security;
revoke all on public.expense_splits from anon, authenticated;
grant select on public.expense_splits to authenticated;  -- nenhuma escrita direta: só a RPC e o trigger de reescala

create policy expense_splits_select on public.expense_splits
  for select to authenticated
  using (private.is_family_member(family_id));

-- Σ parcelas = valor da despesa, conferido no commit (a RPC e a reescala mexem em várias linhas na mesma transação).
create function private.expense_splits_sum_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tx uuid := coalesce(new.transaction_id, old.transaction_id);
  v_count integer;
  v_sum numeric;
  v_amount numeric;
begin
  select count(*), sum(s.amount) into v_count, v_sum from public.expense_splits s where s.transaction_id = v_tx;
  if v_count > 0 then
    select t.amount into v_amount from public.transactions t where t.id = v_tx;
    if v_amount is distinct from v_sum then
      raise exception 'SPLIT_SUM_MISMATCH' using errcode = 'P0001';
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function private.expense_splits_sum_check() from public, anon, authenticated;

create constraint trigger expense_splits_sum_check
  after insert or update or delete on public.expense_splits
  deferrable initially deferred
  for each row execute function private.expense_splits_sum_check();

-- Reescala quando o valor da despesa muda (pagamento com valor real, edição). Trigger SEPARADO dos triggers de lançamentos.
create function private.transactions_rescale_splits() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.rescale_splits(new.id, new.amount);
  return null;
end;
$$;
revoke execute on function private.transactions_rescale_splits() from public, anon, authenticated;

create trigger transactions_rescale_splits
  after update of amount on public.transactions
  for each row when (old.amount is distinct from new.amount)
  execute function private.transactions_rescale_splits();

-- RPC de escrita ---------------------------------------------------------------------------------------------------
create function public.set_transaction_splits(p_transaction_id uuid, p_mode text, p_shares jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_tx public.transactions;
  v_n integer;
  v_ids uuid[] := '{}'::uuid[];
  v_amts numeric[] := '{}'::numeric[];
  v_el jsonb;
  v_ord_ids uuid[];
  v_final_ids uuid[];
  v_final_amts numeric[];
  v_found integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_tx from public.transactions t
  where t.id = p_transaction_id and t.family_id = v_family and t.deleted_at is null
  for update;
  if v_tx.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_tx.type <> 'expense' or v_tx.status = 'canceled' or v_tx.reversal_of_id is not null then
    raise exception 'SPLIT_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if not private.has_family_role(v_family, array['owner', 'admin']) and v_tx.created_by <> v_uid then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_mode is null or p_mode not in ('equal', 'amounts', 'none') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if p_mode = 'none' then
    delete from public.expense_splits s where s.transaction_id = v_tx.id;
    perform private.log_audit(v_family, 'transaction', v_tx.id, 'transaction.splits_changed',
      jsonb_build_object('mode', 'none', 'parts', 0));
    return;
  end if;

  -- p_shares: 2..20 objetos, member_id uuid distintos; em 'amounts', amount texto ^\d{1,8}(\.\d{1,2})?$ e > 0.
  if p_shares is null or jsonb_typeof(p_shares) <> 'array' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_shares);
  if v_n < 2 or v_n > 20 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  for v_el in select e from jsonb_array_elements(p_shares) as e loop
    if jsonb_typeof(v_el) <> 'object'
       or jsonb_typeof(v_el -> 'member_id') is distinct from 'string'
       or (v_el ->> 'member_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;
    v_ids := array_append(v_ids, (v_el ->> 'member_id')::uuid);
    if p_mode = 'amounts' then
      if jsonb_typeof(v_el -> 'amount') is distinct from 'string'
         or (v_el ->> 'amount') !~ '^\d{1,8}(\.\d{1,2})?$'
         or (v_el ->> 'amount')::numeric <= 0 then
        raise exception 'INVALID_INPUT' using errcode = 'P0001';
      end if;
      v_amts := array_append(v_amts, (v_el ->> 'amount')::numeric);
    end if;
  end loop;
  if (select count(distinct x) from unnest(v_ids) as x) <> v_n then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- Integrantes: vínculos DESTA família (sem distinguir "não existe" de "outra família").
  select count(*) into v_found from public.family_members m
  where m.family_id = v_family and m.id = any (v_ids);
  if v_found <> v_n then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  -- ativos, ou já presentes na divisão atual deste lançamento.
  if exists (
    select 1 from public.family_members m
    where m.family_id = v_family and m.id = any (v_ids) and m.status <> 'active'
      and not exists (
        select 1 from public.expense_splits s where s.transaction_id = v_tx.id and s.member_id = m.id
      )
  ) then
    raise exception 'MEMBER_INACTIVE' using errcode = 'P0001';
  end if;

  if p_mode = 'equal' then
    select array_agg(m.id order by m.joined_at, m.id) into v_ord_ids
    from public.family_members m where m.family_id = v_family and m.id = any (v_ids);
    v_final_ids := v_ord_ids;
    v_final_amts := private.allocate_cents(v_tx.amount, array_fill(1::numeric, array[v_n]));
  else
    if (select sum(a) from unnest(v_amts) as a) <> v_tx.amount then
      raise exception 'SPLIT_SUM_MISMATCH' using errcode = 'P0001';
    end if;
    v_final_ids := v_ids;
    v_final_amts := v_amts;
  end if;

  delete from public.expense_splits s where s.transaction_id = v_tx.id;
  insert into public.expense_splits (family_id, transaction_id, member_id, amount, created_by)
  select v_family, v_tx.id, x.mid, v_final_amts[x.ord], v_uid
  from unnest(v_final_ids) with ordinality as x(mid, ord);

  perform private.log_audit(v_family, 'transaction', v_tx.id, 'transaction.splits_changed',
    jsonb_build_object('mode', p_mode, 'parts', v_n));
end;
$$;

revoke execute on function public.set_transaction_splits(uuid, text, jsonb) from public, anon;
grant execute on function public.set_transaction_splits(uuid, text, jsonb) to authenticated;

-- DOWN (manual): drop function public.set_transaction_splits(uuid, text, jsonb); drop trigger transactions_rescale_splits on
--   public.transactions; drop function private.transactions_rescale_splits(); drop table public.expense_splits (apaga divisões:
--   destrutivo, só com autorização); drop function private.expense_splits_sum_check().
-- Efeito em dados existentes: nenhum (tabela, funções e trigger novos; o trigger em transactions só age em linhas com parcelas).
-- Lock: CREATE TRIGGER em transactions toma lock SHARE ROW EXCLUSIVE, breve (sem varredura).
