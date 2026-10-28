-- Núcleo · Etapa 7 · funções de leitura dos relatórios: account_flows (D22) e member_expense_totals (D10). Contrato: docs/contracts/etapa-7.md §3.1;
-- ADR-0028; AB-117. security invoker (a RLS do chamador vale; o filtro por private.current_family_id() é redundante de propósito e
-- não há parâmetro de família); montantes em text; nenhuma função de saldo, consolidado ou orçamento é tocada.
-- Erros: P0001 com mensagem = código.

-- D22: movimento por conta em [p_from, p_to] (até 366 dias). Só efetivados e não excluídos. Entradas = income na conta + transferência
-- recebida + estorno de despesa na conta; saídas = despesa na conta + transferência enviada + estorno de receita. Aqui as transferências
-- ENTRAM (o relatório é da conta, não do consolidado). Saldo no início = account_balances(início − 1); no fim = account_balances(fim)
-- (a fórmula de saldo é a única, a de D1: não é recalculada aqui). Contas ativas e arquivadas; omite a conta sem movimento no
-- período e com saldo inicial e final iguais a 0.
create function public.account_flows(p_from date, p_to date)
returns table (account_id uuid, opening text, inflow text, outflow text, closing text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
begin
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
     or p_from > p_to or (p_to - p_from + 1) > 366 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  return query
  with flows as (
    select m.aid, sum(m.i) as inf, sum(m.o) as outf, count(*) as n
    from (
      select t.account_id as aid,
             case when (t.type = 'income' and t.reversal_of_id is null)
                    or (t.type = 'expense' and t.reversal_of_id is not null) then t.amount else 0::numeric end as i,
             case when (t.type = 'expense' and t.reversal_of_id is null)
                    or (t.type = 'income' and t.reversal_of_id is not null)
                    or t.type = 'transfer' then t.amount else 0::numeric end as o
      from public.transactions t
      where t.family_id = (select private.current_family_id())
        and t.status = 'paid' and t.deleted_at is null
        and t.transaction_date between p_from and p_to
      union all
      select t.destination_account_id, t.amount, 0::numeric
      from public.transactions t
      where t.family_id = (select private.current_family_id())
        and t.type = 'transfer' and t.status = 'paid' and t.deleted_at is null
        and t.transaction_date between p_from and p_to
    ) m
    group by m.aid
  ),
  b0 as (
    select b.account_id as aid, b.balance::numeric as bal from public.account_balances(p_from - 1) b
  ),
  b1 as (
    select b.account_id as aid, b.balance::numeric as bal from public.account_balances(p_to) b
  )
  select a.id,
         round(b0.bal, 2)::text,
         round(coalesce(f.inf, 0), 2)::text,
         round(coalesce(f.outf, 0), 2)::text,
         round(b1.bal, 2)::text
  from public.accounts a
  join b0 on b0.aid = a.id
  join b1 on b1.aid = a.id
  left join flows f on f.aid = a.id
  where a.family_id = (select private.current_family_id())
    and (f.n is not null or b0.bal <> 0 or b1.bal <> 0)
  order by a.created_at, a.id;
end;
$$;

-- D10: despesas do período por integrante. Para cada expense efetivada, não excluída, com data em [p_from, p_to]: com divisão cada
-- integrante recebe a sua parcela; sem divisão o valor inteiro vai ao assigned_member_id; sem responsável, member_id nulo
-- ("Família (sem responsável)"). Estorno entra com sinal invertido e herda a proporção do ORIGINAL (parcelas do original por
-- private.allocate_cents, a mesma ordem joined_at, id de member_balances; sem divisão, o responsável do original). Omite total 0.
-- Σ amount = period_summary.expense do mesmo intervalo. Mesmas validações de data de account_flows.
create function public.member_expense_totals(p_from date, p_to date)
returns table (member_id uuid, amount text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
begin
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to)
     or p_from > p_to or (p_to - p_from + 1) > 366 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  return query
  with ex as (
    select t.id, t.family_id, t.amount as amt, t.reversal_of_id, t.assigned_member_id
    from public.transactions t
    where t.family_id = (select private.current_family_id())
      and t.type = 'expense' and t.status = 'paid' and t.deleted_at is null
      and t.transaction_date between p_from and p_to
  ),
  src as (
    select e.id, e.amt, (e.reversal_of_id is not null) as is_rev,
           coalesce(e.reversal_of_id, e.id) as base_id,
           case when e.reversal_of_id is null then e.assigned_member_id else o.assigned_member_id end as payer
    from ex e
    left join public.transactions o on o.id = e.reversal_of_id and o.family_id = e.family_id
  ),
  ord as (
    select s.transaction_id as tid,
           array_agg(s.member_id order by m.joined_at, m.id) as ids,
           array_agg(s.amount order by m.joined_at, m.id) as wts
    from public.expense_splits s
    join public.family_members m on m.id = s.member_id and m.family_id = s.family_id
    where s.family_id = (select private.current_family_id())
      and s.transaction_id in (select sr.base_id from src sr)
    group by s.transaction_id
  ),
  parts as (
    select x.mid as pm, case when sr.is_rev then -x.pa else x.pa end as pa
    from src sr
    join ord od on od.tid = sr.base_id
    cross join lateral unnest(
      od.ids,
      case when sr.is_rev then private.allocate_cents(sr.amt, od.wts) else od.wts end
    ) as x(mid, pa)
    union all
    select sr.payer, case when sr.is_rev then -sr.amt else sr.amt end
    from src sr
    where not exists (select 1 from ord od where od.tid = sr.base_id)
  )
  select p.pm, round(sum(p.pa), 2)::text
  from parts p
  group by p.pm
  having sum(p.pa) <> 0
  order by sum(p.pa) desc, p.pm;
end;
$$;

revoke execute on function public.account_flows(date, date) from public, anon;
revoke execute on function public.member_expense_totals(date, date) from public, anon;
grant execute on function public.account_flows(date, date) to authenticated;
grant execute on function public.member_expense_totals(date, date) to authenticated;

-- DOWN (manual): drop function public.member_expense_totals(date, date); drop function public.account_flows(date, date).
-- Efeito em dados existentes: nenhum (funções novas, só leitura). Sem tabela, coluna, índice ou policy novos: usam
--   transactions_account_date_idx / transactions_destination_date_idx / transactions_family_date_idx (account_balances e o filtro de
--   período) e a chave única de expense_splits; volume real não medido neste ambiente.
