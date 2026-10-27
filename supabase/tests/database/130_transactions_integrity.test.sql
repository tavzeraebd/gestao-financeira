-- CA-E3-07 (invariantes de lançamento) e a parte de updates de CA-E3-10 que não envolve estorno.
begin;

select plan(36);

select tests.setup_world();

-- vínculo removido de A (usuário d): não pode ser responsável
insert into public.family_members (family_id, user_id, role, status, ended_at)
values (tests.fid('A'), tests.uid('d'), 'member', 'removed', now());

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, is_active, created_by) values
  ('a1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2026-01-01', true, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2026-01-01', true, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000004', tests.fid('A'), 'Arquivada', 'checking', 0, '2026-01-01', false, tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000005', tests.fid('A'), 'Aberta em junho', 'checking', 0, '2026-06-01', true, tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, archived_at, created_by) values
  ('c1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', null, tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-1', 'briefcase', null, tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000004', tests.fid('A'), 'Antiga', 'expense', 'chart-3', 'gift', now(), tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000005', tests.fid('A'), 'Lazer', 'expense', 'chart-2', 'party-popper', null, tests.uid('a'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, created_by) values
  ('f1000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Base', 100, '2026-03-10', tests.uid('a'));

select tests.login_as('a');

-- CA-E3-07 · tipo da categoria -----------------------------------------------------------------------------------------
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'income', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'x', 1, '2026-03-10')$$,
  'P0001', 'CATEGORY_TYPE_MISMATCH', 'CA-E3-07: receita com categoria de despesa');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', 'x', 1, '2026-03-10')$$,
  'P0001', 'CATEGORY_TYPE_MISMATCH', 'CA-E3-07: despesa com categoria de receita');

-- CA-E3-07 · formato (CHECKs) ---------------------------------------------------------------------------------------------
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'x', 1, '2026-03-10')$$,
  '23514', null, 'CA-E3-07: transferência com categoria → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, description, amount, transaction_date)
  values (tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000001', 'x', 1, '2026-03-10')$$,
  '23514', null, 'CA-E3-07: transferência sem destino → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, destination_account_id, description, amount, transaction_date)
  values (tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'x', 1, '2026-03-10')$$,
  '23514', null, 'CA-E3-07: destino igual à origem → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'x', 1, '2026-03-10')$$,
  '23514', null, 'despesa com destino → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'x', 1, '2026-03-10')$$,
  '23514', null, 'despesa sem categoria → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'x', 0, '2026-03-10')$$,
  '23514', null, 'CA-E3-07: amount = 0 → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'x', -5, '2026-03-10')$$,
  '23514', null, 'CA-E3-07: amount negativo → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '   ', 1, '2026-03-10')$$,
  '23514', null, 'descrição vazia após btrim');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', repeat('x', 121), 1, '2026-03-10')$$,
  '23514', null, 'descrição com mais de 120 caracteres');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, notes)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'x', 1, '2026-03-10', repeat('n', 1001))$$,
  '23514', null, 'notas com mais de 1000 caracteres');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Centavos', 0.01, '2026-03-10')$$,
  'amount mínimo 0,01 é aceito');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Grande', 1000000000000, '2026-03-10')$$,
  '22003', null, 'amount acima de numeric(14,2) → 22003');

-- CA-E3-07 · arquivados -------------------------------------------------------------------------------------------------
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000001', 'x', 1, '2026-03-10')$$,
  'P0001', 'ACCOUNT_ARCHIVED', 'CA-E3-07: conta arquivada');
select throws_ok($$insert into public.transactions (family_id, type, account_id, destination_account_id, description, amount, transaction_date)
  values (tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 'x', 1, '2026-03-10')$$,
  'P0001', 'ACCOUNT_ARCHIVED', 'CA-E3-07: destino arquivado');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004', 'x', 1, '2026-03-10')$$,
  'P0001', 'CATEGORY_ARCHIVED', 'CA-E3-07: categoria arquivada');

-- CA-E3-07 · responsável ----------------------------------------------------------------------------------------------------
select tests.logout();
select set_config('tests.member_removed', (select id::text from public.family_members where user_id = tests.uid('d')), true);
select tests.login_as('a');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          current_setting('tests.member_removed')::uuid, 'x', 1, '2026-03-10')$$,
  'P0001', 'INVALID_INPUT', 'responsável com vínculo removido → INVALID_INPUT');

