-- CA-E6-14, CA-E6-16: R15, R16 e regressão das funções de saldo e totais com metas, parcelas e acertos.
begin;

select no_plan();

select tests.setup_world();
create function tests.mem(p_key text) returns uuid language sql stable as $$
  select id from public.family_members where user_id = tests.uid(p_key) $$;
grant execute on function tests.mem(text) to authenticated;
create function tests.check_splits() returns void language plpgsql as $$
begin set constraints all immediate; set constraints all deferred; end $$;
grant execute on function tests.check_splits() to authenticated;
update public.family_members set joined_at = '2020-01-01' where user_id = tests.uid('a');
update public.family_members set joined_at = '2020-02-01' where user_id = tests.uid('ad');
update public.family_members set joined_at = '2020-03-01' where user_id = tests.uid('m');
insert into public.family_members (family_id, user_id, role, status, joined_at, ended_at)
  values (tests.fid('A'), tests.uid('c'), 'member', 'removed', '2019-01-01', now());
insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a6000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 1000, '2020-01-01', tests.uid('a')),
  ('a6000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2020-01-01', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c6000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c6000000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-2', 'briefcase', tests.uid('a'));

-- R1 + R2 (março/2025) com orçamento
insert into public.transactions (id, family_id, type, account_id, destination_account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f6000000-0000-0000-0000-000000000461', tests.fid('A'), 'income', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000002', null, 'Receita', 500, '2025-03-05', 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000462', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'Despesa', 200, '2025-03-06', 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000463', tests.fid('A'), 'transfer', 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', null, null, 'Transferência', 100, '2025-03-07', 'paid', tests.uid('a'));
insert into public.budgets (family_id, category_id, amount_limit, start_month, created_by)
  values (tests.fid('A'), 'c6000000-0000-0000-0000-000000000001', 500, '2025-01-01', tests.uid('a'));
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_ad', tests.mem('ad')::text, true);
select set_config('tests.mem_m', tests.mem('m')::text, true);

select tests.login_as('a');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Estorno', 50, '2025-03-08', 'paid', 'f6000000-0000-0000-0000-000000000462');

select set_config('tests.snap1', (select jsonb_build_object(
  'bal', (select jsonb_agg(to_jsonb(b) order by to_jsonb(b)::text) from public.account_balances() b),
  'ps', (select to_jsonb(p) from public.period_summary('2025-01-01', '2025-12-31') p),
  'cf', (select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.monthly_cash_flow('2025-01-01', '2025-12-31') c),
  'ct', (select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.category_totals('2025-01-01', '2025-12-31', 'expense') c),
  'bp', (select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.budget_progress('2025-01-01', '2025-12-01') c),
  'pend', (select to_jsonb(p) from public.pending_summary() p))::text), true);

select is((select sum(balance::numeric) from public.account_balances()), 1350.00, 'CA-E6-16: R2 consolidado 1.350,00 antes das tabelas novas');

-- metas, divisão e acerto
select lives_ok($$insert into public.goals (family_id, name, target_amount) values (tests.fid('A'), 'Viagem', 5000)$$, 'meta "Viagem" 5.000,00');
select set_config('tests.goal', (select id::text from public.goals where name = 'Viagem'), true);
select lives_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, notes)
  values (tests.fid('A'), current_setting('tests.goal')::uuid, tests.mem('a'), 'deposit', 400, private.today(), 'dep400')$$, 'CA-E6-14: aporte de 400,00 hoje');
select lives_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, notes)
  values (tests.fid('A'), current_setting('tests.goal')::uuid, tests.mem('a'), 'withdrawal', 100, private.today(), 'ret100')$$, 'CA-E6-14: retirada de 100,00 hoje');
select is((select saved || '/' || deposits || '/' || withdrawals from public.goal_summary(private.today() - 89, private.today())), '300.00/400.00/100.00',
  'CA-E6-14: R15 acumulado 300,00 (aportes 400,00, retiradas 100,00)');
select throws_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('A'), current_setting('tests.goal')::uuid, tests.mem('a'), 'withdrawal', 300.01, private.today())$$, 'P0001', 'GOAL_NEGATIVE_PROGRESS', 'CA-E6-14: R15 retirada de 300,01');
select throws_ok($$update public.goal_contributions set deleted_at = now() where notes = 'dep400'$$, 'P0001', 'GOAL_NEGATIVE_PROGRESS', 'CA-E6-14: R15 excluir o aporte de 400,00');

select lives_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000462', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad')), jsonb_build_object('member_id', current_setting('tests.mem_m'))))$$, 'R16: despesa de 200,00 dividida igualmente');
select is((select array_agg(s.amount order by fm.joined_at) from public.expense_splits s join public.family_members fm on fm.id = s.member_id
  where s.transaction_id = 'f6000000-0000-0000-0000-000000000462'), array[66.67, 66.67, 66.66]::numeric[], 'CA-E6-16: R16 parcelas 66,67 · 66,67 · 66,66');
select is((select amount from public.member_balances() where debtor_member_id = tests.mem('ad') and creditor_member_id = tests.mem('a')), '50.00', 'CA-E6-16: R16 B deve 50,00 a A (66,67 − 16,67 do estorno)');
select is((select amount from public.member_balances() where debtor_member_id = tests.mem('m') and creditor_member_id = tests.mem('a')), '50.00', 'CA-E6-16: R16 C deve 50,00 a A (66,66 − 16,66)');
select is((select count(*)::int from public.expense_splits s join public.transactions t on t.id = s.transaction_id where t.reversal_of_id is not null), 0, 'R16: o estorno não grava parcelas');
select lives_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date)
  values (tests.fid('A'), tests.mem('ad'), tests.mem('a'), 10, private.today())$$, 'acerto de 10,00');

-- regressão: nada do que existia mudou
select is((select jsonb_build_object(
  'bal', (select jsonb_agg(to_jsonb(b) order by to_jsonb(b)::text) from public.account_balances() b),
  'ps', (select to_jsonb(p) from public.period_summary('2025-01-01', '2025-12-31') p),
  'cf', (select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.monthly_cash_flow('2025-01-01', '2025-12-31') c),
  'ct', (select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.category_totals('2025-01-01', '2025-12-31', 'expense') c),
  'bp', (select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.budget_progress('2025-01-01', '2025-12-01') c),
  'pend', (select to_jsonb(p) from public.pending_summary() p))), current_setting('tests.snap1')::jsonb,
  'CA-E6-14/16: account_balances, period_summary, monthly_cash_flow, category_totals, budget_progress e pending_summary iguais com metas, parcelas e acertos');
select is((select sum(balance::numeric) from public.account_balances()), 1350.00, 'CA-E6-16: consolidado 1.350,00 com divisão, meta e acerto');
select is((select expense from public.period_summary('2025-01-01', '2025-12-31')), '150.00', 'CA-E6-16: despesas 150,00 (R2)');
select is((select balance from public.account_balances() where account_id = 'a6000000-0000-0000-0000-000000000001'), '1250.00', 'CA-E6-16: corrente 1.250,00 (R2)');

-- R15: excluir a retirada e depois o aporte → 0,00
select is(tests.affected($$update public.goal_contributions set deleted_at = now() where notes = 'ret100'$$), 1, 'R15: exclui a retirada');
select is(tests.affected($$update public.goal_contributions set deleted_at = now() where notes = 'dep400'$$), 1, 'R15: exclui o aporte');
select is((select saved from public.goal_summary(private.today() - 89, private.today())), '0.00', 'CA-E6-14: R15 acumulado 0,00');
select tests.logout();

select * from finish();
rollback;
