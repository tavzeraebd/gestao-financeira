-- Pós-revisão: SEC-14 (NaN e teto), SEC-15 (exclusão lógica não altera campos), SEC-17 (auditoria de categoria),
-- revisor #6 (reativar subcategoria com pai arquivado).
begin;

select plan(29);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, credit_limit, statement_closing_day, statement_due_day, created_by) values
  ('a1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2026-01-01', null, null, null, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Cartão', 'credit_card', -10, '2026-01-01', 100, 5, 10, tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Pai', 'expense', 'chart-2', 'gift', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, parent_id, created_by) values
  ('c1000000-0000-0000-0000-000000000003', tests.fid('A'), 'Filha', 'expense', 'chart-2', 'gift',
   'c1000000-0000-0000-0000-000000000002', tests.uid('a'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, notes, amount, transaction_date, created_by) values
  ('f1000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Original', 'nota original', 100, '2026-03-10', tests.uid('a'));

select tests.login_as('a');

-- SEC-14 · NaN ------------------------------------------------------------------------------------------------------
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'NaN', 'NaN', '2026-03-10')$$,
  '23514', null, 'SEC-14: amount NaN no insert');
select throws_ok($$update public.transactions set amount = 'NaN' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'SEC-14: amount NaN no update');
select throws_ok($$insert into public.accounts (family_id, name, type, opening_balance) values (tests.fid('A'), 'NaN', 'cash', 'NaN')$$,
  '23514', null, 'SEC-14: opening_balance NaN no insert');
select throws_ok($$update public.accounts set opening_balance = 'NaN' where id = 'a1000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'SEC-14: opening_balance NaN no update');
select throws_ok($$insert into public.accounts (family_id, name, type, credit_limit, statement_closing_day, statement_due_day)
  values (tests.fid('A'), 'Cartão NaN', 'credit_card', 'NaN', 5, 10)$$,
  '23514', null, 'SEC-14: credit_limit NaN no insert');
select throws_ok($$update public.accounts set credit_limit = 'NaN' where id = 'a1000000-0000-0000-0000-000000000002'$$,
  '23514', null, 'SEC-14: credit_limit NaN no update');

-- SEC-14/SEC-18 · teto por valor = 99999999.99
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  select tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Teto ' || n,
         99999999.99, date '2026-04-01' + n from generate_series(1, 5) n$$,
  'SEC-18: 5 lançamentos no teto são aceitos');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Acima', 100000000.00, '2026-04-12')$$,
  '23514', null, 'SEC-18: amount acima do teto é rejeitado (23514)');
select results_eq($$select income, expense, result from public.period_summary('2026-04-01', '2026-04-30')$$,
  $$values ('0.00'::text, '499999999.95'::text, '-499999999.95'::text)$$,
  'SEC-18: period_summary soma vários lançamentos no teto sem erro');
select is((select balance from public.account_balances('2026-04-30') where account_id = 'a1000000-0000-0000-0000-000000000001'), '-500000099.95',
  'SEC-18: account_balances soma vários lançamentos no teto sem erro');
select lives_ok($$update public.accounts set opening_balance = -99999999.99 where id = 'a1000000-0000-0000-0000-000000000001'$$,
  'SEC-18: opening_balance no teto negativo é aceito');
select throws_ok($$update public.accounts set opening_balance = -100000000.00 where id = 'a1000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'SEC-18: opening_balance acima do teto é rejeitado');
select throws_ok($$update public.accounts set credit_limit = 100000000 where id = 'a1000000-0000-0000-0000-000000000002'$$,
  '23514', null, 'SEC-18: credit_limit acima do teto é rejeitado');

-- SEC-15 · exclusão lógica não altera mais nada ------------------------------------------------------------------------
select is(tests.affected($$update public.transactions set deleted_at = now(), amount = 1, description = 'Adulterada', notes = 'x',
  transaction_date = '2026-03-01', account_id = 'a1000000-0000-0000-0000-000000000001', category_id = 'c1000000-0000-0000-0000-000000000001'
  where id = 'f1000000-0000-0000-0000-000000000001'$$), 1, 'exclusão lógica com campos alterados junto é aceita');
select ok((select amount = 100 and description = 'Original' and notes = 'nota original' and transaction_date = '2026-03-10' and deleted_at is not null
            and deleted_by = tests.uid('a') from public.transactions where id = 'f1000000-0000-0000-0000-000000000001'),
  'SEC-15: os demais campos ficam com os valores de old');
select is((select metadata from public.audit_events where action = 'transaction.deleted' and entity_id = 'f1000000-0000-0000-0000-000000000001'),
  '{"type": "expense", "amount": "100.00", "transaction_date": "2026-03-10"}'::jsonb, 'SEC-15: auditoria com os valores de old');
select is((select count(*)::int from public.audit_events where action = 'transaction.updated' and entity_id = 'f1000000-0000-0000-0000-000000000001'), 0,
  'SEC-15: sem transaction.updated');

-- Revisor #5 · member ainda cria lançamento com o lock da conta ----------------------------------------------------------
select tests.login_as('m');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Do membro', 5, '2026-05-10')$$,
  'member cria lançamento (helper de lock enxerga a conta)');
select tests.login_as('b');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Invasão', 5, '2026-05-10')$$,
  '42501', null, 'outra família continua com 42501 (helper não vaza a conta)');
select ok(not has_function_privilege('anon', 'private.lock_account_share(uuid,uuid)', 'execute'), 'anon sem EXECUTE no helper de lock');

-- SEC-17 · category.unarchived / category.deleted -------------------------------------------------------------------------
select tests.login_as('a');
update public.categories set archived_at = now() where id = 'c1000000-0000-0000-0000-000000000003';
update public.categories set archived_at = now() where id = 'c1000000-0000-0000-0000-000000000002';
-- Revisor #6
select throws_ok($$update public.categories set archived_at = null where id = 'c1000000-0000-0000-0000-000000000003'$$,
  'P0001', 'INVALID_CATEGORY_PARENT', 'revisor #6: reativar subcategoria com pai arquivado');
select lives_ok($$update public.categories set archived_at = null where id = 'c1000000-0000-0000-0000-000000000002'$$, 'reativa o pai');
select lives_ok($$update public.categories set archived_at = null where id = 'c1000000-0000-0000-0000-000000000003'$$, 'agora reativa a filha');
select is((select count(*)::int from public.audit_events where action = 'category.unarchived'), 2, 'SEC-17: category.unarchived por reativação');
select is((select metadata from public.audit_events where action = 'category.unarchived' and entity_id = 'c1000000-0000-0000-0000-000000000002'),
  '{}'::jsonb, 'SEC-17: unarchived sem metadata');
select lives_ok($$delete from public.categories where id = 'c1000000-0000-0000-0000-000000000003'$$, 'exclui categoria sem histórico');
select is((select metadata from public.audit_events where action = 'category.deleted' and entity_id = 'c1000000-0000-0000-0000-000000000003'),
  '{}'::jsonb, 'SEC-17: category.deleted sem nome na metadata');
select throws_ok($$delete from public.categories where id = 'c1000000-0000-0000-0000-000000000001'$$, '23503', null,
  'exclusão que falha por FK não deixa evento');
select is((select count(*)::int from public.audit_events where action = 'category.deleted'), 1, 'só a exclusão efetiva gerou evento');

select * from finish();
rollback;
