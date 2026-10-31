-- ADR-0041 / D26 · R24 (cartão fecha 11, vence 16), R26 (fecha 30, vence 5, parcelas), isolamento entre famílias pelo campo computado
-- public.reporting_date, INVALID_INPUT de private.reporting_transactions e privilégios das funções novas.
begin;

select plan(30);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, credit_limit, statement_closing_day, statement_due_day, is_active, created_by) values
  ('a6950000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2026-09-01', null, null, null, true, tests.uid('a')),
  ('a6950000-0000-0000-0000-000000000002', tests.fid('A'), 'Cartão 11/16', 'credit_card', 0, '2026-09-01', 5000, 11, 16, true, tests.uid('a')),
  ('a6950000-0000-0000-0000-000000000003', tests.fid('A'), 'Cartão 30/5', 'credit_card', 0, '2026-09-01', 5000, 30, 5, true, tests.uid('a')),
  ('a6950000-0000-0000-0000-0000000000b1', tests.fid('B'), 'Corrente B', 'checking', 0, '2026-09-01', null, null, null, true, tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c6950000-0000-0000-0000-000000000001', tests.fid('A'), 'Compras', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c6950000-0000-0000-0000-0000000000b1', tests.fid('B'), 'Compras B', 'expense', 'chart-1', 'utensils', tests.uid('b'));

-- R24: compras no cartão 10/09 50 · 11/09 80 · 10/10 40 · 11/10 10; despesa 100 na corrente em 11/10; pagamento da fatura 50 em 16/09
insert into public.transactions (id, family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date, status, created_by) values
  ('f6950000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a6950000-0000-0000-0000-000000000002', null, 'c6950000-0000-0000-0000-000000000001', 'Cartão 10/09', 50, '2026-09-10', 'paid', tests.uid('a')),
  ('f6950000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a6950000-0000-0000-0000-000000000002', null, 'c6950000-0000-0000-0000-000000000001', 'Cartão 11/09', 80, '2026-09-11', 'paid', tests.uid('a')),
  ('f6950000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a6950000-0000-0000-0000-000000000002', null, 'c6950000-0000-0000-0000-000000000001', 'Cartão 10/10', 40, '2026-10-10', 'paid', tests.uid('a')),
  ('f6950000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a6950000-0000-0000-0000-000000000002', null, 'c6950000-0000-0000-0000-000000000001', 'Cartão 11/10', 10, '2026-10-11', 'paid', tests.uid('a')),
  ('f6950000-0000-0000-0000-000000000005', tests.fid('A'), 'expense', 'a6950000-0000-0000-0000-000000000001', null, 'c6950000-0000-0000-0000-000000000001', 'Corrente 11/10', 100, '2026-10-11', 'paid', tests.uid('a')),
  ('f6950000-0000-0000-0000-000000000006', tests.fid('A'), 'transfer', 'a6950000-0000-0000-0000-000000000001', 'a6950000-0000-0000-0000-000000000002', null, 'Pagamento da fatura', 50, '2026-09-16', 'paid', tests.uid('a')),
  ('f6950000-0000-0000-0000-0000000000b1', tests.fid('B'), 'expense', 'a6950000-0000-0000-0000-0000000000b1', null, 'c6950000-0000-0000-0000-0000000000b1', 'Despesa B', 7, '2026-10-11', 'paid', tests.uid('b'));
select tests.login_as('a');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, reversal_of_id) values
  (tests.fid('A'), 'expense', 'a6950000-0000-0000-0000-000000000002', 'c6950000-0000-0000-0000-000000000001', 'Estorno 20/10', 15, '2026-10-20', 'paid', 'f6950000-0000-0000-0000-000000000003');
insert into public.budgets (family_id, category_id, amount_limit, start_month) values (tests.fid('A'), null, 1000, '2025-01-01');

-- R24 · totais por mês -----------------------------------------------------------------------------------------------------------
select results_eq($$select month, expense from public.monthly_cash_flow('2026-09-01', '2026-11-30')$$,
  $$values ('2026-09-01'::date, '50.00'::text), ('2026-10-01'::date, '220.00'::text), ('2026-11-01'::date, '-5.00'::text)$$,
  'R24: despesas set 50,00 · out 220,00 (80 + 40 + 100) · nov -5,00 (10 - 15)');
