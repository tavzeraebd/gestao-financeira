-- CA-E5-15 (pending_summary), CA-E5-17 (regressão R1-R4, R7, R8, R12, R14; R13 está em 340; R5 em 320). Pendentes e cancelados
-- convivem com os números das etapas 3 e 4 sem alterá-los.
begin;

select plan(26);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, statement_closing_day, statement_due_day, created_by) values
  ('aa000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 1000, '2020-01-01', null, null, tests.uid('a')),
  ('aa000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2020-01-01', null, null, tests.uid('a')),
  ('aa000000-0000-0000-0000-000000000003', tests.fid('A'), 'Cartão', 'credit_card', 0, '2020-01-01', 10, 20, tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('ca000000-0000-0000-0000-000000000001', tests.fid('A'), 'Alimentação', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('ca000000-0000-0000-0000-000000000003', tests.fid('A'), 'Transporte', 'expense', 'chart-2', 'car', tests.uid('a')),
  ('ca000000-0000-0000-0000-000000000004', tests.fid('A'), 'Salário', 'income', 'chart-3', 'briefcase', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, parent_id, created_by) values
  ('ca000000-0000-0000-0000-000000000002', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', 'ca000000-0000-0000-0000-000000000001', tests.uid('a'));

select tests.logout();
select set_config('request.jwt.claims', json_build_object('sub', tests.uid('a'), 'role', 'authenticated')::text, true);

-- R1 · mar/2023 ---------------------------------------------------------------------------------------------------------------
insert into public.transactions (id, family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date) values
  ('fa000000-0000-0000-0000-000000000001', tests.fid('A'), 'income', 'aa000000-0000-0000-0000-000000000001', null, 'ca000000-0000-0000-0000-000000000004', 'R1 receita', 500, '2023-03-05'),
  ('fa000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', null, 'ca000000-0000-0000-0000-000000000001', 'R1 despesa', 200, '2023-03-06'),
  ('fa000000-0000-0000-0000-000000000003', tests.fid('A'), 'transfer', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000002', null, 'R1 transferência', 100, '2023-03-07');
select results_eq($$select account_id, balance from public.account_balances('2023-03-31') where account_id in ('aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000002') order by account_id$$,
  $$values ('aa000000-0000-0000-0000-000000000001'::uuid, '1200.00'::text), ('aa000000-0000-0000-0000-000000000002'::uuid, '100.00'::text)$$, 'CA-E5-17 R1: corrente 1.200,00 e poupança 100,00');
select results_eq($$select income, expense, result from public.period_summary('2023-03-01', '2023-03-31')$$,
  $$values ('500.00'::text, '200.00'::text, '300.00'::text)$$, 'CA-E5-17 R1: receitas 500,00, despesas 200,00, resultado 300,00');
select is((select sum(balance::numeric) from public.account_balances('2023-03-31')), 1300.00, 'CA-E5-17 R1: consolidado 1.300,00');

-- R2 · estorno de 50,00 ---------------------------------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
values (tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'R2 estorno', 50, '2023-03-10', 'fa000000-0000-0000-0000-000000000002');
select is((select sum(balance::numeric) from public.account_balances('2023-03-31')), 1350.00, 'CA-E5-17 R2: consolidado 1.350,00');
select is((select expense from public.period_summary('2023-03-01', '2023-03-31')), '150.00', 'CA-E5-17 R2: despesas 150,00');

-- R3 + R12 · pendente de 80,00 vencido ontem; pagar hoje com 85,00 ---------------------------------------------------------------
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status) values
  ('fa000000-0000-0000-0000-000000000010', tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'R3 pendente', 80, private.today() - 1, 'pending');
select is((select sum(balance::numeric) from public.account_balances(private.today())), 1350.00, 'CA-E5-17 R3: consolidado inalterado com pendente (1.350,00 nesta base)');
select results_eq($$select payable, receivable, overdue_payable, overdue_receivable, overdue_count from public.pending_summary()$$,
  $$values ('80.00'::text, '0.00'::text, '80.00'::text, '0.00'::text, 1)$$, 'CA-E5-15 R3: a pagar 80,00; vencido (data < hoje) 80,00; contagem 1');
select is((select expense from public.period_summary('2023-03-01', '2023-03-31')), '150.00', 'CA-E5-17 R3: despesas realizadas sem o pendente');
select set_config('tests.rows', (select count(*)::text from public.transactions), true);
select lives_ok($$select public.pay_pending_transaction('fa000000-0000-0000-0000-000000000010', private.today(), 85, 'aa000000-0000-0000-0000-000000000001')$$, 'CA-E5-17 R12: paga com 85,00 hoje');
select results_eq($$select status, transaction_date, due_date, amount from public.transactions where id = 'fa000000-0000-0000-0000-000000000010'$$,
  $$select 'paid'::text, private.today(), private.today() - 1, 85.00::numeric$$, 'CA-E5-17 R12: mesma linha paid, data = hoje, due_date = ontem');
select is((select count(*)::text from public.transactions), current_setting('tests.rows'), 'CA-E5-17 R12: contagem de linhas igual');
select is((select expense from public.period_summary(private.today(), private.today())), '85.00', 'CA-E5-17 R12: despesas do dia +85,00');
select is((select sum(balance::numeric) from public.account_balances(private.today())), 1265.00, 'CA-E5-17 R12: saldo −85,00 (1.350,00 → 1.265,00)');
select results_eq($$select payable, overdue_payable, overdue_count from public.pending_summary()$$,
  $$values ('0.00'::text, '0.00'::text, 0)$$, 'CA-E5-15 R12: comprometido 0 depois do pagamento');
select throws_ok($$select public.pay_pending_transaction('fa000000-0000-0000-0000-000000000010', private.today(), 85, 'aa000000-0000-0000-0000-000000000001')$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E5-17 R12: segundo pagamento → INVALID_STATUS_TRANSITION');

-- CA-E5-15 · a receber, vencidos por data e exclusões --------------------------------------------------------------------------
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status) values
  ('fa000000-0000-0000-0000-000000000011', tests.fid('A'), 'income', 'aa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000004', 'A receber vencida', 40, private.today() - 3, 'pending'),
  ('fa000000-0000-0000-0000-000000000012', tests.fid('A'), 'income', 'aa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000004', 'A receber hoje', 25, private.today(), 'pending'),
  ('fa000000-0000-0000-0000-000000000013', tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'A pagar futura', 10, private.today() + 5, 'pending'),
  ('fa000000-0000-0000-0000-000000000014', tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Será cancelada', 99, private.today() - 2, 'pending'),
  ('fa000000-0000-0000-0000-000000000015', tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'Será excluída', 98, private.today() - 2, 'pending');
select public.cancel_pending_transaction('fa000000-0000-0000-0000-000000000014');
update public.transactions set deleted_at = now() where id = 'fa000000-0000-0000-0000-000000000015';
select results_eq($$select payable, receivable, overdue_payable, overdue_receivable, overdue_count from public.pending_summary()$$,
  $$values ('10.00'::text, '65.00'::text, '0.00'::text, '40.00'::text, 1)$$,
  'CA-E5-15: vencido só com data < hoje (a de hoje não); cancelada e excluída fora');
select tests.login_as('b');
select results_eq($$select payable, receivable, overdue_count from public.pending_summary()$$,
  $$values ('0.00'::text, '0.00'::text, 0)$$, 'CA-E5-15: outra família não vê nada');
select tests.logout();
select set_config('request.jwt.claims', json_build_object('sub', tests.uid('a'), 'role', 'authenticated')::text, true);

-- R7 / R8 · edição e exclusão lógica ---------------------------------------------------------------------------------------------
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date) values
  ('fa000000-0000-0000-0000-000000000020', tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'R7', 200, '2022-05-10');
update public.transactions set amount = 250 where id = 'fa000000-0000-0000-0000-000000000020';
select is((select expense from public.period_summary('2022-05-01', '2022-05-31')), '250.00', 'CA-E5-17 R7: despesas 250,00');
select is((select metadata from public.audit_events where action = 'transaction.updated' and entity_id = 'fa000000-0000-0000-0000-000000000020'),
  '{"changed": ["amount"], "old": {"amount": "200.00"}, "new": {"amount": "250.00"}}'::jsonb, 'CA-E5-17 R7: auditoria com old/new');
update public.transactions set deleted_at = now() where id = 'fa000000-0000-0000-0000-000000000020';
select is((select expense from public.period_summary('2022-05-01', '2022-05-31')), '0.00', 'CA-E5-17 R8: despesas 0,00 após exclusão lógica');
select ok((select deleted_at is not null from public.transactions where id = 'fa000000-0000-0000-0000-000000000020'), 'CA-E5-17 R8: linha preservada com deleted_at');

-- R4 · cartão em março, pagamento da fatura em abril/2021 -------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000003', null, 'ca000000-0000-0000-0000-000000000001', 'R4 compra', 300, '2021-03-15'),
  (tests.fid('A'), 'transfer', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000003', null, 'R4 fatura', 300, '2021-04-10');
select is((select expense from public.period_summary('2021-03-01', '2021-03-31')), '300.00', 'CA-E5-17 R4: despesas de março 300,00');
select is((select expense from public.period_summary('2021-04-01', '2021-04-30')), '0.00', 'CA-E5-17 R4: abril 0,00 (pagamento da fatura não é despesa)');

-- R14 · orçamento em ago/2022 -----------------------------------------------------------------------------------------------------------------
insert into public.transactions (id, family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date, status) values
  ('fa000000-0000-0000-0000-000000000031', tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', null, 'ca000000-0000-0000-0000-000000000001', 'R14 alimentação', 300, '2022-08-05', 'paid'),
  ('fa000000-0000-0000-0000-000000000032', tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', null, 'ca000000-0000-0000-0000-000000000002', 'R14 mercado', 150, '2022-08-06', 'paid'),
  ('fa000000-0000-0000-0000-000000000033', tests.fid('A'), 'transfer', 'aa000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000002', null, 'R14 transferência', 100, '2022-08-07', 'paid'),
  ('fa000000-0000-0000-0000-000000000034', tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', null, 'ca000000-0000-0000-0000-000000000003', 'R14 transporte', 60, '2022-08-08', 'paid'),
  ('fa000000-0000-0000-0000-000000000035', tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', null, 'ca000000-0000-0000-0000-000000000001', 'R14 pendente', 80, '2022-08-20', 'pending');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
values (tests.fid('A'), 'expense', 'aa000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'R14 estorno', 50, '2022-08-10', 'fa000000-0000-0000-0000-000000000031');
insert into public.budgets (family_id, category_id, amount_limit, start_month) values
  (tests.fid('A'), 'ca000000-0000-0000-0000-000000000001', 500, '2022-01-01'),
  (tests.fid('A'), null, 400, '2022-01-01');
select results_eq($$select p.spent, p.committed from public.budget_progress('2022-08-01', '2022-08-01') p join public.budgets b on b.id = p.budget_id where b.category_id is not null$$,
  $$values ('400.00'::text, '80.00'::text)$$, 'CA-E5-17 R14: Alimentação realizado 400,00, comprometido 80,00 (disponível 100,00, 80,0%)');
select results_eq($$select p.spent, p.committed from public.budget_progress('2022-08-01', '2022-08-01') p join public.budgets b on b.id = p.budget_id where b.category_id is null$$,
  $$values ('460.00'::text, '80.00'::text)$$, 'CA-E5-17 R14: "Todas" realizado 460,00 (115,0%, disponível −60,00)');
select is((select expense from public.period_summary('2022-08-01', '2022-08-31')), '460.00', 'CA-E5-17 R14: despesas do mês = realizado de "Todas"');

select * from finish();
rollback;
