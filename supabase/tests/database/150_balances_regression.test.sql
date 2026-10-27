-- CA-E3-16: regressão financeira no banco (financial-definitions.md §3): R1, R2, R3, R4, R7 e R8,
-- com os valores exatos de account_balances/period_summary (sempre text). Cada cenário usa contas e um mês próprios.
begin;

select plan(36);

select tests.setup_world();

insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-1', 'briefcase', tests.uid('a'));

-- contas por cenário (saldo inicial em 2025-01-01)
insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, statement_closing_day, statement_due_day, created_by) values
  ('a1000000-0000-0000-0000-000000000011', tests.fid('A'), 'R1 Corrente', 'checking', 1000, '2025-01-01', null, null, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000012', tests.fid('A'), 'R1 Poupança', 'savings', 0, '2025-01-01', null, null, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000021', tests.fid('A'), 'R2 Corrente', 'checking', 1000, '2025-01-01', null, null, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000022', tests.fid('A'), 'R2 Poupança', 'savings', 0, '2025-01-01', null, null, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000031', tests.fid('A'), 'R3 Corrente', 'checking', 1000, '2025-01-01', null, null, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000032', tests.fid('A'), 'R3 Poupança', 'savings', 0, '2025-01-01', null, null, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000041', tests.fid('A'), 'R4 Corrente', 'checking', 1000, '2025-01-01', null, null, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000042', tests.fid('A'), 'R4 Cartão', 'credit_card', 0, '2025-01-01', 10, 20, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000071', tests.fid('A'), 'R7 Corrente', 'checking', 1000, '2025-01-01', null, null, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000081', tests.fid('A'), 'R8 Corrente', 'checking', 1000, '2025-01-01', null, null, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000091', tests.fid('A'), 'R2b Corrente', 'checking', 0, '2025-01-01', null, null, tests.uid('a'));

select tests.login_as('a');

