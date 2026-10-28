-- CA-E7-14: R1, R2, R15, R16 e R20 continuam exatos depois de notificações no banco, mudanças de papel, renomeação, saída de integrante
-- (que fazia parte da divisão) e remoção de outro. As funções das Etapas 3 a 6 devolvem fotografias idênticas antes e depois (ADR-0030 §2).
-- R3–R14 e R17–R19 seguem cobertos pelos testes 150, 210, 360 e 460 (que precisam continuar verdes); este arquivo não os repete.
begin;

select no_plan();

select tests.setup_world();
create function tests.mem(p_key text) returns uuid language sql stable as $$
  select id from public.family_members where user_id = tests.uid(p_key)
  order by (status = 'active') desc, joined_at desc limit 1 $$;
grant execute on function tests.mem(text) to authenticated;
update public.family_members set joined_at = '2020-01-01' where user_id = tests.uid('a');
update public.family_members set joined_at = '2020-02-01' where user_id = tests.uid('ad');
update public.family_members set joined_at = '2020-03-01' where user_id = tests.uid('m');
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_ad', tests.mem('ad')::text, true);
select set_config('tests.mem_m', tests.mem('m')::text, true);

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a7550000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 1000, '2020-01-01', tests.uid('a')),
  ('a7550000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2020-01-01', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c7550000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c7550000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-2', 'briefcase', tests.uid('a'));
insert into public.transactions (id, family_id, type, account_id, destination_account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f7550000-0000-0000-0000-000000000001', tests.fid('A'), 'income', 'a7550000-0000-0000-0000-000000000001', null, 'c7550000-0000-0000-0000-000000000002', null, 'Receita', 500, '2025-03-05', 'paid', tests.uid('a')),
  ('f7550000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a7550000-0000-0000-0000-000000000001', null, 'c7550000-0000-0000-0000-000000000001', tests.mem('a'), 'Despesa', 200, '2025-03-06', 'paid', tests.uid('a')),
  ('f7550000-0000-0000-0000-000000000003', tests.fid('A'), 'transfer', 'a7550000-0000-0000-0000-000000000001', 'a7550000-0000-0000-0000-000000000002', null, null, 'Transferência', 100, '2025-03-07', 'paid', tests.uid('a')),
  ('f7550000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a7550000-0000-0000-0000-000000000001', null, 'c7550000-0000-0000-0000-000000000001', null, 'Pendente', 80, private.today() + 2, 'pending', tests.uid('a'));
insert into public.budgets (family_id, category_id, amount_limit, start_month, created_by)
  values (tests.fid('A'), 'c7550000-0000-0000-0000-000000000001', 500, '2025-01-01', tests.uid('a'));
insert into public.goals (id, family_id, name, target_amount, created_by)
  values ('90755000-0000-0000-0000-000000000001', tests.fid('A'), 'Viagem', 5000, tests.uid('a'));

select tests.login_as('a');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a7550000-0000-0000-0000-000000000001', 'c7550000-0000-0000-0000-000000000001', 'Estorno', 50, '2025-03-08', 'paid', 'f7550000-0000-0000-0000-000000000002');
insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date) values
  (tests.fid('A'), '90755000-0000-0000-0000-000000000001', tests.mem('a'), 'deposit', 400, private.today()),
  (tests.fid('A'), '90755000-0000-0000-0000-000000000001', tests.mem('a'), 'withdrawal', 100, private.today());
select public.set_transaction_splits('f7550000-0000-0000-0000-000000000002', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad')),
  jsonb_build_object('member_id', current_setting('tests.mem_m'))));
insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date)
  values (tests.fid('A'), tests.mem('ad'), tests.mem('a'), 10, private.today());

