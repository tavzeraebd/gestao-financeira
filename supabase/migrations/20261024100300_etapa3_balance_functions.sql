-- Núcleo · Etapa 3 · funções de leitura financeira (D1 e D4). Contrato: docs/contracts/etapa-3.md §3.1; ADR-0003/0004/0018.
-- security invoker: a RLS do chamador vale. Montantes saem como text (nunca number).

-- D1: saldo por conta (ativas e arquivadas) na data de referência (nula = hoje em São Paulo).
-- Só efetivados e não excluídos. Estorno inverte o sentido do tipo; transferência sai da origem e entra no destino.
create function public.account_balances(p_as_of date default null)
returns table (account_id uuid, balance text)
language sql stable security invoker set search_path = '' as $$
  select a.id,
         (a.opening_balance + coalesce(mv.delta, 0))::text
  from public.accounts a
  left join (
    select m.account_id, sum(m.delta) as delta
    from (
      select t.account_id,
             case t.type
               when 'income' then case when t.reversal_of_id is null then t.amount else -t.amount end
               when 'expense' then case when t.reversal_of_id is null then -t.amount else t.amount end
               else -t.amount
             end as delta
      from public.transactions t
      where t.status = 'paid' and t.deleted_at is null
        and t.transaction_date <= coalesce(p_as_of, private.today())
      union all
      select t.destination_account_id, t.amount
      from public.transactions t
      where t.type = 'transfer' and t.status = 'paid' and t.deleted_at is null
        and t.transaction_date <= coalesce(p_as_of, private.today())
    ) m
    group by m.account_id
  ) mv on mv.account_id = a.id
  order by a.created_at, a.id;
$$;

-- D4: receitas, despesas e resultado do período fechado [p_from, p_to]. Transferências ficam fora; estornos abatem
-- pela data do estorno; cartão entra pela data da compra.
create function public.period_summary(p_from date, p_to date)
returns table (income text, expense text, result text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_income numeric(14, 2);
  v_expense numeric(14, 2);
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

  return query select v_income::text, v_expense::text, (v_income - v_expense)::text;
end;
$$;

revoke execute on function public.account_balances(date) from public, anon;
revoke execute on function public.period_summary(date, date) from public, anon;
grant execute on function public.account_balances(date) to authenticated;
grant execute on function public.period_summary(date, date) to authenticated;

-- DOWN (manual): drop function public.account_balances(date); drop function public.period_summary(date, date);
-- Efeito em dados existentes: nenhum (só leitura).