select is((select expense from public.period_summary('2026-09-01', '2026-11-30')), '265.00', 'R24: Σ = period_summary(set..nov) = 265,00');
select is((select expense from public.period_summary('2026-10-01', '2026-10-31')), '220.00', 'R24: period_summary(out) = 220,00');
select is((select sum(amount::numeric) from public.category_totals('2026-11-01', '2026-11-30', 'expense')), -5.00, 'R24: category_totals(nov) = -5,00');
select is((select sum(amount::numeric) from public.category_totals('2026-10-01', '2026-10-31', 'expense')), 220.00, 'R24: category_totals(out) = 220,00');
select is((select spent from public.budget_progress('2026-10-01', '2026-10-01')), '220.00', 'R24: budget_progress "Todas" em out: realizado 220,00');
select is((select sum(amount::numeric) from public.member_expense_totals('2026-10-01', '2026-10-31')), 220.00, 'R24: Σ member_expense_totals(out) = 220,00');
select is((select sum(amount::numeric) from public.member_expense_totals('2026-11-01', '2026-11-30')), -5.00, 'R24: Σ member_expense_totals(nov) = -5,00');
-- R24 · saldo e fluxo da conta continuam pela data real (P2)
select is((select balance from public.account_balances('2026-10-31') where account_id = 'a6950000-0000-0000-0000-000000000002'), '-115.00',
  'R24: saldo do cartão em 31/10 = -115,00 (data real)');
select results_eq($$select inflow, outflow from public.account_flows('2026-10-01', '2026-10-31') where account_id = 'a6950000-0000-0000-0000-000000000002'$$,
  $$values ('15.00'::text, '50.00'::text)$$, 'R24: account_flows(out) do cartão: entradas 15,00 e saídas 50,00 (10/10 e 11/10)');
-- R24 · filtro de Transações de outubro (campo computado): 11/09 e 10/10 do cartão e 11/10 da corrente, não a de 11/10 do cartão
select results_eq($$select t.description from public.transactions t
    where t.type = 'expense' and t.reversal_of_id is null and public.reporting_date(t) between '2026-10-01' and '2026-10-31' order by t.description$$,
  $$values ('Cartão 10/10'::text), ('Cartão 11/09'), ('Corrente 11/10')$$,
  'R24: Transações de outubro por data de apuração = 11/09 e 10/10 (cartão) e 11/10 (corrente)');
select is((select public.reporting_date(t) from public.transactions t where t.id = 'f6950000-0000-0000-0000-000000000004'), '2026-11-16'::date,
  'R24: a compra de 11/10 no cartão tem data de apuração 16/11 (a data real continua 11/10)');
select is((select public.reporting_date(t) from public.transactions t where t.id = 'f6950000-0000-0000-0000-000000000005'), '2026-10-11'::date,
  'conta corrente: data de apuração = transaction_date');
select is((select public.reporting_date(t) from public.transactions t where t.id = 'f6950000-0000-0000-0000-000000000006'), '2026-09-16'::date,
  'transferência (pagamento da fatura): data de apuração = transaction_date');

-- R26 · cartão 30/5, 3x de 100 em 29/01, 28/02 e 29/03/2025 (parcelas 2 e 3 na mesma fatura); pendente 50 em 10/03 -------------------
select tests.logout();
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by) values
  (tests.fid('A'), 'expense', 'a6950000-0000-0000-0000-000000000003', 'c6950000-0000-0000-0000-000000000001', 'R26 parcela 1', 100, '2025-01-29', 'paid', tests.uid('a')),
  (tests.fid('A'), 'expense', 'a6950000-0000-0000-0000-000000000003', 'c6950000-0000-0000-0000-000000000001', 'R26 parcela 2', 100, '2025-02-28', 'paid', tests.uid('a')),
  (tests.fid('A'), 'expense', 'a6950000-0000-0000-0000-000000000003', 'c6950000-0000-0000-0000-000000000001', 'R26 parcela 3', 100, '2025-03-29', 'paid', tests.uid('a')),
  (tests.fid('A'), 'expense', 'a6950000-0000-0000-0000-000000000003', 'c6950000-0000-0000-0000-000000000001', 'R26 pendente', 50, '2025-03-10', 'pending', tests.uid('a'));
select tests.login_as('a');
select results_eq($$select month, expense from public.monthly_cash_flow('2025-02-01', '2025-04-30')$$,
  $$values ('2025-02-01'::date, '100.00'::text), ('2025-03-01'::date, '0.00'::text), ('2025-04-01'::date, '200.00'::text)$$,
  'R26: despesas fev 100,00 · mar 0,00 · abr 200,00');
