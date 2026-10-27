-- Núcleo · Etapa 6 · helpers (private). Contrato: docs/contracts/etapa-6.md §3.1; ADR-0025, ADR-0026; D13.
-- Erros: P0001 com mensagem = código; 42501 = FORBIDDEN.

-- Vínculo ativo do chamador (usado em policies e triggers invoker).
create function private.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id
  from public.family_members m
  where m.user_id = (select auth.uid()) and m.status = 'active'
  limit 1;
$$;
revoke execute on function private.current_member_id() from public, anon;
grant execute on function private.current_member_id() to authenticated;

-- D13 em centavos: base = floor(total·peso/Σpesos); o resto vai 1 centavo por vez às partes de maior resto fracionário;
-- empate pelo índice do array. Aritmética exata em numeric (div/mod), sem ponto flutuante. Σ resultado = p_total.
create function private.allocate_cents(p_total numeric, p_weights numeric[]) returns numeric[]
language plpgsql immutable set search_path = '' as $$
declare
  v_n integer;
  v_sum numeric;
  v_total_c numeric;
  v_base numeric[];
  v_mod numeric[];
  v_rest numeric;
  v_k integer;
  v_out numeric[];
begin
  if p_total is null or p_total = 'NaN'::numeric or p_total < 0 or p_total <> round(p_total, 2)
     or p_weights is null or array_ndims(p_weights) is distinct from 1 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  v_n := cardinality(p_weights);
  if exists (select 1 from unnest(p_weights) as w where w is null or w = 'NaN'::numeric or w < 0) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  select sum(w) into v_sum from unnest(p_weights) as w;
  if v_sum is null or v_sum <= 0 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  v_total_c := p_total * 100;
  v_base := array_fill(0::numeric, array[v_n]);
  v_mod := array_fill(0::numeric, array[v_n]);
  for v_i in 1..v_n loop
    v_base[v_i] := div(v_total_c * p_weights[v_i], v_sum);
    v_mod[v_i] := mod(v_total_c * p_weights[v_i], v_sum);
  end loop;
  select v_total_c - sum(b) into v_rest from unnest(v_base) as b;

  if v_rest > 0 then
    for v_k in
      select i from generate_subscripts(v_mod, 1) as i order by v_mod[i] desc, i asc limit v_rest::integer
    loop
      v_base[v_k] := v_base[v_k] + 1;
    end loop;
  end if;

  v_out := array_fill(0::numeric, array[v_n]);
  for v_i in 1..v_n loop
    v_out[v_i] := round(v_base[v_i] / 100, 2);
  end loop;
  return v_out;
end;
$$;
revoke execute on function private.allocate_cents(numeric, numeric[]) from public, anon;
grant execute on function private.allocate_cents(numeric, numeric[]) to authenticated;

-- Reescala as parcelas existentes na proporção atual (pesos = parcelas atuais, ordem joined_at, id). Só o trigger de
-- reescala e a RPC de divisão a usam; sem grant a authenticated.
create function private.rescale_splits(p_transaction_id uuid, p_new_amount numeric) returns void
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
  update public.expense_splits s
  set amount = v_alloc[x.ord]
  from unnest(v_ids) with ordinality as x(mid, ord)
  where s.transaction_id = p_transaction_id and s.member_id = x.mid;
end;
$$;
revoke execute on function private.rescale_splits(uuid, numeric) from public, anon, authenticated;

-- A projeção (função invoker) precisa avaliar a agenda com o papel do chamador (funções puras da Etapa 5).
revoke execute on function private.recurrence_occurrence(date, text, smallint, integer) from public, anon;
revoke execute on function private.recurrence_first_index(date, text, smallint, date) from public, anon;
grant execute on function private.recurrence_occurrence(date, text, smallint, integer) to authenticated;
grant execute on function private.recurrence_first_index(date, text, smallint, date) to authenticated;

-- DOWN (manual): drop function private.rescale_splits(uuid, numeric); drop function private.allocate_cents(numeric, numeric[]);
--   drop function private.current_member_id() (depois de remover as migrations 101300..101600, que a usam).
-- Efeito em dados existentes: nenhum (funções novas; grants já existentes reafirmados).
