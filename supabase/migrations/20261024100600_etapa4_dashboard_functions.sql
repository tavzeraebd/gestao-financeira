-- Núcleo · Etapa 4 · funções de leitura do dashboard (D4, D16, D17; R9, R11). Contrato: docs/contracts/etapa-4.md §3.1; ADR-0020.
-- security invoker: a RLS do chamador vale; o filtro por current_family_id() é redundante de propósito (usa transactions_family_date_idx).
-- Montantes saem como text (nunca number); acumuladores numeric sem typmod (como period_summary). Sem tabela, coluna, índice ou policy novos.

-- D4/D17: receitas, despesas e resultado de cada mês civil de date_trunc('month', p_from) a date_trunc('month', p_to), todos presentes
-- (mês sem movimento = 0.00), em ordem crescente. Só pagos, não excluídos, income/expense; estorno com sinal invertido; transferência fora.
create function public.monthly_cash_flow(p_from date, p_to date)
returns table (month date, income text, expense text, result text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_first date;
  v_last date;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  v_first := date_trunc('month', p_from)::date;
  v_last := date_trunc('month', p_to)::date;
  if (extract(year from v_last)::int * 12 + extract(month from v_last)::int)
     - (extract(year from v_first)::int * 12 + extract(month from v_first)::int) + 1 > 24 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  return query
  select g.m::date,
         round(g.inc, 2)::text,
         round(g.exp, 2)::text,
         round(g.inc - g.exp, 2)::text
  from (
    select s.m,
           coalesce(sum(case when t.type = 'income' then (case when t.reversal_of_id is null then t.amount else -t.amount end) end), 0) as inc,
           coalesce(sum(case when t.type = 'expense' then (case when t.reversal_of_id is null then t.amount else -t.amount end) end), 0) as exp
    from generate_series(v_first, v_last, interval '1 month') as s(m)
    left join public.transactions t
      on t.family_id = (select private.current_family_id())
     and t.status = 'paid' and t.deleted_at is null
     and t.type in ('income', 'expense')
     and t.transaction_date >= s.m::date
     and t.transaction_date < (s.m + interval '1 month')::date
    group by s.m
  ) g
  order by g.m;
end;
$$;

-- D4/D16: total por categoria no intervalo fechado [p_from, p_to], subcategoria somada à categoria-pai. Inclui categorias arquivadas;
-- categoria removida (sem linha em categories) aparece pelo próprio id. Omite total = 0. Ordem: valor decrescente, depois category_id.
-- O valor pode ser negativo (estorno maior que o gasto no período, D5).
create function public.category_totals(p_from date, p_to date, p_type text)
returns table (category_id uuid, amount text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
begin
  if p_from is null or p_to is null or p_from > p_to or p_type is null or p_type not in ('income', 'expense') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  return query
  select g.cid, round(g.total, 2)::text
  from (
    select coalesce(c.parent_id, c.id, t.category_id) as cid,
           sum(case when t.reversal_of_id is null then t.amount else -t.amount end) as total
    from public.transactions t
    left join public.categories c on c.id = t.category_id and c.family_id = t.family_id
    where t.family_id = (select private.current_family_id())
      and t.status = 'paid' and t.deleted_at is null
      and t.type = p_type
      and t.transaction_date between p_from and p_to
    group by coalesce(c.parent_id, c.id, t.category_id)
  ) g
  where g.total <> 0
  order by g.total desc, g.cid;
end;
$$;

revoke execute on function public.monthly_cash_flow(date, date) from public, anon;
revoke execute on function public.category_totals(date, date, text) from public, anon;
grant execute on function public.monthly_cash_flow(date, date) to authenticated;
grant execute on function public.category_totals(date, date, text) to authenticated;

-- DOWN (manual): drop function public.monthly_cash_flow(date, date); drop function public.category_totals(date, date, text);
-- Efeito em dados existentes: nenhum (só leitura; sem lock relevante).
