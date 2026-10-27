-- CA-E4-04, CA-E4-05, CA-E4-06: regressão financeira do dashboard no banco (financial-definitions.md §3): R9, R10 (via period_summary),
-- R11, soma dos meses = period_summary e teto por valor. Cada cenário usa um ano próprio; as contas começam em 2020-01-01.
begin;

select plan(14);

select tests.setup_world();

insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c3000000-0000-0000-0000-000000000001', tests.fid('A'), 'Alimentação', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c3000000-0000-0000-0000-000000000003', tests.fid('A'), 'Transporte', 'expense', 'chart-2', 'car', tests.uid('a')),
  ('c3000000-0000-0000-0000-000000000004', tests.fid('A'), 'Antiga', 'expense', 'chart-3', 'utensils', tests.uid('a')),
  ('c3000000-0000-0000-0000-000000000005', tests.fid('A'), 'Salário', 'income', 'chart-4', 'briefcase', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, parent_id, created_by) values
  ('c3000000-0000-0000-0000-000000000002', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', 'c3000000-0000-0000-0000-000000000001', tests.uid('a'));

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, statement_closing_day, statement_due_day, created_by) values
  ('a3000000-0000-0000-0000-000000000001', tests.fid('A'), 'E4 Corrente', 'checking', 1000000, '2020-01-01', null, null, tests.uid('a')),
  ('a3000000-0000-0000-0000-000000000002', tests.fid('A'), 'E4 Cartão', 'credit_card', 0, '2020-01-01', 10, 20, tests.uid('a'));

select tests.login_as('a');

-- R9 · setembro e outubro/2024 -----------------------------------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date, status) values
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', null, 'c3000000-0000-0000-0000-000000000001', 'R9 alimentação', 80, '2024-09-05', 'paid'),
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', null, 'c3000000-0000-0000-0000-000000000002', 'R9 mercado', 120, '2024-09-06', 'paid'),
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', null, 'c3000000-0000-0000-0000-000000000003', 'R9 transporte', 50, '2024-09-07', 'paid'),
  (tests.fid('A'), 'transfer', 'a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', null, 'R9 transferência', 100, '2024-09-08', 'paid'),
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', null, 'c3000000-0000-0000-0000-000000000001', 'R9 pendente', 30, '2024-09-09', 'pending'),
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', null, 'c3000000-0000-0000-0000-000000000001', 'R9 cancelada', 40, '2024-09-10', 'pending'),
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', null, 'c3000000-0000-0000-0000-000000000003', 'R9 excluída', 999, '2024-09-11', 'paid');
update public.transactions set deleted_at = now() where description = 'R9 excluída';
select tests.logout();
update public.transactions set status = 'canceled' where description = 'R9 cancelada';
select tests.login_as('a');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
select tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002', 'R9 estorno', 20, '2024-10-03', t.id
from public.transactions t where t.description = 'R9 mercado';

select results_eq($$select category_id, amount from public.category_totals('2024-09-01', '2024-09-30', 'expense')$$,
  $$values ('c3000000-0000-0000-0000-000000000001'::uuid, '200.00'::text), ('c3000000-0000-0000-0000-000000000003'::uuid, '50.00'::text)$$,
  'CA-E4-04 R9: Alimentação 200,00 (Mercado somada à pai), Transporte 50,00; transferência, pendente, cancelado e excluído fora');
select results_eq($$select category_id, amount from public.category_totals('2024-10-01', '2024-10-31', 'expense')$$,
  $$values ('c3000000-0000-0000-0000-000000000001'::uuid, '-20.00'::text)$$,
  'CA-E4-04 R9: estorno abate em outubro, Alimentação -20,00 (categoria negativa devolvida)');
select is((select expense from public.period_summary('2024-10-01', '2024-10-31')), '-20.00', 'CA-E4-04 R9: despesas(out) = -20,00');
select is((select count(*)::int from public.category_totals('2024-09-01', '2024-09-30', 'income')), 0, 'CA-E4-04: sem receitas em setembro, nenhuma linha (total 0 omitido)');

-- categoria arquivada continua nos totais (e total 0 é omitido)
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000004', 'R9 arquivada', 30, '2024-03-05'),
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000004', 'R9 arquivada zero', 10, '2024-03-06');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
select tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000004', 'R9 estorno zero', 10, '2024-03-07', t.id
from public.transactions t where t.description = 'R9 arquivada zero';
select tests.logout();
update public.categories set archived_at = now() where id = 'c3000000-0000-0000-0000-000000000004';
select tests.login_as('a');
select results_eq($$select category_id, amount from public.category_totals('2024-03-01', '2024-03-31', 'expense')$$,
  $$values ('c3000000-0000-0000-0000-000000000004'::uuid, '30.00'::text)$$,
  'CA-E4-04: categoria arquivada incluída; categoria com total 0 (despesa 10 e estorno 10) omitida da lista');