select is((select committed from public.budget_progress('2025-04-01', '2025-04-01')), '50.00', 'R26: o pendente de 10/03 conta no comprometido de abril');
select is((select committed from public.budget_progress('2025-03-01', '2025-03-01')), '0.00', 'R26: comprometido de março 0,00');
-- arquivar o cartão não muda nenhum mês
select tests.logout();
update public.accounts set is_active = false where id = 'a6950000-0000-0000-0000-000000000003';
select tests.login_as('a');
select results_eq($$select month, expense from public.monthly_cash_flow('2025-02-01', '2025-04-30')$$,
  $$values ('2025-02-01'::date, '100.00'::text), ('2025-03-01'::date, '0.00'::text), ('2025-04-01'::date, '200.00'::text)$$,
  'R26: arquivar o cartão não muda nenhum mês');

-- Isolamento · o campo computado não vaza os dias do cartão de A para B ---------------------------------------------------------------
select tests.logout();
select tests.login_as('b');
select is((select public.reporting_date(jsonb_populate_record(null::public.transactions, jsonb_build_object(
      'family_id', tests.fid('A'), 'type', 'expense', 'account_id', 'a6950000-0000-0000-0000-000000000002', 'transaction_date', '2026-10-11')))),
  '2026-10-11'::date, 'isolamento: B com linha forjada (conta de A) recebe a própria transaction_date, sem os dias do cartão de A');
select is((select expense from public.period_summary('2026-10-01', '2026-10-31')), '7.00', 'isolamento: period_summary de B = 7,00');
select is((select count(*)::int from private.reporting_transactions('2026-09-01', '2026-12-31')), 1, 'isolamento: B só enxerga a própria linha em reporting_transactions');
select tests.logout();

-- INVALID_INPUT -------------------------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok($$select * from private.reporting_transactions(null, '2026-10-31')$$, 'P0001', 'INVALID_INPUT', 'INVALID_INPUT: de nulo');
select throws_ok($$select * from private.reporting_transactions('2026-10-01', null)$$, 'P0001', 'INVALID_INPUT', 'INVALID_INPUT: até nulo');
select throws_ok($$select * from private.reporting_transactions('2026-10-31', '2026-10-01')$$, 'P0001', 'INVALID_INPUT', 'INVALID_INPUT: intervalo invertido');
select throws_ok($$select * from private.reporting_transactions('-infinity', '2026-10-01')$$, 'P0001', 'INVALID_INPUT', 'INVALID_INPUT: -infinity');
select throws_ok($$select * from private.reporting_transactions('2026-10-01', 'infinity')$$, 'P0001', 'INVALID_INPUT', 'INVALID_INPUT: infinity');
select throws_ok($$select * from public.period_summary('4713-01-01 BC'::date, '2026-01-31')$$, 'P0001', 'INVALID_INPUT', 'INVALID_INPUT: period_summary com início antes de 2000 (4713 a.C.)');
select throws_ok($$select * from public.monthly_cash_flow('2026-01-01', '10000-01-01'::date)$$, 'P0001', 'INVALID_INPUT', 'INVALID_INPUT: monthly_cash_flow com fim acima de 9999');
select tests.logout();

-- Privilégios ---------------------------------------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'private.card_invoice_closing(date,smallint)', 'execute')
  and not has_function_privilege('anon', 'private.card_invoice_due(date,smallint,smallint)', 'execute')
  and not has_function_privilege('anon', 'private.reporting_date_of(date,text,text,smallint,smallint)', 'execute')
  and not has_function_privilege('anon', 'private.reporting_transactions(date,date)', 'execute')
  and not has_function_privilege('anon', 'public.reporting_date(public.transactions)', 'execute'),
  'privilégios: anon sem EXECUTE nas 5 funções novas');
select ok(has_function_privilege('authenticated', 'private.card_invoice_closing(date,smallint)', 'execute')
  and has_function_privilege('authenticated', 'private.card_invoice_due(date,smallint,smallint)', 'execute')
  and has_function_privilege('authenticated', 'private.reporting_date_of(date,text,text,smallint,smallint)', 'execute')
  and has_function_privilege('authenticated', 'private.reporting_transactions(date,date)', 'execute')
  and has_function_privilege('authenticated', 'public.reporting_date(public.transactions)', 'execute'),
  'privilégios: authenticated executa as 5 funções novas');

select * from finish();
rollback;
