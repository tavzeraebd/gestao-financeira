-- ADR-0041 / D26 (financial-definitions v1.5) · despesa no cartão conta no mês do vencimento da fatura (data de apuração).
-- Regra derivada na leitura, nunca gravada: só funções (4 privadas, 1 campo computado público, 5 funções alteradas).
-- Sem tabela, coluna, índice ou policy novos. O prefiltro de reporting_transactions mantém transactions_family_date_idx.
--
-- EFEITO EM DADOS EXISTENTES: nenhum dado gravado muda. Os totais por período (period_summary, monthly_cash_flow, category_totals,
--   budget_progress, member_expense_totals) de despesas em cartão passam a cair no mês do vencimento da fatura; meses passados
--   se recalculam, inclusive se o cartão mudar os dias de fechamento/vencimento (P1 aceito). Saldos (account_balances),
--   account_flows, dívida, pendentes e projeção continuam por transaction_date. Só funções: sem lock relevante.
--   A migration vai antes do deploy do app (contrato das RPCs inalterado).
--
-- DOWN (manual): recriar os corpos anteriores das 5 funções alteradas (period_summary: 20261024100400_etapa3_hardening.sql;
--   monthly_cash_flow e category_totals: 20261024100600_etapa4_dashboard_functions.sql; budget_progress: 20261024101000_etapa5_budgets.sql;
--   member_expense_totals: 20261024102100_etapa7_report_functions.sql) e, depois, dar drop nas 5 funções novas:
--   drop function public.reporting_date(public.transactions);
--   drop function private.reporting_transactions(date, date);
--   drop function private.reporting_date_of(date, text, text, smallint, smallint);
--   drop function private.card_invoice_due(date, smallint, smallint);
--   drop function private.card_invoice_closing(date, smallint);

-- 1 · Regra da fatura (espelho exato de invoiceOf em src/modules/reports/domain/card-invoices.ts) -----------------------------
-- Fechamento: dia C do mês da compra (ajustado ao último dia do mês) se a compra é anterior a ele; senão, dia C do mês seguinte.
create function private.card_invoice_closing(p_date date, p_closing_day smallint)
returns date
language plpgsql immutable strict parallel safe set search_path = '' as $$
declare
  v_first date := p_date - (extract(day from p_date)::integer - 1);  -- sem date_trunc(date): ele passa por timestamptz (stable)
  v_this date;
begin
  v_this := v_first + (least(p_closing_day, extract(day from (v_first + interval '1 month - 1 day'))::integer) - 1);
  if p_date < v_this then
    return v_this;
  end if;
  v_first := (v_first + interval '1 month')::date;
  return v_first + (least(p_closing_day, extract(day from (v_first + interval '1 month - 1 day'))::integer) - 1);
end;
$$;

-- Vencimento: dia V do mês do fechamento (ajustado) se for MAIOR que o fechamento; senão, dia V do mês seguinte (ajustado).
create function private.card_invoice_due(p_date date, p_closing_day smallint, p_due_day smallint)
returns date
language plpgsql immutable strict parallel safe set search_path = '' as $$
declare
  v_closing date := private.card_invoice_closing(p_date, p_closing_day);
  v_first date := v_closing - (extract(day from v_closing)::integer - 1);
  v_same date;
begin
  v_same := v_first + (least(p_due_day, extract(day from (v_first + interval '1 month - 1 day'))::integer) - 1);
  if v_same > v_closing then
    return v_same;
  end if;
  v_first := (v_first + interval '1 month')::date;
  return v_first + (least(p_due_day, extract(day from (v_first + interval '1 month - 1 day'))::integer) - 1);
end;
$$;

-- D26: data de apuração = vencimento da fatura para expense em credit_card com os dois dias; senão, a própria data.
create function private.reporting_date_of(p_date date, p_type text, p_account_type text, p_closing_day smallint, p_due_day smallint)
returns date
language sql immutable parallel safe set search_path = '' as $$
  select case
    when p_type = 'expense' and p_account_type = 'credit_card' and p_closing_day is not null and p_due_day is not null
      then private.card_invoice_due(p_date, p_closing_day, p_due_day)
    else p_date
  end
$$;

-- 2 · Único lugar do recorte de período ---------------------------------------------------------------------------------------
-- Linhas efetivadas/pendentes de income/expense da família com data de apuração em [p_from, p_to]. O prefiltro por transaction_date é
-- exato (o vencimento cai no mês da compra ou em um dos dois seguintes) e usa transactions_family_date_idx (family_id, transaction_date).
create function private.reporting_transactions(p_from date, p_to date)
returns table (id uuid, type text, status text, amount numeric, reversal_of_id uuid, category_id uuid,
               assigned_member_id uuid, account_id uuid, transaction_date date, reporting_date date)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
begin
  if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_from > p_to
     or p_from < date '2000-01-01' or p_to > date '9999-12-31' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- CTE materializada: o recorte por família + data usa transactions_family_date_idx (sem ela o planner pode ir por conta e transactions_account_date_idx).
  return query
  with tx as materialized (
    select t.id, t.type, t.status, t.amount, t.reversal_of_id, t.category_id, t.assigned_member_id, t.account_id,
           t.transaction_date, t.family_id
    from public.transactions t
    where t.family_id = (select private.current_family_id())
      and t.deleted_at is null
      and t.status in ('paid', 'pending')
      and t.type in ('income', 'expense')
      and t.transaction_date between (date_trunc('month', p_from) - interval '2 months')::date and p_to
  ),
  r as (
    select x.id, x.type, x.status, x.amount, x.reversal_of_id, x.category_id, x.assigned_member_id, x.account_id,
           x.transaction_date,
           private.reporting_date_of(x.transaction_date, x.type, a.type, a.statement_closing_day, a.statement_due_day) as reporting_date
    from tx x
    join public.accounts a on a.id = x.account_id and a.family_id = x.family_id
  )
  select r.id, r.type, r.status, r.amount, r.reversal_of_id, r.category_id, r.assigned_member_id, r.account_id,
         r.transaction_date, r.reporting_date
  from r
  where r.reporting_date between p_from and p_to;