-- R1 · fevereiro/2025 -----------------------------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'income', 'a1000000-0000-0000-0000-000000000011', null, 'c1000000-0000-0000-0000-000000000002', 'R1 receita', 500, '2025-02-05'),
  (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000011', null, 'c1000000-0000-0000-0000-000000000001', 'R1 despesa', 200, '2025-02-06'),
  (tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000012', null, 'R1 transferência', 100, '2025-02-07');

select is((select balance from public.account_balances('2025-02-28') where account_id = 'a1000000-0000-0000-0000-000000000011'), '1200.00',
  'CA-E3-16 R1: conta corrente 1.200,00');
select is((select balance from public.account_balances('2025-02-28') where account_id = 'a1000000-0000-0000-0000-000000000012'), '100.00',
  'CA-E3-16 R1: poupança 100,00');
select is((select sum(balance::numeric)::text from public.account_balances('2025-02-28')
            where account_id in ('a1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000012')), '1300.00',
  'CA-E3-16 R1: consolidado 1.300,00');
select results_eq($$select income, expense, result from public.period_summary('2025-02-01', '2025-02-28')$$,
  $$values ('500.00'::text, '200.00'::text, '300.00'::text)$$, 'CA-E3-16 R1: receitas 500,00, despesas 200,00, resultado 300,00');
select is((select pg_typeof(balance)::text from public.account_balances('2025-02-28') limit 1), 'text', 'CA-E3-16: balance é text');
select is((select pg_typeof(income)::text || pg_typeof(expense)::text || pg_typeof(result)::text from public.period_summary('2025-02-01', '2025-02-28')),
  'texttexttext', 'CA-E3-16: period_summary devolve text');
select is((select balance from public.account_balances('2025-02-06') where account_id = 'a1000000-0000-0000-0000-000000000011'), '1300.00',
  'saldo na data de referência (antes da transferência)');
select is((select balance from public.account_balances('2025-01-31') where account_id = 'a1000000-0000-0000-0000-000000000011'), '1000.00',
  'saldo antes dos lançamentos = saldo inicial');

-- R2 · março/2025: R1 + estorno de 50,00 da despesa -----------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'income', 'a1000000-0000-0000-0000-000000000021', null, 'c1000000-0000-0000-0000-000000000002', 'R2 receita', 500, '2025-03-05'),
  (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000021', null, 'c1000000-0000-0000-0000-000000000001', 'R2 despesa', 200, '2025-03-06'),
  (tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000022', null, 'R2 transferência', 100, '2025-03-07');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
select tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000021', 'c1000000-0000-0000-0000-000000000001', 'R2 estorno', 50, '2025-03-08', t.id
from public.transactions t where t.description = 'R2 despesa';

select is((select sum(balance::numeric)::text from public.account_balances('2025-03-31')
            where account_id in ('a1000000-0000-0000-0000-000000000021', 'a1000000-0000-0000-0000-000000000022')), '1350.00',
  'CA-E3-16 R2: consolidado 1.350,00');
select is((select balance from public.account_balances('2025-03-31') where account_id = 'a1000000-0000-0000-0000-000000000021'), '1250.00',
  'R2: conta corrente 1.250,00');
select results_eq($$select income, expense, result from public.period_summary('2025-03-01', '2025-03-31')$$,
  $$values ('500.00'::text, '150.00'::text, '350.00'::text)$$, 'CA-E3-16 R2: despesas 150,00 (estorno abate), receitas 500,00');
select results_eq($$select income, expense, result from public.period_summary('2025-03-08', '2025-03-08')$$,
  $$values ('0.00'::text, '-50.00'::text, '50.00'::text)$$, 'estorno abate pela data do estorno (dia isolado)');

-- R2b · estorno de receita reduz o saldo e a receita ----------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'income', 'a1000000-0000-0000-0000-000000000091', 'c1000000-0000-0000-0000-000000000002', 'R2b receita', 300, '2025-09-05');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
select tests.fid('A'), 'income', 'a1000000-0000-0000-0000-000000000091', 'c1000000-0000-0000-0000-000000000002', 'R2b estorno', 100, '2025-09-06', t.id
from public.transactions t where t.description = 'R2b receita';
select is((select balance from public.account_balances('2025-09-30') where account_id = 'a1000000-0000-0000-0000-000000000091'), '200.00',
  'estorno de receita: saldo 200,00');
select results_eq($$select income, expense, result from public.period_summary('2025-09-01', '2025-09-30')$$,
  $$values ('200.00'::text, '0.00'::text, '200.00'::text)$$, 'estorno de receita abate a receita do período');

-- R3 · abril/2025: R1 + despesa pendente 80,00 ------------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'income', 'a1000000-0000-0000-0000-000000000031', null, 'c1000000-0000-0000-0000-000000000002', 'R3 receita', 500, '2025-04-05'),
  (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000031', null, 'c1000000-0000-0000-0000-000000000001', 'R3 despesa', 200, '2025-04-06'),
  (tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000031', 'a1000000-0000-0000-0000-000000000032', null, 'R3 transferência', 100, '2025-04-07');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status) values
  (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000031', 'c1000000-0000-0000-0000-000000000001', 'R3 pendente', 80, '2025-04-20', 'pending');

select is((select sum(balance::numeric)::text from public.account_balances('2025-04-30')
            where account_id in ('a1000000-0000-0000-0000-000000000031', 'a1000000-0000-0000-0000-000000000032')), '1300.00',
  'CA-E3-16 R3: consolidado 1.300,00 (pendente não afeta o saldo)');
select is((select sum(amount)::text from public.transactions where status = 'pending' and type = 'expense' and deleted_at is null
            and transaction_date between '2025-04-01' and '2025-04-30'), '80.00', 'CA-E3-16 R3: comprometido 80,00 (soma dos pendentes)');
select results_eq($$select income, expense, result from public.period_summary('2025-04-01', '2025-04-30')$$,
  $$values ('500.00'::text, '200.00'::text, '300.00'::text)$$, 'R3: pendente fora dos totais realizados');

-- R4 · cartão: compra de 300,00 em maio, pagamento da fatura de 300,00 em junho ---------------------------------------------------------
insert into public.transactions (family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000042', null, 'c1000000-0000-0000-0000-000000000001', 'R4 compra no cartão', 300, '2025-05-15'),
  (tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000041', 'a1000000-0000-0000-0000-000000000042', null, 'R4 pagamento da fatura', 300, '2025-06-10');

select results_eq($$select income, expense, result from public.period_summary('2025-05-01', '2025-05-31')$$,
  $$values ('0.00'::text, '300.00'::text, '-300.00'::text)$$, 'CA-E3-16 R4: despesa de maio 300,00');
select results_eq($$select income, expense, result from public.period_summary('2025-06-01', '2025-06-30')$$,
  $$values ('0.00'::text, '0.00'::text, '0.00'::text)$$, 'CA-E3-16 R4: despesa de junho 0 (pagamento não é despesa)');
select is((select balance from public.account_balances('2025-05-31') where account_id = 'a1000000-0000-0000-0000-000000000041'), '1000.00',
  'CA-E3-16 R4: consolidado de ativos em maio não cai (1.000,00)');
select is((select balance from public.account_balances('2025-06-30') where account_id = 'a1000000-0000-0000-0000-000000000041'), '700.00',
  'CA-E3-16 R4: consolidado cai 300,00 só em junho (700,00)');
select is((select balance from public.account_balances('2025-05-31') where account_id = 'a1000000-0000-0000-0000-000000000042'), '-300.00',
  'R4: dívida do cartão em maio (-300,00)');
select is((select balance from public.account_balances('2025-06-30') where account_id = 'a1000000-0000-0000-0000-000000000042'), '0.00',
  'R4: cartão quitado em junho');

-- R7 · julho/2025: edição de 200,00 para 250,00 ----------------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000071', 'c1000000-0000-0000-0000-000000000001', 'R7 despesa', 200, '2025-07-05');
select is((select expense from public.period_summary('2025-07-01', '2025-07-31')), '200.00', 'R7: antes da edição, despesas 200,00');
update public.transactions set amount = 250 where description = 'R7 despesa';
select is((select expense from public.period_summary('2025-07-01', '2025-07-31')), '250.00', 'CA-E3-16 R7: despesas 250,00 após a edição');
select is((select balance from public.account_balances('2025-07-31') where account_id = 'a1000000-0000-0000-0000-000000000071'), '750.00',
  'R7: saldo 750,00');
select tests.logout();
select is((select (metadata -> 'old' ->> 'amount') || '>' || (metadata -> 'new' ->> 'amount') from public.audit_events
            where action = 'transaction.updated' and entity_id = (select id from public.transactions where description = 'R7 despesa')),
  '200.00>250.00', 'CA-E3-16 R7: auditoria com old/new');
select tests.login_as('a');

-- R8 · agosto/2025: exclusão lógica ---------------------------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date) values
  (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000081', 'c1000000-0000-0000-0000-000000000001', 'R8 despesa', 200, '2025-08-05');
select is((select expense from public.period_summary('2025-08-01', '2025-08-31')), '200.00', 'R8: antes da exclusão, despesas 200,00');
update public.transactions set deleted_at = now() where description = 'R8 despesa';
select is((select expense from public.period_summary('2025-08-01', '2025-08-31')), '0.00', 'CA-E3-16 R8: despesas 0 após a exclusão lógica');
select is((select balance from public.account_balances('2025-08-31') where account_id = 'a1000000-0000-0000-0000-000000000081'), '1000.00',
  'R8: o saldo volta ao inicial');
select ok((select deleted_at is not null from public.transactions where description = 'R8 despesa'),
  'CA-E3-16 R8: a linha é preservada com deleted_at');

-- cobertura extra: padrão de data, contas arquivadas e validação de entrada ------------------------------------------------------------------
select is((select count(*)::int from (select * from public.account_balances() except select * from public.account_balances(private.today())) d), 0,
  'p_as_of nulo vale private.today()');
select tests.logout();
update public.accounts set is_active = false where id = 'a1000000-0000-0000-0000-000000000011';
select tests.login_as('a');
select is((select balance from public.account_balances('2025-02-28') where account_id = 'a1000000-0000-0000-0000-000000000011'), '1200.00',
  'conta arquivada continua em account_balances');
select throws_ok($$select * from public.period_summary('2025-03-02', '2025-03-01')$$, 'P0001', 'INVALID_INPUT', 'period_summary: from > to');
select throws_ok($$select * from public.period_summary(null, '2025-03-01')$$, 'P0001', 'INVALID_INPUT', 'period_summary: from nulo');
select throws_ok($$select * from public.period_summary('2025-03-01', null)$$, 'P0001', 'INVALID_INPUT', 'period_summary: to nulo');

select * from finish();
rollback;
