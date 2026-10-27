-- CA-E6-01 (RLS, grants, security definer/invoker, anon), CA-E6-02 (isolamento), CA-E6-03 (FKs compostas e família).
begin;

select no_plan();

select tests.setup_world();
create function tests.mem(p_key text) returns uuid language sql stable as $$
  select id from public.family_members where user_id = tests.uid(p_key) $$;
grant execute on function tests.mem(text) to authenticated;
update public.family_members set joined_at = '2020-01-01' where user_id = tests.uid('a');
update public.family_members set joined_at = '2020-02-01' where user_id = tests.uid('ad');
update public.family_members set joined_at = '2020-03-01' where user_id = tests.uid('m');

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a6000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2020-01-01', tests.uid('a')),
  ('a6000000-0000-0000-0000-000000000002', tests.fid('B'), 'Conta B', 'checking', 0, '2020-01-01', tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c6000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c6000000-0000-0000-0000-000000000002', tests.fid('B'), 'Mercado B', 'expense', 'chart-1', 'utensils', tests.uid('b'));
insert into public.transactions (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f6000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'Despesa A', 100, private.today() - 3, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000002', tests.fid('B'), 'expense', 'a6000000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000002', null, 'Despesa B', 40, private.today() - 3, 'paid', tests.uid('b'));
insert into public.expense_splits (family_id, transaction_id, member_id, amount, created_by) values
  (tests.fid('A'), 'f6000000-0000-0000-0000-000000000001', tests.mem('a'), 33.34, tests.uid('a')),
  (tests.fid('A'), 'f6000000-0000-0000-0000-000000000001', tests.mem('ad'), 33.33, tests.uid('a')),
  (tests.fid('A'), 'f6000000-0000-0000-0000-000000000001', tests.mem('m'), 33.33, tests.uid('a'));
insert into public.goals (id, family_id, name, target_amount, created_by) values
  ('90000000-0000-0000-0000-000000000001', tests.fid('A'), 'Viagem', 5000, tests.uid('a')),
  ('90000000-0000-0000-0000-000000000002', tests.fid('B'), 'Meta B', 1000, tests.uid('b'));
select tests.login_as('a');
insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date) values
  (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('a'), 'deposit', 200, private.today() - 2);
select tests.logout();
insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, created_by) values
  (tests.fid('A'), tests.mem('ad'), tests.mem('a'), 10, private.today() - 1, tests.uid('a'));

select set_config('tests.mem_a', tests.mem('a')::text, true);

-- CA-E6-01 · estrutura -------------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_class c
    where c.oid in ('public.goals'::regclass, 'public.goal_contributions'::regclass, 'public.expense_splits'::regclass, 'public.settlements'::regclass)
      and c.relrowsecurity),
  4, 'CA-E6-01: as quatro tabelas novas têm RLS');
select is((select count(*)::int from pg_class c
    where c.oid in ('public.goals'::regclass, 'public.goal_contributions'::regclass, 'public.expense_splits'::regclass, 'public.settlements'::regclass)
      and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
        or has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))),
  0, 'CA-E6-01: anon sem privilégio nas tabelas novas');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.goals'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')),
  array['description', 'family_id', 'icon', 'idempotency_key', 'name', 'target_amount', 'target_date'],
  'CA-E6-01: grant de insert de goals');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.goals'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['description', 'icon', 'name', 'status', 'target_amount', 'target_date'],
  'CA-E6-01: grant de update de goals (sem completed_at, created_by, family_id)');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.goal_contributions'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')),
  array['amount', 'contribution_date', 'family_id', 'goal_id', 'idempotency_key', 'kind', 'member_id', 'notes'],
  'CA-E6-01: grant de insert de goal_contributions');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.goal_contributions'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['deleted_at'], 'CA-E6-01: grant de update de goal_contributions é só deleted_at');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.settlements'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')),
  array['amount', 'family_id', 'from_member_id', 'idempotency_key', 'notes', 'settlement_date', 'to_member_id'],
  'CA-E6-01: grant de insert de settlements');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.settlements'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['deleted_at'], 'CA-E6-01: grant de update de settlements é só deleted_at');
