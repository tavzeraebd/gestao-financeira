-- CA-E4-01, CA-E4-02, CA-E4-03: monthly_cash_flow e category_totals — segurança da função, validação de entrada e isolamento entre famílias.
begin;

select plan(28);

select tests.setup_world();

-- CA-E4-01 -----------------------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('monthly_cash_flow', 'category_totals') and p.prosecdef), 0,
  'CA-E4-01: as duas funções são security invoker');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('monthly_cash_flow', 'category_totals') and p.provolatile = 's'), 2,
  'CA-E4-01: as duas funções são stable');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('monthly_cash_flow', 'category_totals')
             and coalesce(p.proconfig @> array['search_path=""'], false)), 2,
  'CA-E4-01: search_path vazio nas duas funções');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('monthly_cash_flow', 'category_totals')
             and (p.proargnames::text ilike '%family%' or p.proargnames::text ilike '%familia%')), 0,
  'CA-E4-01: nenhuma tem parâmetro de família');
select ok(not has_function_privilege('anon', 'public.monthly_cash_flow(date, date)', 'execute'), 'CA-E4-01: anon sem EXECUTE em monthly_cash_flow');
select ok(not has_function_privilege('anon', 'public.category_totals(date, date, text)', 'execute'), 'CA-E4-01: anon sem EXECUTE em category_totals');
select ok(has_function_privilege('authenticated', 'public.monthly_cash_flow(date, date)', 'execute'), 'CA-E4-01: authenticated com EXECUTE em monthly_cash_flow');
select ok(has_function_privilege('authenticated', 'public.category_totals(date, date, text)', 'execute'), 'CA-E4-01: authenticated com EXECUTE em category_totals');
select tests.login_anon();
select throws_ok($$select * from public.monthly_cash_flow('2026-09-01', '2026-09-30')$$, '42501', null, 'CA-E4-01: anon recebe 42501 em monthly_cash_flow');
select throws_ok($$select * from public.category_totals('2026-09-01', '2026-09-30', 'expense')$$, '42501', null, 'CA-E4-01: anon recebe 42501 em category_totals');
select tests.logout();
select is(pg_get_function_result('public.monthly_cash_flow(date, date)'::regprocedure),
  'TABLE(month date, income text, expense text, result text)', 'CA-E4-06: monthly_cash_flow devolve text para dinheiro');
select is(pg_get_function_result('public.category_totals(date, date, text)'::regprocedure),
  'TABLE(category_id uuid, amount text)', 'CA-E4-06: category_totals devolve text para dinheiro');

-- dados da família A -------------------------------------------------------------------------------------------------------------------
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c2000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c2000000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-1', 'briefcase', tests.uid('a'));
insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a2000000-0000-0000-0000-000000000001', tests.fid('A'), 'E4 Corrente', 'checking', 0, '2025-01-01', tests.uid('a'));
select tests.login_as('a');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'expense', 'a2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'E4 despesa', 100, '2026-09-10'),
  (tests.fid('A'), 'income', 'a2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000002', 'E4 receita', 400, '2026-09-11');

select results_eq($$select income, expense, result from public.monthly_cash_flow('2026-09-01', '2026-09-30')$$,
  $$values ('400.00'::text, '100.00'::text, '300.00'::text)$$, 'sanidade: A enxerga os próprios lançamentos');
select is((select count(*)::int from public.category_totals('2026-09-01', '2026-09-30', 'expense')), 1, 'sanidade: A enxerga a categoria com total');

-- CA-E4-02: isolamento ---------------------------------------------------------------------------------------------------------------------
select tests.logout();
select tests.login_as('b');
select is((select count(*)::int from public.category_totals('2000-01-01', '2026-12-31', 'expense')), 0, 'CA-E4-02: B não vê categorias de A (expense)');
select is((select count(*)::int from public.category_totals('2000-01-01', '2026-12-31', 'income')), 0, 'CA-E4-02: B não vê categorias de A (income)');
select is((select count(*)::int from public.monthly_cash_flow('2025-01-01', '2026-12-31') where income <> '0.00' or expense <> '0.00' or result <> '0.00'), 0,
  'CA-E4-02: B só recebe zeros no fluxo de caixa');
select tests.logout();
select tests.login_as('c');
select is((select count(*)::int from public.category_totals('2000-01-01', '2026-12-31', 'expense')), 0, 'CA-E4-02: C (sem família) não vê nada');
select is((select count(*)::int from public.monthly_cash_flow('2025-01-01', '2026-12-31') where income <> '0.00' or expense <> '0.00' or result <> '0.00'), 0,
  'CA-E4-02: C só recebe zeros no fluxo de caixa');

-- CA-E4-03: INVALID_INPUT ------------------------------------------------------------------------------------------------------------------
select tests.logout();
select tests.login_as('a');
select throws_ok($$select * from public.monthly_cash_flow(null, '2026-09-30')$$, 'P0001', 'INVALID_INPUT', 'CA-E4-03: fluxo com from nulo');
select throws_ok($$select * from public.monthly_cash_flow('2026-09-01', null)$$, 'P0001', 'INVALID_INPUT', 'CA-E4-03: fluxo com to nulo');
select throws_ok($$select * from public.monthly_cash_flow('2026-09-02', '2026-09-01')$$, 'P0001', 'INVALID_INPUT', 'CA-E4-03: fluxo com from > to');
select throws_ok($$select * from public.monthly_cash_flow('2024-09-01', '2026-09-30')$$, 'P0001', 'INVALID_INPUT', 'CA-E4-03: fluxo com 25 meses');
select throws_ok($$select * from public.category_totals('2026-09-01', '2026-09-30', 'transfer')$$, 'P0001', 'INVALID_INPUT', 'CA-E4-03: totais com tipo transfer');
select throws_ok($$select * from public.category_totals('2026-09-01', '2026-09-30', 'x')$$, 'P0001', 'INVALID_INPUT', 'CA-E4-03: totais com tipo x');
select throws_ok($$select * from public.category_totals(null, '2026-09-30', 'expense')$$, 'P0001', 'INVALID_INPUT', 'CA-E4-03: totais com from nulo');
select throws_ok($$select * from public.category_totals('2026-09-30', '2026-09-01', 'expense')$$, 'P0001', 'INVALID_INPUT', 'CA-E4-03: totais com from > to');
select is((select count(*)::int from public.monthly_cash_flow('2025-01-15', '2026-12-10')), 24, 'CA-E4-03: exatamente 24 meses é aceito');

select * from finish();
rollback;
