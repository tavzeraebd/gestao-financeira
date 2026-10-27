-- CA-E3-01 (estrutura/grants das três tabelas e das funções), CA-E3-04 (contas), CA-E3-14 (contas).
begin;

select plan(45);

select tests.setup_world();

-- fixtures (como postgres): conta corrente e poupança em A; conta em B
insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 1000, '2026-01-01', tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2026-01-01', tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000003', tests.fid('B'), 'Conta B', 'checking', 0, '2026-01-01', tests.uid('b'));

-- CA-E3-01 · estrutura ---------------------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c where c.oid in ('public.accounts'::regclass, 'public.categories'::regclass,
    'public.transactions'::regclass) and c.relrowsecurity),
  3, 'CA-E3-01: accounts, categories e transactions têm RLS');
select is(
  (select count(*)::int from pg_class c where c.oid in ('public.accounts'::regclass, 'public.categories'::regclass,
    'public.transactions'::regclass)
    and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
      or has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))),
  0, 'CA-E3-01: anon sem privilégio nas três tabelas');
select is(
  (select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.accounts'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')),
  array['credit_limit', 'family_id', 'institution_name', 'name', 'opening_balance', 'opening_balance_date',
        'statement_closing_day', 'statement_due_day', 'type'],
  'CA-E3-01: grant de insert de accounts é exatamente o do contrato');
select is(
  (select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.accounts'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['credit_limit', 'institution_name', 'is_active', 'name', 'opening_balance', 'opening_balance_date',
        'statement_closing_day', 'statement_due_day'],
  'CA-E3-01: grant de update de accounts é exatamente o do contrato (sem type)');
select is(
  (select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.categories'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')),
  array['color', 'family_id', 'icon', 'name', 'parent_id', 'type'],
  'CA-E3-01: grant de insert de categories');
select is(
  (select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.categories'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['archived_at', 'color', 'icon', 'name', 'parent_id'],
  'CA-E3-01: grant de update de categories (sem type)');
select is(
  (select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.transactions'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')),
  array['account_id', 'amount', 'assigned_member_id', 'category_id', 'description', 'destination_account_id',
        'family_id', 'idempotency_key', 'notes', 'reversal_of_id', 'status', 'transaction_date', 'type'],
  'CA-E3-01: grant de insert de transactions (sem created_by)');
select is(
  (select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.transactions'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['account_id', 'amount', 'assigned_member_id', 'category_id', 'deleted_at', 'description',
        'destination_account_id', 'notes', 'transaction_date'],
  'CA-E3-01: grant de update de transactions (sem type, status, created_by, deleted_by)');
select ok(
  not has_table_privilege('authenticated', 'public.accounts', 'delete')
  and not has_table_privilege('authenticated', 'public.transactions', 'delete')
  and has_table_privilege('authenticated', 'public.categories', 'delete'),
  'CA-E3-01: sem delete em accounts e transactions; delete só em categories');
select is(
  (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('account_balances', 'period_summary') and not p.prosecdef),
  2, 'CA-E3-01: account_balances e period_summary são security invoker');
select ok(not has_function_privilege('anon', 'public.account_balances(date)', 'execute')
  and not has_function_privilege('anon', 'public.period_summary(date,date)', 'execute')
  and not has_function_privilege('anon', 'private.today()', 'execute'),
  'CA-E3-01: anon sem EXECUTE nas funções novas');

-- CA-E3-04 · permissões --------------------------------------------------------------------------------------
select tests.login_as('m');
select throws_ok(
  $$insert into public.accounts (family_id, name, type) values (tests.fid('A'), 'Do membro', 'cash')$$,
  '42501', null, 'CA-E3-04: member não cria conta');
select is(tests.affected($$update public.accounts set name = 'Hack' where id = 'a1000000-0000-0000-0000-000000000001'$$), 0,
  'CA-E3-04: member não altera conta (0 linhas)');
select is((select count(*)::int from public.accounts), 2, 'member lê as contas da família');

select tests.login_as('ad');
select lives_ok(
  $$insert into public.accounts (family_id, name, type) values (tests.fid('A'), 'Do admin', 'cash')$$,
  'CA-E3-04: admin cria conta');
select tests.login_as('a');
select lives_ok(
  $$insert into public.accounts (family_id, name, type, opening_balance, institution_name)
    values (tests.fid('A'), 'Do owner', 'checking', -50.25, 'Banco X')$$,
  'CA-E3-04: owner cria conta (saldo inicial negativo em conta comum)');
select is((select created_by from public.accounts where name = 'Do owner'), tests.uid('a'),
  'created_by = chamador');
select is((select opening_balance_date from public.accounts where name = 'Do owner'), private.today(),
  'opening_balance_date padrão = private.today()');
select lives_ok($$update public.accounts set name = 'Corrente principal' where id = 'a1000000-0000-0000-0000-000000000001'$$,
  'owner altera conta');
