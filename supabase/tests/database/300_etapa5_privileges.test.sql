-- CA-E5-01 (RLS, grants, security definer/invoker, anon), CA-E5-02 (isolamento), CA-E5-03 (FKs compostas e família),
-- CA-E5-04 (permissões de recorrências e orçamentos).
begin;

select plan(55);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a5000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2020-01-01', tests.uid('a')),
  ('a5000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2020-01-01', tests.uid('a')),
  ('a5000000-0000-0000-0000-000000000003', tests.fid('B'), 'Conta B', 'checking', 0, '2020-01-01', tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c5000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c5000000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-2', 'briefcase', tests.uid('a')),
  ('c5000000-0000-0000-0000-000000000003', tests.fid('B'), 'Mercado B', 'expense', 'chart-1', 'utensils', tests.uid('b')),
  ('c5000000-0000-0000-0000-000000000004', tests.fid('A'), 'Transporte', 'expense', 'chart-3', 'car', tests.uid('a'));
select set_config('tests.mem_a', (select id::text from public.family_members where user_id = tests.uid('a')), true);

-- séries: SA (autor a) e SM (autor m) começam hoje, na família A; SB na família B começa longe do horizonte
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('e5000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a5000000-0000-0000-0000-000000000001',
   'c5000000-0000-0000-0000-000000000001', 'Série da dona', 100, 'monthly', private.today(), tests.uid('a')),
  ('e5000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a5000000-0000-0000-0000-000000000001',
   'c5000000-0000-0000-0000-000000000001', 'Série do membro', 50, 'monthly', private.today(), tests.uid('m')),
  ('e5000000-0000-0000-0000-000000000003', tests.fid('B'), 'expense', 'a5000000-0000-0000-0000-000000000003',
   'c5000000-0000-0000-0000-000000000003', 'Série de B', 70, 'monthly', private.today() + 400, tests.uid('b'));
insert into public.budgets (id, family_id, category_id, amount_limit, start_month, created_by) values
  ('b5000000-0000-0000-0000-000000000001', tests.fid('A'), 'c5000000-0000-0000-0000-000000000001', 500, '2020-01-01', tests.uid('a')),
  ('b5000000-0000-0000-0000-000000000002', tests.fid('B'), 'c5000000-0000-0000-0000-000000000003', 300, '2020-01-01', tests.uid('b'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by) values
  ('f5000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a5000000-0000-0000-0000-000000000001',
   'c5000000-0000-0000-0000-000000000001', 'Pendente de A', 80, private.today() + 5, 'pending', tests.uid('a')),
  ('f5000000-0000-0000-0000-000000000002', tests.fid('B'), 'expense', 'a5000000-0000-0000-0000-000000000003',
   'c5000000-0000-0000-0000-000000000003', 'Pendente de B', 40, private.today() + 5, 'pending', tests.uid('b'));

-- CA-E5-01 · estrutura ------------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_class c where c.oid in ('public.recurrences'::regclass, 'public.budgets'::regclass) and c.relrowsecurity),
  2, 'CA-E5-01: recurrences e budgets têm RLS');
select is((select count(*)::int from pg_class c where c.oid in ('public.recurrences'::regclass, 'public.budgets'::regclass)
    and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
      or has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))),
  0, 'CA-E5-01: anon sem privilégio nas tabelas novas');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.recurrences'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')),
  array['account_id', 'amount', 'assigned_member_id', 'category_id', 'description', 'end_date', 'family_id', 'frequency',
        'idempotency_key', 'interval_count', 'payroll_deduction', 'start_date', 'type'],
  'CA-E5-01: grant de insert de recurrences é exatamente o do contrato');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.recurrences'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['account_id', 'amount', 'assigned_member_id', 'category_id', 'description', 'end_date', 'is_active', 'payroll_deduction'],
  'CA-E5-01: grant de update de recurrences é exatamente o do contrato');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.budgets'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')),
  array['amount_limit', 'category_id', 'end_month', 'family_id', 'start_month'],
  'CA-E5-01: grant de insert de budgets');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.budgets'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['amount_limit', 'archived_at', 'end_month'],
  'CA-E5-01: grant de update de budgets (sem category_id nem start_month)');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.transactions'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')),
  array['account_id', 'amount', 'assigned_member_id', 'category_id', 'description', 'destination_account_id',
        'family_id', 'idempotency_key', 'notes', 'reversal_of_id', 'status', 'transaction_date', 'type'],
  'CA-E5-01: grant de insert de transactions inalterado (sem due_date, recurrence_id, occurrence_date)');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.transactions'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['account_id', 'amount', 'assigned_member_id', 'category_id', 'deleted_at', 'description',
        'destination_account_id', 'notes', 'transaction_date'],
  'CA-E5-01: grant de update de transactions inalterado (sem status)');
