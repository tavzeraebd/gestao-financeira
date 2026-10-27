-- Núcleo · Etapa 6 · funções de leitura: goal_summary (D9), member_balances (D10), projected_cash_flow (D15).
-- Contrato: docs/contracts/etapa-6.md §3.1. security invoker (a RLS do chamador vale; o filtro por família é redundante de
-- propósito); montantes em text; nenhuma função de saldo/consolidado/orçamento é tocada.

-- D9: acumulado (todas as datas) e aportes/retiradas do intervalo, por meta visível (todos os status).
create function public.goal_summary(p_from date, p_to date)
returns table (goal_id uuid, saved text, deposits text, withdrawals text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
begin
  if p_from is null or p_to is null or p_from > p_to or (p_to - p_from + 1) > 366 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  return query
  select g.id,
         round(coalesce(sum(case c.kind when 'deposit' then c.amount else -c.amount end), 0), 2)::text,
         round(coalesce(sum(c.amount) filter (
           where c.kind = 'deposit' and c.contribution_date between p_from and p_to), 0), 2)::text,
         round(coalesce(sum(c.amount) filter (
           where c.kind = 'withdrawal' and c.contribution_date between p_from and p_to), 0), 2)::text
  from public.goals g
  left join public.goal_contributions c
    on c.goal_id = g.id and c.family_id = g.family_id and c.deleted_at is null
  where g.family_id = (select private.current_family_id())
  group by g.id, g.created_at
  order by g.created_at, g.id;
end;
$$;
revoke execute on function public.goal_summary(date, date) from public, anon;
grant execute on function public.goal_summary(date, date) to authenticated;

-- D10: saldo entre integrantes (todas as datas, só despesas efetivadas). deve(X→Y) = Σ parcelas líquidas de X em despesas
-- pagas por Y (X ≠ Y; estorno com a proporção do original via allocate_cents) − Σ acertos não excluídos de X para Y.
-- Por par, só o líquido positivo.
create function public.member_balances()
returns table (debtor_member_id uuid, creditor_member_id uuid, amount text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with fam as (
    select private.current_family_id() as id
  ),
  ord as (
    select s.transaction_id, s.member_id, s.amount,
           row_number() over (partition by s.transaction_id order by m.joined_at, m.id) as rn
    from public.expense_splits s
    join public.family_members m on m.id = s.member_id and m.family_id = s.family_id
    where s.family_id = (select id from fam)
  ),
  orig as (
    select t.id, t.assigned_member_id as payer,
           array_agg(o.member_id order by o.rn) as ids,
           array_agg(o.amount order by o.rn) as wts
    from public.transactions t
    join ord o on o.transaction_id = t.id
    where t.family_id = (select id from fam)
      and t.type = 'expense' and t.status = 'paid' and t.deleted_at is null
      and t.reversal_of_id is null and t.assigned_member_id is not null
    group by t.id, t.assigned_member_id
  ),
  owes as (
    select x.mid as debtor, o.payer as creditor, x.amt as amt
    from orig o
    cross join lateral unnest(o.ids, o.wts) as x(mid, amt)
    where x.mid <> o.payer
    union all
    select x.mid, o.payer, -x.amt
    from orig o
    join public.transactions r
      on r.reversal_of_id = o.id and r.family_id = (select id from fam)
     and r.status = 'paid' and r.deleted_at is null
    cross join lateral unnest(o.ids, private.allocate_cents(r.amount, o.wts)) as x(mid, amt)
    where x.mid <> o.payer
    union all
    select st.from_member_id, st.to_member_id, -st.amount
    from public.settlements st
    where st.family_id = (select id from fam) and st.deleted_at is null
  ),
  pairs as (
    select least(w.debtor, w.creditor) as a, greatest(w.debtor, w.creditor) as b,
           sum(case when w.debtor < w.creditor then w.amt else -w.amt end) as net
    from owes w
    group by 1, 2
  )
  select case when p.net > 0 then p.a else p.b end,
         case when p.net > 0 then p.b else p.a end,
         round(abs(p.net), 2)::text
  from pairs p
  where p.net <> 0
  order by 1, 2;
end;
$$;
revoke execute on function public.member_balances() from public, anon;
grant execute on function public.member_balances() to authenticated;

-- D15: previsto por mês, a partir do mês de hoje (p_months de 1 a 12; todos os meses presentes).
-- Pendente = pending não excluído, income/expense, com data no mês (no 1º mês, também as anteriores a hoje).
-- Recorrente = séries ativas, datas da agenda >= greatest(next_occurrence_date, hoje) e <= end_date, no mês (máx. 60 por série).
create function public.projected_cash_flow(p_months integer)
returns table (month date, pending_income text, pending_expense text, recurring_income text, recurring_expense text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_today date := private.today();
  v_first date;
  v_end date;  -- primeiro dia depois da janela
begin
  if p_months is null or p_months < 1 or p_months > 12 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  v_first := date_trunc('month', v_today::timestamp)::date;
  v_end := (v_first + make_interval(months => p_months))::date;

  return query
  with months as (
    select (v_first + make_interval(months => i))::date as first_day, i
    from generate_series(0, p_months - 1) as i
  ),
  pend as (
    select case when t.transaction_date < v_first then v_first
                else date_trunc('month', t.transaction_date::timestamp)::date end as m,
           t.type, t.amount
    from public.transactions t
    where t.family_id = (select private.current_family_id())
      and t.status = 'pending' and t.deleted_at is null and t.type in ('income', 'expense')
      and t.transaction_date < v_end
  ),
  series as (
    select r.type, r.amount, r.start_date, r.frequency, r.interval_count, r.end_date,
           private.recurrence_first_index(r.start_date, r.frequency, r.interval_count,
             greatest(r.next_occurrence_date, v_today)) as idx
    from public.recurrences r
    where r.family_id = (select private.current_family_id()) and r.is_active
  ),
  virt as (
    select date_trunc('month', d.occ::timestamp)::date as m, s.type, s.amount
    from series s
    cross join lateral generate_series(s.idx, s.idx + 59) as n
    cross join lateral (
      select private.recurrence_occurrence(s.start_date, s.frequency, s.interval_count, n) as occ
    ) d
    where d.occ >= v_today and d.occ < v_end and (s.end_date is null or d.occ <= s.end_date)
  )
  select mo.first_day,
         round(coalesce((select sum(p.amount) from pend p where p.m = mo.first_day and p.type = 'income'), 0), 2)::text,
         round(coalesce((select sum(p.amount) from pend p where p.m = mo.first_day and p.type = 'expense'), 0), 2)::text,
         round(coalesce((select sum(v.amount) from virt v where v.m = mo.first_day and v.type = 'income'), 0), 2)::text,
         round(coalesce((select sum(v.amount) from virt v where v.m = mo.first_day and v.type = 'expense'), 0), 2)::text
  from months mo
  order by mo.first_day;
end;
$$;
revoke execute on function public.projected_cash_flow(integer) from public, anon;
grant execute on function public.projected_cash_flow(integer) to authenticated;

-- DOWN (manual): drop function public.projected_cash_flow(integer); drop function public.member_balances();
--   drop function public.goal_summary(date, date).
-- Efeito em dados existentes: nenhum (funções novas, só leitura).