create function tests.snap() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'bal', (select jsonb_agg(to_jsonb(b) order by to_jsonb(b)::text) from public.account_balances() b),
    'bal_mar', (select jsonb_agg(to_jsonb(b) order by to_jsonb(b)::text) from public.account_balances('2025-03-31') b),
    'ps', (select to_jsonb(p) from public.period_summary('2025-01-01', '2025-12-31') p),
    'cf', (select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.monthly_cash_flow('2025-01-01', '2025-12-31') c),
    'ct', (select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.category_totals('2025-01-01', '2025-12-31', 'expense') c),
    'bp', (select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.budget_progress('2025-01-01', '2025-12-01') c),
    'pend', (select to_jsonb(p) from public.pending_summary() p),
    'gs', (select jsonb_agg(to_jsonb(g) order by to_jsonb(g)::text) from public.goal_summary(private.today() - 89, private.today()) g),
    'mb', (select jsonb_agg(to_jsonb(m) order by to_jsonb(m)::text) from public.member_balances() m),
    'pcf', (select jsonb_agg(to_jsonb(c) order by to_jsonb(c)::text) from public.projected_cash_flow(3) c),
    'af', (select jsonb_agg(to_jsonb(f) order by to_jsonb(f)::text) from public.account_flows('2025-03-01', '2025-03-31') f),
    'met', (select jsonb_agg(to_jsonb(f) order by to_jsonb(f)::text) from public.member_expense_totals('2025-03-01', '2025-03-31') f)
  ) $$;
grant execute on function tests.snap() to authenticated;
select set_config('tests.snap1', tests.snap()::text, true);

-- valores de referência
select is((select sum(balance::numeric) from public.account_balances()), 1350.00, 'CA-E7-14: R2 consolidado 1.350,00');
select is((select expense from public.period_summary('2025-03-01', '2025-03-31')), '150.00', 'CA-E7-14: R2 despesas 150,00');
select is((select saved from public.goal_summary(private.today() - 89, private.today())), '300.00', 'CA-E7-14: R15 acumulado 300,00');
select is((select amount from public.member_balances() where debtor_member_id = tests.mem('m') and creditor_member_id = tests.mem('a')), '50.00',
  'CA-E7-14: R16 m deve 50,00 a a');
select is((select amount from public.member_expense_totals('2025-03-01', '2025-03-31') where member_id = tests.mem('m')), '50.00',
  'CA-E7-14: R16 por integrante, m 50,00');
select is((select inflow || '/' || outflow from public.account_flows('2025-03-01', '2025-03-31') where account_id = 'a7550000-0000-0000-0000-000000000001'),
  '550.00/300.00', 'CA-E7-14: conta corrente do dataset R1+R2 (entradas 500 + estorno 50; saídas 200 + 100 de transferência)');
select tests.logout();

-- operações da Etapa 7 ----------------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select public.refresh_notifications();
select public.change_member_role(current_setting('tests.mem_ad')::uuid, 'member');
select public.change_member_role(current_setting('tests.mem_ad')::uuid, 'admin');
update public.families set name = 'Família renomeada' where id = tests.fid('A');
select tests.login_as('ad');
select public.refresh_notifications();
select tests.login_as('m');
select public.refresh_notifications();
select public.leave_family();  -- m fazia parte da divisão (R16)
select tests.login_as('a');
select public.remove_family_member(current_setting('tests.mem_ad')::uuid);  -- ad também
select is((select public.refresh_notifications()), 0, 'CA-E7-14: refresh de a depois das saídas não cria nada');

select is(tests.snap(), current_setting('tests.snap1')::jsonb,
  'CA-E7-14: saldos, totais, categorias, orçamento, pendentes, metas, saldos entre integrantes, projeção, account_flows e member_expense_totals idênticos depois de notificações, renomeação, saída e remoção');
select is((select sum(balance::numeric) from public.account_balances()), 1350.00, 'CA-E7-14: consolidado continua 1.350,00');
select is((select amount from public.member_balances() where debtor_member_id = current_setting('tests.mem_m')::uuid and creditor_member_id = current_setting('tests.mem_a')::uuid),
  '50.00', 'CA-E7-14: m (ex-integrante) continua devendo 50,00 a a, legível pelo owner');
select tests.logout();

select is((select count(*)::int from public.expense_splits), 3, 'CA-E7-14: as três parcelas continuam gravadas');
select is((select count(*)::int from public.transactions), 5, 'CA-E7-14: nenhum lançamento apagado');

select * from finish();
rollback;