select ok(not has_table_privilege('authenticated', 'public.recurrences', 'delete')
  and not has_table_privilege('authenticated', 'public.budgets', 'delete'),
  'CA-E5-01: sem delete em recurrences e budgets');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('pay_pending_transaction', 'cancel_pending_transaction', 'materialize_recurrences')
    and p.prosecdef and coalesce(p.proconfig @> array['search_path=""'], false)),
  3, 'CA-E5-01: as três RPCs de escrita são security definer com search_path vazio');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('pending_summary', 'budget_progress') and not p.prosecdef and coalesce(p.proconfig @> array['search_path=""'], false)),
  2, 'CA-E5-01: pending_summary e budget_progress são security invoker com search_path vazio');
select ok(not has_function_privilege('anon', 'public.pay_pending_transaction(uuid,date,numeric,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cancel_pending_transaction(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.materialize_recurrences()', 'execute')
  and not has_function_privilege('anon', 'public.pending_summary()', 'execute')
  and not has_function_privilege('anon', 'public.budget_progress(date,date)', 'execute')
  and not has_function_privilege('anon', 'private.recurrence_occurrence(date,text,smallint,integer)', 'execute')
  and not has_function_privilege('anon', 'private.recurrence_next_on_or_after(date,text,smallint,date)', 'execute')
  and not has_function_privilege('anon', 'private.recurrence_first_index(date,text,smallint,date)', 'execute'),
  'CA-E5-01: anon sem EXECUTE nas funções novas');
select ok(has_function_privilege('authenticated', 'public.pay_pending_transaction(uuid,date,numeric,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.cancel_pending_transaction(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.materialize_recurrences()', 'execute')
  and has_function_privilege('authenticated', 'public.pending_summary()', 'execute')
  and has_function_privilege('authenticated', 'public.budget_progress(date,date)', 'execute'),
  'CA-E5-01: authenticated executa as cinco funções públicas');
select tests.login_anon();
select throws_ok($$select count(*) from public.recurrences$$, '42501', null, 'CA-E5-01: anon não lê recurrences');
select throws_ok($$select count(*) from public.budgets$$, '42501', null, 'CA-E5-01: anon não lê budgets');
select throws_ok($$select public.materialize_recurrences()$$, '42501', null, 'CA-E5-01: anon não executa materialize_recurrences');
select throws_ok($$select public.pay_pending_transaction('f5000000-0000-0000-0000-000000000001', current_date, 1, 'a5000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'CA-E5-01: anon não executa pay_pending_transaction');

-- CA-E5-02 · isolamento (B) -------------------------------------------------------------------------------------------
select tests.login_as('b');
select is((select count(*)::int from public.recurrences where family_id = tests.fid('A')), 0, 'CA-E5-02: B não lê recurrences de A');
select is((select count(*)::int from public.budgets where family_id = tests.fid('A')), 0, 'CA-E5-02: B não lê budgets de A');
select throws_ok($$select public.pay_pending_transaction('f5000000-0000-0000-0000-000000000001', private.today(), 80, 'a5000000-0000-0000-0000-000000000003')$$,
  'P0001', 'NOT_FOUND', 'CA-E5-02: B pagando lançamento de A → NOT_FOUND');
select throws_ok($$select public.cancel_pending_transaction('f5000000-0000-0000-0000-000000000001')$$,
  'P0001', 'NOT_FOUND', 'CA-E5-02: B cancelando lançamento de A → NOT_FOUND');
select is((select public.materialize_recurrences()), 0, 'CA-E5-02: materialize de B não cria nada (série de B fora do horizonte)');
select results_eq($$select payable, receivable, overdue_payable, overdue_receivable, overdue_count from public.pending_summary()$$,
  $$values ('40.00'::text, '0.00'::text, '0.00'::text, '0.00'::text, 0)$$, 'CA-E5-02: pending_summary de B só conta o pendente de B (40,00)');
select results_eq($$select budget_id from public.budget_progress(date_trunc('month', private.today()::timestamp)::date, date_trunc('month', private.today()::timestamp)::date)$$,
  $$values ('b5000000-0000-0000-0000-000000000002'::uuid)$$, 'CA-E5-02: budget_progress de B só traz o orçamento de B');

-- CA-E5-03 · FKs compostas e família (B) ---------------------------------------------------------------------------------
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('B'), 'expense', 'a5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000003', 'Conta de A', 1, 'monthly', private.today())$$,
  '23503', null, 'CA-E5-03: série com account_id de A → 23503');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('B'), 'expense', 'a5000000-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000001', 'Categoria de A', 1, 'monthly', private.today())$$,
  '23503', null, 'CA-E5-03: série com category_id de A → 23503');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, assigned_member_id, description, amount, frequency, start_date)
  values (tests.fid('B'), 'expense', 'a5000000-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000003',
          current_setting('tests.mem_a')::uuid, 'Responsável de A', 1, 'monthly', private.today())$$,
  '23503', null, 'CA-E5-03: série com assigned_member_id de A → 23503');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Invasão', 1, 'monthly', private.today())$$,
  '42501', null, 'CA-E5-03: série com family_id de A → 42501');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('B'), 'c5000000-0000-0000-0000-000000000001', 10, '2026-01-01')$$,
  '23503', null, 'CA-E5-03: orçamento com category_id de A → 23503');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), null, 10, '2026-01-01')$$,
  '42501', null, 'CA-E5-03: orçamento com family_id de A → 42501');