select is((select count(*)::int from pg_class c
    where c.oid in ('public.goals'::regclass, 'public.goal_contributions'::regclass, 'public.expense_splits'::regclass, 'public.settlements'::regclass)
      and has_table_privilege('authenticated', c.oid, 'delete')),
  0, 'CA-E6-01: nenhuma das tabelas novas aceita delete');
select ok(has_table_privilege('authenticated', 'public.expense_splits', 'select'), 'CA-E6-01: expense_splits legível');
select ok(not has_table_privilege('authenticated', 'public.expense_splits', 'insert')
  and not has_table_privilege('authenticated', 'public.expense_splits', 'update')
  and not has_table_privilege('authenticated', 'public.expense_splits', 'delete')
  and not has_any_column_privilege('authenticated', 'public.expense_splits', 'insert')
  and not has_any_column_privilege('authenticated', 'public.expense_splits', 'update'),
  'CA-E6-01: expense_splits sem nenhum grant de escrita (tabela ou coluna)');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('public', 'set_transaction_splits'), ('private', 'current_member_id'), ('private', 'rescale_splits'))
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  3, 'CA-E6-01: set_transaction_splits, current_member_id e rescale_splits são security definer com search_path vazio');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('goal_summary', 'member_balances', 'projected_cash_flow')
      and not p.prosecdef and p.provolatile = 's' and p.proconfig @> array['search_path=""']),
  3, 'CA-E6-01: funções de leitura são security invoker, stable, com search_path vazio');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname in ('set_transaction_splits', 'current_member_id', 'rescale_splits', 'allocate_cents', 'goal_summary',
                        'member_balances', 'projected_cash_flow', 'goals_before_update', 'goals_after_update',
                        'goal_contributions_before_write', 'goal_contributions_after_update', 'expense_splits_sum_check',
                        'transactions_rescale_splits', 'settlements_before_write', 'settlements_audit')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))),
  0, 'CA-E6-01: anon e PUBLIC sem EXECUTE em nenhuma função nova');
select ok(has_function_privilege('authenticated', 'public.set_transaction_splits(uuid,text,jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.goal_summary(date,date)', 'execute')
  and has_function_privilege('authenticated', 'public.member_balances()', 'execute')
  and has_function_privilege('authenticated', 'public.projected_cash_flow(integer)', 'execute')
  and has_function_privilege('authenticated', 'private.allocate_cents(numeric,numeric[])', 'execute')
  and has_function_privilege('authenticated', 'private.current_member_id()', 'execute'),
  'CA-E6-01: authenticated executa RPC, leituras e helpers usados em policies/triggers invoker');
select ok(not has_function_privilege('authenticated', 'private.rescale_splits(uuid,numeric)', 'execute'),
  'CA-E6-01: rescale_splits sem EXECUTE para authenticated');
select ok(not has_function_privilege('authenticated', 'private.expense_splits_sum_check()', 'execute')
  and not has_function_privilege('authenticated', 'private.transactions_rescale_splits()', 'execute'),
  'CA-E6-01: funções de trigger sem EXECUTE para authenticated');
select ok(has_function_privilege('authenticated', 'private.recurrence_occurrence(date,text,smallint,integer)', 'execute')
  and has_function_privilege('authenticated', 'private.recurrence_first_index(date,text,smallint,date)', 'execute'),
  'CA-E6-01: agenda (funções puras) executável por authenticated para a projeção invoker');

-- anon -----------------------------------------------------------------------------------------------------------------
select tests.login_anon();
select throws_ok($$select * from public.goals$$, '42501', null, 'CA-E6-01: anon não lê goals');
select throws_ok($$select * from public.expense_splits$$, '42501', null, 'CA-E6-01: anon não lê expense_splits');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000001', 'none', null)$$, '42501', null,
  'CA-E6-07: anon não executa set_transaction_splits');
