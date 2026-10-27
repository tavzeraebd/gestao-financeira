-- CA-E6-10, CA-E6-11: acertos e member_balances (R18).
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

insert into public.transactions (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f6000000-0000-0000-0000-000000000301', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'D300', 300, private.today() - 20, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000302', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', tests.mem('ad'), 'D90', 90, private.today() - 19, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000303', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', null, 'D50 sem responsável', 50, private.today() - 18, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000304', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'Pendente', 70, private.today() + 4, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000305', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'A cancelar', 40, private.today() + 4, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000306', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'A excluir', 33, private.today() - 17, 'paid', tests.uid('a'));
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_ad', tests.mem('ad')::text, true);
select set_config('tests.mem_m', tests.mem('m')::text, true);
select set_config('tests.mem_c', (select id::text from public.family_members where user_id = tests.uid('c')), true);

select tests.login_as('a');
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000301', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad')), jsonb_build_object('member_id', current_setting('tests.mem_m'))));
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000302', 'amounts', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a'), 'amount', '30'), jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'amount', '60')));
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000303', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_ad')), jsonb_build_object('member_id', current_setting('tests.mem_m'))));
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000304', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_ad')), jsonb_build_object('member_id', current_setting('tests.mem_m'))));
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000305', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_ad')), jsonb_build_object('member_id', current_setting('tests.mem_m'))));
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000306', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_ad')), jsonb_build_object('member_id', current_setting('tests.mem_m'))));
select public.cancel_pending_transaction('f6000000-0000-0000-0000-000000000305');
update public.transactions set deleted_at = now() where id = 'f6000000-0000-0000-0000-000000000306';
select tests.logout();

-- R18 sem acerto: ad deve 100 - 30 = 70 a a; m deve 100 a a
select tests.login_as('ad');
select is((select amount from public.member_balances() where debtor_member_id = tests.mem('ad') and creditor_member_id = tests.mem('a')), '70.00',
  'CA-E6-11: R18 antes do acerto: B deve 70,00 a A');
select lives_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes)
  values (tests.fid('A'), tests.mem('ad'), tests.mem('a'), 50, private.today() - 1, 's50')$$, 'CA-E6-10: member (parte) registra acerto');
select is((select amount from public.member_balances() where debtor_member_id = tests.mem('ad') and creditor_member_id = tests.mem('a')), '20.00',
  'CA-E6-11: R18: B deve 20,00 a A');
select is((select amount from public.member_balances() where debtor_member_id = tests.mem('m') and creditor_member_id = tests.mem('a')), '100.00',
  'CA-E6-11: R18: C deve 100,00 a A');
select is((select count(*)::int from public.member_balances()), 2, 'CA-E6-11: R18: só 2 pares; despesa sem responsável, pendente, cancelada e excluída não geram dívida');
select tests.logout();

-- acerto excluído não conta
select tests.login_as('a');
select lives_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes)
  values (tests.fid('A'), tests.mem('m'), tests.mem('a'), 500, private.today() - 1, 's500')$$, 'owner registra acerto entre quaisquer');
select is((select count(*)::int from public.member_balances() where debtor_member_id = tests.mem('a') and creditor_member_id = tests.mem('m')), 1, 'o acerto inverte o par (A passa a dever a C)');
select is(tests.affected($$update public.settlements set deleted_at = now() where notes = 's500'$$), 1, 'owner exclui o acerto');
select is((select amount from public.member_balances() where debtor_member_id = tests.mem('m') and creditor_member_id = tests.mem('a')), '100.00', 'CA-E6-11: acerto excluído fora do saldo');
select is((select count(*)::int from public.member_balances() where amount::numeric <= 0), 0, 'CA-E6-11: só saldos positivos');
select tests.logout();

-- CA-E6-10 · permissões
select tests.login_as('m');
select lives_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes)
  values (tests.fid('A'), tests.mem('m'), tests.mem('a'), 10, private.today(), 'sm10')$$, 'CA-E6-10: member sendo from');
select lives_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes)
  values (tests.fid('A'), tests.mem('ad'), tests.mem('m'), 5, private.today(), 'sm5')$$, 'CA-E6-10: member sendo to');
select throws_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date)
  values (tests.fid('A'), tests.mem('a'), tests.mem('ad'), 10, private.today())$$, '42501', null, 'CA-E6-10: member que não é parte → 42501');
select throws_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date)
  values (tests.fid('A'), tests.mem('m'), tests.mem('m'), 10, private.today())$$, '23514', null, 'CA-E6-10: from = to → 23514');
select throws_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date)
  values (tests.fid('A'), tests.mem('m'), tests.mem('a'), 10, private.today() + 1)$$, 'P0001', 'FUTURE_DATE_NOT_ALLOWED', 'CA-E6-10: data futura');
select is(tests.affected($$update public.settlements set deleted_at = now() where notes = 's50'$$), 0, 'CA-E6-10: member não exclui acerto alheio (0 linhas)');
select throws_ok($$update public.settlements set amount = 1 where notes = 'sm10'$$, '42501', null, 'CA-E6-10: update além de deleted_at → 42501');
select is(tests.affected($$update public.settlements set deleted_at = now() where notes = 'sm10'$$), 1, 'CA-E6-10: autor exclui o próprio acerto');
select tests.logout();
select tests.login_as('ad');
select lives_ok(format($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes)
  values (tests.fid('A'), %L, tests.mem('ad'), 12, private.today() - 30, 'sex')$$, current_setting('tests.mem_c')), 'CA-E6-10: com ex-integrante, aceito (parte ativa)');
select tests.logout();
select tests.login_as('a');
select lives_ok(format($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes)
  values (tests.fid('A'), %L, tests.mem('m'), 3, private.today() - 30, 'sex2')$$, current_setting('tests.mem_c')), 'CA-E6-10: owner com ex-integrante');
select is(tests.affected($$update public.settlements set deleted_at = now() where notes = 'sm5'$$), 1, 'CA-E6-10: owner exclui acerto de outro');
select tests.logout();
select tests.login_as('ad');
select is(tests.affected($$update public.settlements set deleted_at = now() where notes = 's50'$$), 1, 'CA-E6-10: autor (admin) exclui');
select tests.logout();

select * from finish();
rollback;