select throws_ok($$select public.pay_pending_transaction('f5000000-0000-0000-0000-000000000002', private.today(), 40, 'a5000000-0000-0000-0000-000000000001')$$,
  '23503', null, 'CA-E5-03: pagar com p_account_id de A → 23503');

-- CA-E5-04 · recurrences: member (a própria série) ---------------------------------------------------------------------------
select tests.login_as('m');
select lives_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001',
          'Nova do membro', 10, 'weekly', private.today() + 30)$$, 'CA-E5-04: member cria série');
select is((select created_by from public.recurrences where description = 'Nova do membro'), tests.uid('m'), 'CA-E5-04: created_by é o chamador');
select is((select count(*)::int from public.recurrences), 3, 'CA-E5-04: member lê todas as séries da família');
select is(tests.affected($$update public.recurrences set description = 'Editada' where id = 'e5000000-0000-0000-0000-000000000002'$$), 1,
  'CA-E5-04: member edita a própria série');
select is(tests.affected($$update public.recurrences set is_active = false where id = 'e5000000-0000-0000-0000-000000000002'$$), 1,
  'CA-E5-04: member pausa a própria série');
select is(tests.affected($$update public.recurrences set end_date = private.today() + 60 where id = 'e5000000-0000-0000-0000-000000000002'$$), 1,
  'CA-E5-04: member encerra (end_date) a própria série');
select is(tests.affected($$update public.recurrences set description = 'Hack' where id = 'e5000000-0000-0000-0000-000000000001'$$), 0,
  'CA-E5-04: member não altera série alheia (0 linhas)');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by)
  values (tests.fid('A'), 'expense', 'a5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Forjada', 1, 'weekly', private.today(), tests.uid('a'))$$,
  '42501', null, 'CA-E5-04: enviar created_by → 42501');

-- owner e admin em qualquer série; colunas imutáveis
select tests.login_as('ad');
select is(tests.affected($$update public.recurrences set amount = 55 where id = 'e5000000-0000-0000-0000-000000000002'$$), 1,
  'CA-E5-04: admin altera série de outro integrante');
select tests.login_as('a');
select is(tests.affected($$update public.recurrences set amount = 56 where id = 'e5000000-0000-0000-0000-000000000002'$$), 1,
  'CA-E5-04: owner altera série de outro integrante');
select throws_ok($$update public.recurrences set type = 'income' where id = 'e5000000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E5-04: type não é atualizável');
select throws_ok($$update public.recurrences set frequency = 'weekly' where id = 'e5000000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E5-04: frequency não é atualizável');
select throws_ok($$update public.recurrences set interval_count = 2 where id = 'e5000000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E5-04: interval_count não é atualizável');
select throws_ok($$update public.recurrences set start_date = private.today() + 1 where id = 'e5000000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E5-04: start_date não é atualizável');
select throws_ok($$update public.recurrences set next_occurrence_date = private.today() + 1 where id = 'e5000000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E5-04: next_occurrence_date é do banco');
select throws_ok($$update public.recurrences set last_failure_code = 'X', last_failure_at = now() where id = 'e5000000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E5-04: last_failure_* é do banco');

-- CA-E5-04 · budgets ---------------------------------------------------------------------------------------------------------
select tests.login_as('m');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c5000000-0000-0000-0000-000000000004', 10, '2026-01-01')$$, '42501', null, 'CA-E5-04: member não cria orçamento');
select is(tests.affected($$update public.budgets set amount_limit = 1 where id = 'b5000000-0000-0000-0000-000000000001'$$), 0,
  'CA-E5-04: member não altera orçamento (0 linhas)');
select is((select count(*)::int from public.budgets), 1, 'CA-E5-04: member lê os orçamentos da família');
select tests.login_as('ad');
select lives_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c5000000-0000-0000-0000-000000000004', 10, '2026-01-01')$$, 'CA-E5-04: admin cria orçamento');
select tests.login_as('a');
select is(tests.affected($$update public.budgets set amount_limit = 600 where id = 'b5000000-0000-0000-0000-000000000001'$$), 1,
  'CA-E5-04: owner altera orçamento');
select throws_ok($$update public.budgets set category_id = 'c5000000-0000-0000-0000-000000000004' where id = 'b5000000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E5-04: category_id do orçamento não é atualizável');
select throws_ok($$update public.budgets set start_month = '2021-01-01' where id = 'b5000000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E5-04: start_month do orçamento não é atualizável');

-- o lançamento de A segue intocado depois das tentativas de B
select is((select status from public.transactions where id = 'f5000000-0000-0000-0000-000000000001'), 'pending',
  'CA-E5-02: o pendente de A ficou inalterado');

select * from finish();
rollback;
