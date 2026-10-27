-- CA-E6-07, CA-E6-08, CA-E6-09: divisão de despesas, D13 e reescala.
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

insert into public.transactions (id, family_id, type, account_id, destination_account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f6000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'T1', 100, private.today() - 3, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', tests.mem('m'), 'T2', 200, private.today() + 5, 'pending', tests.uid('m')),
  ('f6000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', tests.mem('m'), 'T3', 60, private.today() - 3, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000004', tests.fid('A'), 'income', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000002', null, 'T4', 10, private.today() - 3, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000005', tests.fid('A'), 'transfer', 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', null, null, 'T5', 20, private.today() - 3, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000006', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', null, 'T6', 15, private.today() + 2, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000007', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', null, 'T7 original', 80, private.today() - 3, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000009', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', null, 'T9', 1, private.today() - 3, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000010', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', null, 'T10', 100, private.today() + 3, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000011', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', null, 'T11', 90, private.today() + 3, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000012', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', null, 'T12', 30, private.today() + 3, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000013', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', null, 'c6000000-0000-0000-0000-000000000001', null, 'T13', 50, private.today() - 3, 'paid', tests.uid('a'));
update public.transactions set status = 'canceled' where id = 'f6000000-0000-0000-0000-000000000006';
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by, deleted_at, deleted_by) values
  ('f6000000-0000-0000-0000-000000000008', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'T8 excluída', 25, private.today() - 3, 'paid', tests.uid('a'), now(), tests.uid('a'));
-- T13 já dividida com um ex-integrante
insert into public.expense_splits (family_id, transaction_id, member_id, amount, created_by) values
  (tests.fid('A'), 'f6000000-0000-0000-0000-000000000013', (select id from public.family_members where user_id = tests.uid('c')), 25, tests.uid('a')),
  (tests.fid('A'), 'f6000000-0000-0000-0000-000000000013', tests.mem('a'), 25, tests.uid('a'));
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_ad', tests.mem('ad')::text, true);
select set_config('tests.mem_m', tests.mem('m')::text, true);
select set_config('tests.mem_c', (select id::text from public.family_members where user_id = tests.uid('c')), true);

select tests.login_as('a');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'T7 estorno', 10, private.today() - 2, 'paid', 'f6000000-0000-0000-0000-000000000007');
select tests.logout();
select set_config('tests.rev', (select id::text from public.transactions where description = 'T7 estorno'), true);

-- permissões
select tests.login_as('m');
select lives_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000002', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_m')), jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad'))))$$,
  'CA-E6-07: autor (member) divide a própria despesa');
select is((select array_agg(s.amount order by fm.joined_at) from public.expense_splits s join public.family_members fm on fm.id = s.member_id
  where s.transaction_id = 'f6000000-0000-0000-0000-000000000002'), array[66.67, 66.67, 66.66]::numeric[], 'CA-E6-08: 200,00/3 → 66,67 · 66,67 · 66,66 na ordem joined_at');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000001', 'none', null)$$, '42501', 'FORBIDDEN', 'CA-E6-07: outro member → 42501');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000003', 'none', null)$$, '42501', 'FORBIDDEN', 'CA-E6-07: responsável que não é autor → 42501');
select tests.logout();
select tests.login_no_sub();
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000001', 'none', null)$$, 'P0001', 'NOT_AUTHENTICATED', 'sem sub → NOT_AUTHENTICATED');
select tests.logout();
select tests.login_as('d');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000001', 'none', null)$$, '42501', 'FORBIDDEN', 'CA-E6-07: sem família → 42501');
select tests.logout();

select tests.login_as('ad');
select lives_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000001', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_m')), jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad'))))$$,
  'CA-E6-07: admin divide');
select is((select array_agg(s.amount order by fm.joined_at) from public.expense_splits s join public.family_members fm on fm.id = s.member_id
  where s.transaction_id = 'f6000000-0000-0000-0000-000000000001'), array[33.34, 33.33, 33.33]::numeric[], 'CA-E6-08: R6 100,00/3 → 33,34 · 33,33 · 33,33');
select lives_ok($$select tests.check_splits()$$, 'Σ parcelas = valor (constraint trigger no commit simulado)');