select throws_ok($$update public.accounts set type = 'cash' where id = 'a1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'CA-E3-04: ninguém altera o type da conta');
select throws_ok(
  $$insert into public.accounts (family_id, name, type, created_by) values (tests.fid('A'), 'X', 'cash', tests.uid('b'))$$,
  '42501', null, 'created_by não está no grant de insert');
select throws_ok($$delete from public.accounts where id = 'a1000000-0000-0000-0000-000000000002'$$, '42501', null,
  'sem delete em accounts');
select throws_ok($$insert into public.accounts (family_id, name, type) values (tests.fid('B'), 'Invasão', 'cash')$$,
  '42501', null, 'owner de A não cria conta em B');

-- isolamento
select tests.login_as('b');
select is((select count(*)::int from public.accounts where family_id = tests.fid('A')), 0, 'B não lê contas de A');
select tests.login_as('c');
select is((select count(*)::int from public.accounts), 0, 'C (sem família) não lê contas');

-- CA-E3-14 · cartão e restrições ---------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok(
  $$insert into public.accounts (family_id, name, type) values (tests.fid('A'), 'Cartão sem dias', 'credit_card')$$,
  '23514', null, 'CA-E3-14: cartão exige dias de fechamento e vencimento');
select throws_ok(
  $$insert into public.accounts (family_id, name, type, statement_closing_day) values (tests.fid('A'), 'Cartão meio', 'credit_card', 5)$$,
  '23514', null, 'CA-E3-14: cartão com só um dos dias é inválido');
select throws_ok(
  $$insert into public.accounts (family_id, name, type, opening_balance, statement_closing_day, statement_due_day)
    values (tests.fid('A'), 'Cartão positivo', 'credit_card', 10, 5, 12)$$,
  '23514', null, 'CA-E3-14: cartão com opening_balance > 0 é inválido');
select throws_ok(
  $$insert into public.accounts (family_id, name, type, statement_closing_day, statement_due_day)
    values (tests.fid('A'), 'Corrente com dias', 'checking', 5, 12)$$,
  '23514', null, 'CA-E3-14: dias de fatura só em cartão');
select throws_ok(
  $$insert into public.accounts (family_id, name, type, credit_limit) values (tests.fid('A'), 'Corrente com limite', 'checking', 500)$$,
  '23514', null, 'CA-E3-14: credit_limit só em cartão');
select throws_ok(
  $$insert into public.accounts (family_id, name, type, credit_limit, statement_closing_day, statement_due_day)
    values (tests.fid('A'), 'Cartão limite zero', 'credit_card', 0, 5, 12)$$,
  '23514', null, 'CA-E3-14: credit_limit deve ser > 0');
select throws_ok(
  $$insert into public.accounts (family_id, name, type, statement_closing_day, statement_due_day)
    values (tests.fid('A'), 'Cartão dia 32', 'credit_card', 32, 12)$$,
  '23514', null, 'CA-E3-14: dia fora de 1..31');
select lives_ok(
  $$insert into public.accounts (family_id, name, type, opening_balance, credit_limit, statement_closing_day, statement_due_day)
    values (tests.fid('A'), 'Cartão Roxo', 'credit_card', -300, 2000, 31, 7)$$,
  'CA-E3-14: cartão válido');
select throws_ok($$insert into public.accounts (family_id, name, type) values (tests.fid('A'), '   ', 'cash')$$,
  '23514', null, 'nome vazio após btrim');
select throws_ok($$insert into public.accounts (family_id, name, type) values (tests.fid('A'), repeat('x', 61), 'cash')$$,
  '23514', null, 'nome com mais de 60 caracteres');

-- nome único entre as ativas
select throws_ok(
  $$insert into public.accounts (family_id, name, type) values (tests.fid('A'), '  CORRENTE principal ', 'checking')$$,
  '23505', null, 'CA-E3-14: nome único entre ativas, sem diferenciar maiúsculas');
select lives_ok($$update public.accounts set is_active = false where name = 'Do admin'$$, 'arquiva conta');
select lives_ok(
  $$insert into public.accounts (family_id, name, type) values (tests.fid('A'), 'Do admin', 'cash')$$,
  'nome de conta arquivada pode ser reutilizado');
select throws_ok($$update public.accounts set is_active = true where created_by = tests.uid('ad') and not is_active$$,
  '23505', null, 'reativar com o nome já usado → 23505');
select tests.login_as('b');
select lives_ok(
  $$insert into public.accounts (family_id, name, type) values (tests.fid('B'), 'Corrente principal', 'cash')$$,
  'nome igual em outra família é permitido');

-- OPENING_DATE_AFTER_TRANSACTIONS (D2)
select tests.logout();
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, created_by) values
  ('f1000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Compra', 10, '2026-03-10', tests.uid('a'));
select tests.login_as('a');
select throws_ok(
  $$update public.accounts set opening_balance_date = '2026-04-01' where id = 'a1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'OPENING_DATE_AFTER_TRANSACTIONS', 'CA-E3-14: saldo inicial depois de um lançamento é rejeitado');
select lives_ok(
  $$update public.accounts set opening_balance_date = '2026-03-10' where id = 'a1000000-0000-0000-0000-000000000001'$$,
  'saldo inicial no mesmo dia do lançamento é aceito');
select lives_ok(
  $$update public.accounts set opening_balance_date = '2025-12-01' where id = 'a1000000-0000-0000-0000-000000000001'$$,
  'mover o saldo inicial para antes é sempre aceito');
select lives_ok($$update public.transactions set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'exclusão lógica da compra');
select lives_ok(
  $$update public.accounts set opening_balance_date = '2026-04-01' where id = 'a1000000-0000-0000-0000-000000000001'$$,
  'lançamento excluído não trava a data do saldo inicial');

select * from finish();
rollback;