end;
$$;

-- Campo computado do PostgREST (lista de Transações): data de apuração de uma linha, com a conta lida sob RLS.
create function public.reporting_date(t public.transactions)
returns date
language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select private.reporting_date_of(t.transaction_date, t.type, a.type, a.statement_closing_day, a.statement_due_day)
     from public.accounts a
     where a.id = t.account_id and a.family_id = t.family_id),
    t.transaction_date)
$$;

revoke execute on function private.card_invoice_closing(date, smallint) from public, anon;
revoke execute on function private.card_invoice_due(date, smallint, smallint) from public, anon;
revoke execute on function private.reporting_date_of(date, text, text, smallint, smallint) from public, anon;
revoke execute on function private.reporting_transactions(date, date) from public, anon;
revoke execute on function public.reporting_date(public.transactions) from public, anon;
grant execute on function private.card_invoice_closing(date, smallint) to authenticated;  -- chamadas por funções invoker (como private.today)
grant execute on function private.card_invoice_due(date, smallint, smallint) to authenticated;
grant execute on function private.reporting_date_of(date, text, text, smallint, smallint) to authenticated;
grant execute on function private.reporting_transactions(date, date) to authenticated;
grant execute on function public.reporting_date(public.transactions) to authenticated;

-- 3 · Funções alteradas (mesma assinatura e retorno; grants preservados pelo create or replace) -------------------------------

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
  from private.reporting_transactions(p_from, p_to) t
  where t.status = 'paid';

  return query select round(v_income, 2)::text, round(v_expense, 2)::text, round(v_income - v_expense, 2)::text;
end;
$$;

create or replace function public.monthly_cash_flow(p_from date, p_to date)
returns table (month date, income text, expense text, result text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_first date;
  v_last date;
begin
  if p_from is null or p_to is null or p_from > p_to
     or p_from < date '2000-01-01' or p_to > date '9999-12-31' then
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
    left join private.reporting_transactions(v_first, (v_last + interval '1 month - 1 day')::date) t
      on t.status = 'paid'
     and t.reporting_date >= s.m::date
     and t.reporting_date < (s.m + interval '1 month')::date
    group by s.m
  ) g
  order by g.m;
end;
$$;

create or replace function public.category_totals(p_from date, p_to date, p_type text)
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
    from private.reporting_transactions(p_from, p_to) t
    left join public.categories c on c.id = t.category_id and c.family_id = (select private.current_family_id())
    where t.status = 'paid'
      and t.type = p_type
    group by coalesce(c.parent_id, c.id, t.category_id)
  ) g
  where g.total <> 0
  order by g.total desc, g.cid;
end;
$$;

create or replace function public.budget_progress(p_from_month date, p_to_month date)
returns table (budget_id uuid, month date, spent text, committed text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_first date;
  v_last date;
  v_months integer;
begin
  if p_from_month is null or p_to_month is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  v_first := p_from_month - (extract(day from p_from_month)::integer - 1);
  v_last := p_to_month - (extract(day from p_to_month)::integer - 1);
  v_months := (extract(year from v_last)::integer - extract(year from v_first)::integer) * 12
              + extract(month from v_last)::integer - extract(month from v_first)::integer + 1;
  if v_months < 1 or v_months > 12 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  return query
  select b.id,
         m.first_day,
         round(coalesce(sum(case when x.status = 'paid'
                                 then (case when x.reversal_of_id is null then x.amount else -x.amount end) end), 0), 2)::text,
         round(coalesce(sum(case when x.status = 'pending' then x.amount end), 0), 2)::text
  from public.budgets b
  cross join lateral (
    select (v_first + make_interval(months => i))::date as first_day from generate_series(0, v_months - 1) as i
  ) m
  left join (
    select t.status, t.reversal_of_id, t.amount, t.reporting_date, t.category_id, c.parent_id
    from private.reporting_transactions(v_first, (v_last + interval '1 month - 1 day')::date) t
    left join public.categories c on c.id = t.category_id and c.family_id = (select private.current_family_id())
    where t.type = 'expense'
  ) x
    on x.reporting_date >= m.first_day
   and x.reporting_date < (m.first_day + interval '1 month')::date
   and (b.category_id is null or x.category_id = b.category_id or x.parent_id = b.category_id)
  where b.family_id = (select private.current_family_id())
    and m.first_day >= b.start_month
    and (b.end_month is null or m.first_day <= b.end_month)
  group by b.id, m.first_day
  order by m.first_day, b.id;
end;
$$;

create or replace function public.member_expense_totals(p_from date, p_to date)
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
    select t.id, (select private.current_family_id()) as family_id, t.amount as amt, t.reversal_of_id, t.assigned_member_id
    from private.reporting_transactions(p_from, p_to) t
    where t.type = 'expense' and t.status = 'paid'
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
