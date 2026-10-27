-- Núcleo · Etapa 6 · correções pós-revisão. Contrato: docs/contracts/etapa-6.md. Erros: P0001 com mensagem = código; 42501 = FORBIDDEN.
-- (1) SPLIT_AMOUNT_TOO_SMALL em vez de 23514; (2) SEC-25 contraparte exclui acerto; (3) SEC-23 auditoria de splits sem ruído.

-- (1) reescala: parcela resultante <= 0 vira erro de domínio.
create or replace function private.rescale_splits(p_transaction_id uuid, p_new_amount numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_weights numeric[];
  v_alloc numeric[];
begin
  select array_agg(s.member_id order by m.joined_at, m.id), array_agg(s.amount order by m.joined_at, m.id)
    into v_ids, v_weights
  from public.expense_splits s
  join public.family_members m on m.id = s.member_id and m.family_id = s.family_id
  where s.transaction_id = p_transaction_id;
  if v_ids is null then
    return;
  end if;
  v_alloc := private.allocate_cents(p_new_amount, v_weights);
  if exists (select 1 from unnest(v_alloc) as a where a <= 0) then
    raise exception 'SPLIT_AMOUNT_TOO_SMALL' using errcode = 'P0001';
  end if;
  update public.expense_splits s
  set amount = v_alloc[x.ord]
  from unnest(v_ids) with ordinality as x(mid, ord)
  where s.transaction_id = p_transaction_id and s.member_id = x.mid;
end;
$$;

-- (1) e (3) RPC de divisão (corpo da 101400 + checagem de parcela mínima + no-op + auditoria condicional).
create or replace function public.set_transaction_splits(p_transaction_id uuid, p_mode text, p_shares jsonb)
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
  v_deleted integer;
  v_same boolean;
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
    get diagnostics v_deleted = row_count;
    if v_deleted > 0 then  -- SEC-23: só audita quando algo foi removido
      perform private.log_audit(v_family, 'transaction', v_tx.id, 'transaction.splits_changed',
        jsonb_build_object('mode', 'none', 'parts', 0));
    end if;
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

  if exists (select 1 from unnest(v_final_amts) as a where a <= 0) then
    raise exception 'SPLIT_AMOUNT_TOO_SMALL' using errcode = 'P0001';
  end if;

  -- SEC-23: conjunto novo idêntico ao atual é no-op (sem reescrita nem nova auditoria).
  select (select count(*) from public.expense_splits s where s.transaction_id = v_tx.id) = v_n
     and not exists (
       select 1 from unnest(v_final_ids) with ordinality as x(mid, ord)
       where not exists (
         select 1 from public.expense_splits s
         where s.transaction_id = v_tx.id and s.member_id = x.mid and s.amount = v_final_amts[x.ord]
       )
     )
    into v_same;
  if v_same then
    return;
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

-- (2) SEC-25: as partes do acerto (vínculo ativo) também excluem logicamente. O trigger continua fixando deleted_at/deleted_by.
drop policy settlements_update on public.settlements;
create policy settlements_update on public.settlements
  for update to authenticated
  using (
    deleted_at is null
    and private.is_family_member(family_id)
    and (
      private.has_family_role(family_id, array['owner', 'admin'])
      or created_by = (select auth.uid())
      or from_member_id = private.current_member_id()
      or to_member_id = private.current_member_id()
    )
  )
  with check (
    private.is_family_member(family_id)
    and (
      private.has_family_role(family_id, array['owner', 'admin'])
      or created_by = (select auth.uid())
      or from_member_id = private.current_member_id()
      or to_member_id = private.current_member_id()
    )
  );

-- DOWN (manual): recriar rescale_splits e set_transaction_splits com os corpos da 101200/101400; recriar settlements_update
--   com a definição da 101500. Efeito em dados existentes: nenhum (só funções e policy). Lock: breve (DDL de função/policy).