-- tipos não divisíveis
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000004', 'none', null)$$, 'P0001', 'SPLIT_NOT_ALLOWED', 'CA-E6-07: receita');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000005', 'none', null)$$, 'P0001', 'SPLIT_NOT_ALLOWED', 'CA-E6-07: transferência');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000006', 'none', null)$$, 'P0001', 'SPLIT_NOT_ALLOWED', 'CA-E6-07: cancelada');
select throws_ok(format($$select public.set_transaction_splits(%L, 'none', null)$$, current_setting('tests.rev')), 'P0001', 'SPLIT_NOT_ALLOWED', 'CA-E6-07: estorno');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000008', 'none', null)$$, 'P0001', 'NOT_FOUND', 'CA-E6-07: excluída → NOT_FOUND');

-- validação de entrada
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'equal', jsonb_build_array(jsonb_build_object('member_id', current_setting('tests.mem_a'))))$$, 'P0001', 'INVALID_INPUT', 'CA-E6-08: 1 integrante');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'equal', (select jsonb_agg(jsonb_build_object('member_id', gen_random_uuid())) from generate_series(1, 21)))$$, 'P0001', 'INVALID_INPUT', 'CA-E6-08: 21 integrantes');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'equal', jsonb_build_array(jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_a'))))$$, 'P0001', 'INVALID_INPUT', 'CA-E6-08: integrante repetido');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'bogus', null)$$, 'P0001', 'INVALID_INPUT', 'modo inválido');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'equal', null)$$, 'P0001', 'INVALID_INPUT', 'shares nulo');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'equal', jsonb_build_array('x', 'y'))$$, 'P0001', 'INVALID_INPUT', 'elementos que não são objetos');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'amounts', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a'), 'amount', '0.50'), jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'amount', '0.499')))$$, 'P0001', 'INVALID_INPUT', 'CA-E6-08: valor 0.499 (3 casas)');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'amounts', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a'), 'amount', '-1'), jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'amount', '2')))$$, 'P0001', 'INVALID_INPUT', 'CA-E6-08: valor -1');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'amounts', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a'), 'amount', '0'), jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'amount', '1')))$$, 'P0001', 'INVALID_INPUT', 'CA-E6-08: valor 0');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'amounts', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a'), 'amount', 0.5), jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'amount', 0.5)))$$, 'P0001', 'INVALID_INPUT', 'amount numérico (não texto)');

-- inativos
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000001', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_c'))))$$, 'P0001', 'MEMBER_INACTIVE', 'CA-E6-08: integrante novo inativo → MEMBER_INACTIVE');
select lives_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000013', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_c'))))$$, 'CA-E6-08: ex-integrante que já estava na divisão é aceito');
select is((select array_agg(s.amount order by fm.joined_at) from public.expense_splits s join public.family_members fm on fm.id = s.member_id
  where s.transaction_id = 'f6000000-0000-0000-0000-000000000013'), array[25, 25]::numeric[], 'divisão com ex-integrante: 25,00 · 25,00');

-- amounts
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000001', 'amounts', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a'), 'amount', '50'), jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'amount', '40')))$$, 'P0001', 'SPLIT_SUM_MISMATCH', 'CA-E6-08: Σ diferente → SPLIT_SUM_MISMATCH');
select is((select array_agg(s.amount order by fm.joined_at) from public.expense_splits s join public.family_members fm on fm.id = s.member_id
  where s.transaction_id = 'f6000000-0000-0000-0000-000000000001'), array[33.34, 33.33, 33.33]::numeric[], 'CA-E6-08: nada muda após a falha');
select lives_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000001', 'amounts', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a'), 'amount', '70'), jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'amount', '30.00')))$$, 'CA-E6-08: amounts com Σ exata');
select is((select count(*)::int from public.expense_splits where transaction_id = 'f6000000-0000-0000-0000-000000000001'), 2, 'o conjunto foi substituído (2 partes)');
select lives_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000001', 'none', null)$$, 'CA-E6-08: none remove');
select is((select count(*)::int from public.expense_splits where transaction_id = 'f6000000-0000-0000-0000-000000000001'), 0, 'CA-E6-08: sem parcelas após none');
select tests.logout();

-- escrita direta
select tests.login_as('a');
select throws_ok($$insert into public.expense_splits (family_id, transaction_id, member_id, amount) values (tests.fid('A'), 'f6000000-0000-0000-0000-000000000009', tests.mem('a'), 1)$$, '42501', null, 'CA-E6-07: insert direto → 42501');
select throws_ok($$update public.expense_splits set amount = 1$$, '42501', null, 'CA-E6-07: update direto → 42501');
select throws_ok($$delete from public.expense_splits$$, '42501', null, 'CA-E6-07: delete direto → 42501');
select tests.logout();

