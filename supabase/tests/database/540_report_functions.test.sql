-- CA-E7-10 (account_flows, R20), CA-E7-11 (isolamento, AB-117), CA-E7-12 (member_expense_totals, R16/R20, Σ = despesas).
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

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, is_active, created_by) values
  ('a7540000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 1000, '2020-01-01', true, tests.uid('a')),
  ('a7540000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2020-01-01', true, tests.uid('a')),
  ('a7540000-0000-0000-0000-000000000003', tests.fid('A'), 'Antiga', 'checking', 50, '2020-01-01', false, tests.uid('a')),
  ('a7540000-0000-0000-0000-000000000004', tests.fid('A'), 'Zerada', 'cash', 0, '2020-01-01', true, tests.uid('a')),
  ('a7540000-0000-0000-0000-0000000000b1', tests.fid('B'), 'Conta B', 'checking', 0, '2020-01-01', true, tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c7540000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c7540000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-2', 'briefcase', tests.uid('a')),
  ('c7540000-0000-0000-0000-0000000000b1', tests.fid('B'), 'Mercado B', 'expense', 'chart-1', 'utensils', tests.uid('b'));

-- R20 (março/2025): R1 + despesa de 90,00 sem responsável; a de 200,00 tem o responsável A, sem divisão
insert into public.transactions (id, family_id, type, account_id, destination_account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f7540000-0000-0000-0000-000000000001', tests.fid('A'), 'income', 'a7540000-0000-0000-0000-000000000001', null, 'c7540000-0000-0000-0000-000000000002', null, 'Receita', 500, '2025-03-05', 'paid', tests.uid('a')),
  ('f7540000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a7540000-0000-0000-0000-000000000001', null, 'c7540000-0000-0000-0000-000000000001', tests.mem('a'), 'Despesa A', 200, '2025-03-06', 'paid', tests.uid('a')),
  ('f7540000-0000-0000-0000-000000000003', tests.fid('A'), 'transfer', 'a7540000-0000-0000-0000-000000000001', 'a7540000-0000-0000-0000-000000000002', null, null, 'Transferência', 100, '2025-03-07', 'paid', tests.uid('a')),
  ('f7540000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a7540000-0000-0000-0000-000000000001', null, 'c7540000-0000-0000-0000-000000000001', null, 'Despesa sem responsável', 90, '2025-03-08', 'paid', tests.uid('a')),
  -- ruído que NÃO pode entrar: pendente, cancelado (abaixo) e excluído (abaixo)
  ('f7540000-0000-0000-0000-000000000005', tests.fid('A'), 'expense', 'a7540000-0000-0000-0000-000000000001', null, 'c7540000-0000-0000-0000-000000000001', tests.mem('a'), 'Pendente', 77, '2025-03-10', 'pending', tests.uid('a')),
  ('f7540000-0000-0000-0000-000000000006', tests.fid('A'), 'expense', 'a7540000-0000-0000-0000-000000000001', null, 'c7540000-0000-0000-0000-000000000001', tests.mem('a'), 'Cancelado', 66, '2025-03-11', 'pending', tests.uid('a')),
  ('f7540000-0000-0000-0000-000000000007', tests.fid('A'), 'expense', 'a7540000-0000-0000-0000-000000000001', null, 'c7540000-0000-0000-0000-000000000001', tests.mem('a'), 'Excluído', 33, '2025-03-12', 'paid', tests.uid('a')),
  -- R16 (maio/2025): 200,00 com responsável A dividida igualmente entre A, ad e m
  ('f7540000-0000-0000-0000-000000000008', tests.fid('A'), 'expense', 'a7540000-0000-0000-0000-000000000001', null, 'c7540000-0000-0000-0000-000000000001', tests.mem('a'), 'Dividida', 200, '2025-05-05', 'paid', tests.uid('a')),
  -- junho/2025: 40,00 do m e estorno integral (resultado líquido 0 → omitido)
  ('f7540000-0000-0000-0000-000000000009', tests.fid('A'), 'expense', 'a7540000-0000-0000-0000-000000000001', null, 'c7540000-0000-0000-0000-000000000001', tests.mem('m'), 'Do m', 40, '2025-06-05', 'paid', tests.uid('a')),
  -- família B
  ('f7540000-0000-0000-0000-0000000000b1', tests.fid('B'), 'expense', 'a7540000-0000-0000-0000-0000000000b1', null, 'c7540000-0000-0000-0000-0000000000b1', null, 'Despesa B', 7, '2025-03-09', 'paid', tests.uid('b'));

select tests.login_as('a');
select public.cancel_pending_transaction('f7540000-0000-0000-0000-000000000006');
update public.transactions set deleted_at = now() where id = 'f7540000-0000-0000-0000-000000000007';
select public.set_transaction_splits('f7540000-0000-0000-0000-000000000008', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad')),
  jsonb_build_object('member_id', current_setting('tests.mem_m'))));
-- estornos (precisam do chamador owner): 50,00 da dividida (maio), 40,00 do m (junho, integral), 50,00 da despesa A em abril
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, reversal_of_id) values
  (tests.fid('A'), 'expense', 'a7540000-0000-0000-0000-000000000001', 'c7540000-0000-0000-0000-000000000001', 'Estorno maio', 50, '2025-05-06', 'paid', 'f7540000-0000-0000-0000-000000000008'),
  (tests.fid('A'), 'expense', 'a7540000-0000-0000-0000-000000000001', 'c7540000-0000-0000-0000-000000000001', 'Estorno junho', 40, '2025-06-06', 'paid', 'f7540000-0000-0000-0000-000000000009'),
  (tests.fid('A'), 'expense', 'a7540000-0000-0000-0000-000000000001', 'c7540000-0000-0000-0000-000000000001', 'Estorno abril', 50, '2025-04-02', 'paid', 'f7540000-0000-0000-0000-000000000002');

-- CA-E7-10 · R20 em março ------------------------------------------------------------------------------------------------------------
select is((select opening || '/' || inflow || '/' || outflow || '/' || closing from public.account_flows('2025-03-01', '2025-03-31')
            where account_id = 'a7540000-0000-0000-0000-000000000001'),
  '1000.00/500.00/390.00/1110.00', 'CA-E7-10: R20 corrente início 1.000,00, entradas 500,00, saídas 390,00 (200 + 90 + 100), fim 1.110,00');
select is((select opening || '/' || inflow || '/' || outflow || '/' || closing from public.account_flows('2025-03-01', '2025-03-31')
            where account_id = 'a7540000-0000-0000-0000-000000000002'),
  '0.00/100.00/0.00/100.00', 'CA-E7-10: R20 poupança início 0,00, entradas 100,00 (transferência), fim 100,00');
select is((select opening || '/' || inflow || '/' || outflow || '/' || closing from public.account_flows('2025-03-01', '2025-03-31')
            where account_id = 'a7540000-0000-0000-0000-000000000003'),
  '50.00/0.00/0.00/50.00', 'CA-E7-10: conta arquivada com saldo entra');
select is((select count(*)::int from public.account_flows('2025-03-01', '2025-03-31') where account_id = 'a7540000-0000-0000-0000-000000000004'), 0,
  'CA-E7-10: conta sem movimento e com saldo 0 é omitida');
select is((select count(*)::int from public.account_flows('2025-03-01', '2025-03-31')), 3, 'CA-E7-10: três contas no relatório de março');
select is((select sum(inflow::numeric - outflow::numeric) from public.account_flows('2025-03-01', '2025-03-31') f
            join public.accounts a on a.id = f.account_id where a.type <> 'credit_card'), 210.00,
  'CA-E7-10: Σ líquido das contas de ativo = 210,00');
select is((select sum(b1.balance::numeric) - sum(b0.balance::numeric)
            from public.account_balances('2025-03-31') b1 join public.account_balances('2025-02-28') b0 on b0.account_id = b1.account_id),
  210.00, 'CA-E7-10: ...igual à variação do consolidado (D3)');
select is((select bool_and(f.closing::numeric = f.opening::numeric + f.inflow::numeric - f.outflow::numeric)
            from public.account_flows('2025-03-01', '2025-05-31') f), true, 'CA-E7-10: fim = início + entradas − saídas');
-- estorno de despesa é entrada na conta (abril)
select is((select opening || '/' || inflow || '/' || outflow || '/' || closing from public.account_flows('2025-04-01', '2025-04-30')
            where account_id = 'a7540000-0000-0000-0000-000000000001'),
  '1110.00/50.00/0.00/1160.00', 'CA-E7-10: estorno de despesa entra como entrada (abril)');
-- validações
select throws_ok($$select * from public.account_flows(null, '2025-03-31')$$, 'P0001', 'INVALID_INPUT', 'CA-E7-10: de nulo → INVALID_INPUT');
select throws_ok($$select * from public.account_flows('2025-03-01', null)$$, 'P0001', 'INVALID_INPUT', 'CA-E7-10: até nulo → INVALID_INPUT');
select throws_ok($$select * from public.account_flows('2025-03-31', '2025-03-01')$$, 'P0001', 'INVALID_INPUT', 'CA-E7-10: invertido → INVALID_INPUT');
select throws_ok($$select * from public.account_flows('2025-01-01', '2026-01-02')$$, 'P0001', 'INVALID_INPUT', 'CA-E7-10: 367 dias → INVALID_INPUT');
select lives_ok($$select * from public.account_flows('2025-01-01', '2026-01-01')$$, 'CA-E7-10: 366 dias é aceito');

-- CA-E7-12 · member_expense_totals ----------------------------------------------------------------------------------------------------
select is((select amount from public.member_expense_totals('2025-03-01', '2025-03-31') where member_id = tests.mem('a')), '200.00',
  'CA-E7-12: R20 A 200,00 (sem divisão → responsável)');
select is((select amount from public.member_expense_totals('2025-03-01', '2025-03-31') where member_id is null), '90.00',
  'CA-E7-12: R20 sem responsável (member_id nulo) 90,00');
select is((select count(*)::int from public.member_expense_totals('2025-03-01', '2025-03-31')), 2,
  'CA-E7-12: só A e nulo (pendente, cancelado e excluído fora)');
select is((select sum(amount::numeric) from public.member_expense_totals('2025-03-01', '2025-03-31')),
  (select expense::numeric from public.period_summary('2025-03-01', '2025-03-31')), 'CA-E7-12: Σ = despesas de period_summary (290,00)');
select is((select amount from public.member_expense_totals('2025-05-01', '2025-05-31') where member_id = tests.mem('a')), '50.00', 'CA-E7-12: R16 A 50,00');
select is((select amount from public.member_expense_totals('2025-05-01', '2025-05-31') where member_id = tests.mem('ad')), '50.00', 'CA-E7-12: R16 ad 50,00');
select is((select amount from public.member_expense_totals('2025-05-01', '2025-05-31') where member_id = tests.mem('m')), '50.00', 'CA-E7-12: R16 m 50,00');
select is((select sum(amount::numeric) from public.member_expense_totals('2025-05-01', '2025-05-31')),
  (select expense::numeric from public.period_summary('2025-05-01', '2025-05-31')), 'CA-E7-12: R16 Σ = despesas (150,00)');
select is((select count(*)::int from public.member_expense_totals('2025-06-01', '2025-06-30')), 0,
  'CA-E7-12: despesa e estorno integral do mesmo responsável → total 0 omitido');
select is((select expense from public.period_summary('2025-06-01', '2025-06-30')), '0.00', 'CA-E7-12: junho com despesas 0,00');
-- estorno em período diferente do original: abril tem só o estorno (−50,00 do responsável A do original)
select is((select amount from public.member_expense_totals('2025-04-01', '2025-04-30') where member_id = tests.mem('a')), '-50.00',
  'CA-E7-12: estorno sem divisão abate do responsável do original');
select is((select sum(amount::numeric) from public.member_expense_totals('2025-01-01', '2025-12-31')),
  (select expense::numeric from public.period_summary('2025-01-01', '2025-12-31')), 'CA-E7-12: Σ do ano = despesas do ano');
select throws_ok($$select * from public.member_expense_totals(null, '2025-03-31')$$, 'P0001', 'INVALID_INPUT', 'CA-E7-12: de nulo → INVALID_INPUT');
select throws_ok($$select * from public.member_expense_totals('2025-03-31', '2025-03-01')$$, 'P0001', 'INVALID_INPUT', 'CA-E7-12: invertido → INVALID_INPUT');
select throws_ok($$select * from public.member_expense_totals('2025-01-01', '2026-01-02')$$, 'P0001', 'INVALID_INPUT', 'CA-E7-12: 367 dias → INVALID_INPUT');
select tests.logout();

-- CA-E7-11 · isolamento ---------------------------------------------------------------------------------------------------------------
select tests.login_as('b');
select is((select count(*)::int from public.account_flows('2025-01-01', '2025-12-31')), 1, 'CA-E7-11: b recebe só a própria conta');
select is((select account_id from public.account_flows('2025-01-01', '2025-12-31')), 'a7540000-0000-0000-0000-0000000000b1'::uuid, 'CA-E7-11: ...a conta de B');
select is((select outflow from public.account_flows('2025-01-01', '2025-12-31')), '7.00', 'CA-E7-11: ...com a despesa de B');
select is((select count(*)::int from public.member_expense_totals('2025-01-01', '2025-12-31')), 1, 'CA-E7-11: b recebe só a própria despesa');
select is((select amount from public.member_expense_totals('2025-01-01', '2025-12-31')), '7.00', 'CA-E7-11: ...7,00');
select tests.login_as('c');
select is((select count(*)::int from public.account_flows('2020-01-01', '2020-12-31')), 0, 'CA-E7-11: c (sem família) não recebe nada de A em account_flows');
select is((select count(*)::int from public.member_expense_totals('2025-01-01', '2025-12-31')), 0, 'CA-E7-11: c não recebe nada em member_expense_totals');
select tests.login_as('m');
select is((select amount from public.member_expense_totals('2025-03-01', '2025-03-31') where member_id = tests.mem('a')), '200.00',
  'member lê os mesmos relatórios que o owner');
select tests.logout();

select * from finish();
rollback;