select tests.logout();

-- CA-E6-02 · isolamento --------------------------------------------------------------------------------------------------
select tests.login_as('b');
select is((select count(*)::int from public.goals), 1, 'CA-E6-02: B lê só a própria meta');
select is((select count(*)::int from public.goal_contributions), 0, 'CA-E6-02: B não lê aportes de A');
select is((select count(*)::int from public.expense_splits), 0, 'CA-E6-02: B não lê parcelas de A');
select is((select count(*)::int from public.settlements), 0, 'CA-E6-02: B não lê acertos de A');
select is((select count(*)::int from public.goal_summary(private.today() - 10, private.today()) where goal_id = '90000000-0000-0000-0000-000000000001'),
  0, 'CA-E6-02: goal_summary de B não inclui a meta de A');
select is((select count(*)::int from public.member_balances()), 0, 'CA-E6-02: member_balances de B não conta nada de A');
select is((select count(*)::int from public.projected_cash_flow(3) where pending_expense <> '0.00' or recurring_expense <> '0.00'),
  0, 'CA-E6-02: projected_cash_flow de B não conta nada de A');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000001', 'none', null)$$, 'P0001', 'NOT_FOUND',
  'CA-E6-02: B dividindo despesa de A → NOT_FOUND');
select tests.logout();
select is((select count(*)::int from public.expense_splits where transaction_id = 'f6000000-0000-0000-0000-000000000001'), 3,
  'CA-E6-02: as parcelas de A ficam iguais');
select tests.login_as('c');
select is((select count(*)::int from public.goals) + (select count(*)::int from public.goal_contributions)
  + (select count(*)::int from public.expense_splits) + (select count(*)::int from public.settlements), 0,
  'CA-E6-02: C (sem família) lê 0 linhas das quatro tabelas');
select is((select count(*)::int from public.goal_summary(private.today() - 10, private.today())), 0, 'CA-E6-02: goal_summary de C vazio');
select tests.logout();

-- CA-E6-03 · família e FKs compostas --------------------------------------------------------------------------------------
select tests.login_as('b');
select throws_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('B'), '90000000-0000-0000-0000-000000000001', tests.mem('b'), 'deposit', 10, private.today())$$,
  '23503', null, 'CA-E6-03: aporte com goal_id de A → 23503');
select throws_ok(format($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('B'), '90000000-0000-0000-0000-000000000002', %L, 'deposit', 10, private.today())$$,
  current_setting('tests.mem_a')),
  '23503', null, 'CA-E6-03: aporte com member_id de A → 23503');
select tests.logout();
select tests.login_as('b');
select throws_ok(format($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (%L, '90000000-0000-0000-0000-000000000001', %L, 'deposit', 10, private.today())$$, tests.fid('A'), tests.mem('b')),
  '42501', null, 'CA-E6-03: aporte com family_id de A → 42501');
select throws_ok(format($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date)
  values (tests.fid('B'), tests.mem('b'), %L, 10, private.today())$$, current_setting('tests.mem_a')),
  '23503', null, 'CA-E6-03: acerto com integrante de A → 23503');
select tests.logout();
select tests.login_as('b');
select throws_ok(format($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000002', 'equal',
  jsonb_build_array(jsonb_build_object('member_id', %L), jsonb_build_object('member_id', %L)))$$,
  tests.mem('b'), current_setting('tests.mem_a')),
  'P0001', 'INVALID_INPUT', 'CA-E6-03: divisão com integrante de A → INVALID_INPUT');
select throws_ok(format($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000002', 'equal',
  jsonb_build_array(jsonb_build_object('member_id', %L), jsonb_build_object('member_id', gen_random_uuid())))$$,
  tests.mem('b')),
  'P0001', 'INVALID_INPUT', 'CA-E6-03: divisão com id inexistente → o mesmo INVALID_INPUT');
select tests.logout();

select * from finish();
rollback;