-- 1,00 / 7 integrantes
select tests.create_user('p1'); select tests.create_user('p2'); select tests.create_user('p3'); select tests.create_user('p4');
insert into public.family_members (family_id, user_id, role, joined_at) values
  (tests.fid('A'), tests.uid('p1'), 'member', '2020-04-01'), (tests.fid('A'), tests.uid('p2'), 'member', '2020-05-01'),
  (tests.fid('A'), tests.uid('p3'), 'member', '2020-06-01'), (tests.fid('A'), tests.uid('p4'), 'member', '2020-07-01');
select tests.login_as('a');
select lives_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000009', 'equal',
  (select jsonb_agg(jsonb_build_object('member_id', fm.id)) from public.family_members fm where fm.family_id = tests.fid('A') and fm.status = 'active'))$$, 'CA-E6-08: 7 integrantes');
select is((select array_agg(s.amount order by fm.joined_at) from public.expense_splits s join public.family_members fm on fm.id = s.member_id
  where s.transaction_id = 'f6000000-0000-0000-0000-000000000009'), array[0.15, 0.15, 0.14, 0.14, 0.14, 0.14, 0.14]::numeric[], 'CA-E6-08: 1,00/7 → 0,15 · 0,15 · 0,14 × 5');

-- estorno e original dividido: estorno não ganha linhas
select lives_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000007', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad'))))$$, 'divide o original que tem estorno');
select is((select count(*)::int from public.expense_splits s join public.transactions t on t.id = s.transaction_id where t.reversal_of_id is not null), 0, 'CA-E6-09: o estorno não ganha linhas em expense_splits');

-- reescala
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000010', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad')), jsonb_build_object('member_id', current_setting('tests.mem_m'))));
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000011', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad')), jsonb_build_object('member_id', current_setting('tests.mem_m'))));
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000012', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad')), jsonb_build_object('member_id', current_setting('tests.mem_m'))));
select is((select array_agg(s.amount order by fm.joined_at) from public.expense_splits s join public.family_members fm on fm.id = s.member_id
  where s.transaction_id = 'f6000000-0000-0000-0000-000000000010'), array[33.34, 33.33, 33.33]::numeric[], 'CA-E6-09: R17 antes: 33,34 · 33,33 · 33,33');
select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000010', private.today(), 101, 'a6000000-0000-0000-0000-000000000001');
select is((select array_agg(s.amount order by fm.joined_at) from public.expense_splits s join public.family_members fm on fm.id = s.member_id
  where s.transaction_id = 'f6000000-0000-0000-0000-000000000010'), array[33.68, 33.66, 33.66]::numeric[], 'CA-E6-09: R17 depois: 33,68 · 33,66 · 33,66');
select is((select count(*)::int from public.expense_splits where transaction_id = 'f6000000-0000-0000-0000-000000000010'), 3, 'CA-E6-09: R17 mantém 3 linhas');
select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000011', private.today(), 90, 'a6000000-0000-0000-0000-000000000001');
select is((select array_agg(s.amount order by fm.joined_at) from public.expense_splits s join public.family_members fm on fm.id = s.member_id
  where s.transaction_id = 'f6000000-0000-0000-0000-000000000011'), array[30, 30, 30]::numeric[], 'CA-E6-09: pagar com o mesmo valor não muda as parcelas');
select lives_ok($$update public.transactions set amount = 60 where id = 'f6000000-0000-0000-0000-000000000012'$$, 'edita o valor do compromisso dividido');
select is((select array_agg(s.amount order by fm.joined_at) from public.expense_splits s join public.family_members fm on fm.id = s.member_id
  where s.transaction_id = 'f6000000-0000-0000-0000-000000000012'), array[20, 20, 20]::numeric[], 'CA-E6-09: editar o valor reescala (60,00/3)');
select lives_ok($$select tests.check_splits()$$, 'CA-E6-09: Σ parcelas = valor em todas as despesas divididas');
select tests.logout();

-- Σ forçada sem a RPC falha no commit
update public.expense_splits set amount = amount + 1 where id = (select id from public.expense_splits where transaction_id = 'f6000000-0000-0000-0000-000000000002' limit 1);
select throws_ok($$set constraints all immediate$$, 'P0001', 'SPLIT_SUM_MISMATCH', 'CA-E6-09: Σ parcelas ≠ valor forçado (como postgres) falha no commit');

select * from finish();
rollback;