-- CA-E3-07 · data vs saldo inicial --------------------------------------------------------------------------------------------
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'x', 1, '2026-05-31')$$,
  'P0001', 'DATE_BEFORE_OPENING_BALANCE', 'CA-E3-07: data anterior ao saldo inicial da conta');
select throws_ok($$insert into public.transactions (family_id, type, account_id, destination_account_id, description, amount, transaction_date)
  values (tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000005', 'x', 1, '2026-05-31')$$,
  'P0001', 'DATE_BEFORE_OPENING_BALANCE', 'CA-E3-07: data anterior ao saldo inicial do destino');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000001', 'No dia', 1, '2026-06-01')$$,
  'data igual ao saldo inicial é aceita');

-- CA-E3-07 · data futura em São Paulo -----------------------------------------------------------------------------------------
select lives_ok(format($f$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (%L, 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Hoje', 1, %L)$f$,
  tests.fid('A'), private.today()), 'paid com data de hoje (São Paulo) é aceito');
select throws_ok(format($f$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (%L, 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Amanhã', 1, %L)$f$,
  tests.fid('A'), private.today() + 1), 'P0001', 'FUTURE_DATE_NOT_ALLOWED', 'CA-E3-07: paid com data futura');
select lives_ok(format($f$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status)
  values (%L, 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'A pagar', 1, %L, 'pending')$f$,
  tests.fid('A'), private.today() + 30), 'pending com data futura é aceito');
select is(private.today(), (now() at time zone 'America/Sao_Paulo')::date, 'private.today() = data civil em America/Sao_Paulo');

-- updates: as mesmas invariantes valem quando a referência muda ---------------------------------------------------------------
select throws_ok($$update public.transactions set account_id = 'a1000000-0000-0000-0000-000000000004' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'ACCOUNT_ARCHIVED', 'update: mover para conta arquivada');
select throws_ok($$update public.transactions set category_id = 'c1000000-0000-0000-0000-000000000004' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'CATEGORY_ARCHIVED', 'update: mover para categoria arquivada');
select throws_ok($$update public.transactions set category_id = 'c1000000-0000-0000-0000-000000000002' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'CATEGORY_TYPE_MISMATCH', 'update: categoria de tipo diferente');
select throws_ok($$update public.transactions set transaction_date = '2025-12-31' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'DATE_BEFORE_OPENING_BALANCE', 'update: data anterior ao saldo inicial');
select throws_ok(format($f$update public.transactions set transaction_date = %L where id = 'f1000000-0000-0000-0000-000000000001'$f$, private.today() + 1),
  'P0001', 'FUTURE_DATE_NOT_ALLOWED', 'update: data futura em paid');
select throws_ok($$update public.transactions set amount = 0 where id = 'f1000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'update: amount <= 0');
select throws_ok($$update public.transactions set destination_account_id = 'a1000000-0000-0000-0000-000000000002' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'update: destino em despesa → 23514');
select lives_ok($$update public.transactions set category_id = 'c1000000-0000-0000-0000-000000000005', amount = 120.75, transaction_date = '2026-03-12'
  where id = 'f1000000-0000-0000-0000-000000000001'$$, 'update válido de categoria, valor e data');

-- referência arquivada depois: editar outro campo não é bloqueado
select tests.logout();
update public.accounts set is_active = false where id = 'a1000000-0000-0000-0000-000000000001';
update public.categories set archived_at = now() where id = 'c1000000-0000-0000-0000-000000000005';
select tests.login_as('a');
select lives_ok($$update public.transactions set description = 'Renomeada', notes = 'nota' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'conta e categoria arquivadas depois: editar descrição/notas continua permitido');
select lives_ok($$update public.transactions set amount = 130 where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'conta arquivada depois: editar o valor sem trocar a referência é permitido');

select is((select count(*)::int from public.transactions where description in ('Centavos', 'No dia', 'Hoje', 'A pagar', 'Renomeada')), 5,
  'só os lançamentos válidos foram gravados');

select * from finish();
rollback;