-- R10 · setembro e outubro/2023 (period_summary) --------------------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'R10 set despesa', 200, '2023-09-10'),
  (tests.fid('A'), 'income', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000005', 'R10 out receita', 500, '2023-10-05'),
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'R10 out despesa', 250, '2023-10-06');
select results_eq($$select income, expense, result from public.period_summary('2023-09-01', '2023-09-30')$$,
  $$values ('0.00'::text, '200.00'::text, '-200.00'::text)$$, 'CA-E4-04 R10: setembro 0 / 200,00 / -200,00');
select results_eq($$select income, expense, result from public.period_summary('2023-10-01', '2023-10-31')$$,
  $$values ('500.00'::text, '250.00'::text, '250.00'::text)$$, 'CA-E4-04 R10: outubro 500,00 / 250,00 / 250,00');

-- R11 · janela jan–jun/2022 -------------------------------------------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000002', null, 'c3000000-0000-0000-0000-000000000001', 'R11 compra no cartão', 300, '2022-03-15'),
  (tests.fid('A'), 'transfer', 'a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002', null, 'R11 pagamento da fatura', 300, '2022-04-10'),
  (tests.fid('A'), 'income', 'a3000000-0000-0000-0000-000000000001', null, 'c3000000-0000-0000-0000-000000000005', 'R11 receita', 500, '2022-05-05'),
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', null, 'c3000000-0000-0000-0000-000000000001', 'R11 despesa', 100, '2022-05-06');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
select tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'R11 estorno', 50, '2022-05-20', t.id
from public.transactions t where t.description = 'R11 despesa';

select results_eq($$select month, income, expense, result from public.monthly_cash_flow('2022-01-15', '2022-06-30')$$,
  $$values ('2022-01-01'::date, '0.00'::text, '0.00'::text, '0.00'::text),
           ('2022-02-01'::date, '0.00'::text, '0.00'::text, '0.00'::text),
           ('2022-03-01'::date, '0.00'::text, '300.00'::text, '-300.00'::text),
           ('2022-04-01'::date, '0.00'::text, '0.00'::text, '0.00'::text),
           ('2022-05-01'::date, '500.00'::text, '50.00'::text, '450.00'::text),
           ('2022-06-01'::date, '0.00'::text, '0.00'::text, '0.00'::text)$$,
  'CA-E4-05 R11: 6 meses presentes e em ordem; cartão em março, pagamento da fatura fora, estorno abate em maio');
select results_eq($$select sum(income::numeric)::text, sum(expense::numeric)::text, sum(result::numeric)::text from public.monthly_cash_flow('2022-01-01', '2022-06-30')$$,
  $$select income, expense, result from public.period_summary('2022-01-01', '2022-06-30')$$,
  'CA-E4-05: soma dos meses = period_summary do intervalo');
select results_eq($$select income, expense, result from public.period_summary('2022-01-01', '2022-06-30')$$,
  $$values ('500.00'::text, '350.00'::text, '150.00'::text)$$, 'CA-E4-05 R11: período 500,00 / 350,00 / 150,00');
select is((select count(*)::int from public.monthly_cash_flow('2022-05-20', '2022-05-25')), 1,
  'CA-E4-05: intervalo dentro de um mês devolve esse mês inteiro, uma linha');

-- teto · dois lançamentos de 99.999.999,99 em maio/2021 -----------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'income', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000005', 'Teto receita 1', 99999999.99, '2021-05-05'),
  (tests.fid('A'), 'income', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000005', 'Teto receita 2', 99999999.99, '2021-05-06'),
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'Teto despesa 1', 99999999.99, '2021-05-07'),
  (tests.fid('A'), 'expense', 'a3000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000001', 'Teto despesa 2', 99999999.99, '2021-05-08');
select results_eq($$select income, expense, result from public.monthly_cash_flow('2021-05-01', '2021-05-31')$$,
  $$values ('199999999.98'::text, '199999999.98'::text, '0.00'::text)$$, 'CA-E4-06: dois lançamentos no teto somados exatos (199999999.98)');
select results_eq($$select amount from public.category_totals('2021-05-01', '2021-05-31', 'expense')$$,
  $$values ('199999999.98'::text)$$, 'CA-E4-06: category_totals soma o teto sem erro');
select is((select pg_typeof(amount)::text from public.category_totals('2021-05-01', '2021-05-31', 'expense')), 'text',
  'CA-E4-06: amount é text');

select * from finish();
rollback;
