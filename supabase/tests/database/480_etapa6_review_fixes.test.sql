-- Correções pós-revisão da Etapa 6: SPLIT_AMOUNT_TOO_SMALL, SEC-25 (contraparte exclui acerto), SEC-23 (auditoria de splits).
begin;

select no_plan();

select tests.setup_world();
create function tests.mem(p_key text) returns uuid language sql stable as $$
  select id from public.family_members where user_id = tests.uid(p_key) $$;
grant execute on function tests.mem(text) to authenticated;
update public.family_members set joined_at = '2020-01-01' where user_id = tests.uid('a');
update public.family_members set joined_at = '2020-02-01' where user_id = tests.uid('ad');
update public.family_members set joined_at = '2020-03-01' where user_id = tests.uid('m');
insert into public.family_members (family_id, user_id, role, status, joined_at, ended_at)
  values (tests.fid('A'), tests.uid('c'), 'member', 'removed', '2019-01-01', now());
insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a6000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 1000, '2020-01-01', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c6000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a'));
insert into public.transactions (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f6000000-0000-0000-0000-000000000801', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'Rescala', 100, private.today() - 5, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000802', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'Mínimo', 0.02, private.today() - 5, 'paid', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000803', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'Noop', 90, private.today() - 5, 'paid', tests.uid('a'));
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_ad', tests.mem('ad')::text, true);
select set_config('tests.mem_m', tests.mem('m')::text, true);

-- (1) SPLIT_AMOUNT_TOO_SMALL
select tests.login_as('a');
select lives_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000801', 'amounts', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a'), 'amount', '0.01'),
  jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'amount', '99.99')))$$, 'divisão 0,01 / 99,99 aceita');
select throws_ok($$update public.transactions set amount = 1 where id = 'f6000000-0000-0000-0000-000000000801'$$,
  'P0001', 'SPLIT_AMOUNT_TOO_SMALL', 'reescala que zera parcela → SPLIT_AMOUNT_TOO_SMALL');
select is((select amount from public.transactions where id = 'f6000000-0000-0000-0000-000000000801'), 100.00, 'valor da despesa intacto');
select is((select array_agg(amount order by amount) from public.expense_splits where transaction_id = 'f6000000-0000-0000-0000-000000000801'),
  array[0.01, 99.99]::numeric[], 'parcelas intactas');
select throws_ok($$select public.set_transaction_splits('f6000000-0000-0000-0000-000000000802', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad')),
  jsonb_build_object('member_id', current_setting('tests.mem_m'))))$$, 'P0001', 'SPLIT_AMOUNT_TOO_SMALL', '0,02 em 3 → SPLIT_AMOUNT_TOO_SMALL');
select is((select count(*)::int from public.expense_splits where transaction_id = 'f6000000-0000-0000-0000-000000000802'), 0, 'nada gravado');

-- (3) SEC-23
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000803', 'none', null);
select is((select count(*)::int from public.audit_events where action = 'transaction.splits_changed' and entity_id = 'f6000000-0000-0000-0000-000000000803'), 0,
  'none sem divisão prévia não audita');
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000803', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad'))));
select is((select count(*)::int from public.audit_events where action = 'transaction.splits_changed' and entity_id = 'f6000000-0000-0000-0000-000000000803'), 1, 'criação audita');
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000803', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_ad')), jsonb_build_object('member_id', current_setting('tests.mem_a'))));
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000803', 'amounts', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a'), 'amount', '45'), jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'amount', '45')));
select is((select count(*)::int from public.audit_events where action = 'transaction.splits_changed' and entity_id = 'f6000000-0000-0000-0000-000000000803'), 1,
  'conjunto idêntico ao atual é no-op sem reauditar');
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000803', 'amounts', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a'), 'amount', '50'), jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'amount', '40')));
select is((select count(*)::int from public.audit_events where action = 'transaction.splits_changed' and entity_id = 'f6000000-0000-0000-0000-000000000803'), 2, 'conjunto diferente audita');
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000803', 'none', null);
select is((select count(*)::int from public.audit_events where action = 'transaction.splits_changed' and entity_id = 'f6000000-0000-0000-0000-000000000803'), 3, 'none que removeu linhas audita');
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000803', 'none', null);
select is((select count(*)::int from public.audit_events where action = 'transaction.splits_changed' and entity_id = 'f6000000-0000-0000-0000-000000000803'), 3, 'none repetido não audita');
select tests.logout();

-- (2) SEC-25
select tests.login_as('a');
select lives_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes)
  values (tests.fid('A'), tests.mem('ad'), tests.mem('m'), 10, private.today() - 1, 'ad-m')$$, 'owner registra acerto ad para m');
select lives_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes)
  values (tests.fid('A'), tests.mem('a'), tests.mem('ad'), 11, private.today() - 1, 'a-ad')$$, 'owner registra acerto a para ad');
select lives_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes)
  values (tests.fid('A'), (select id from public.family_members where user_id = tests.uid('c')), tests.mem('ad'), 12, private.today() - 30, 'c-ad')$$, 'acerto com ex-integrante');
select tests.logout();

select tests.login_as('m');
select is(tests.affected($$update public.settlements set deleted_at = now() where notes = 'a-ad'$$), 0, 'terceiro member nao exclui');
select is(tests.affected($$update public.settlements set deleted_at = now() where notes = 'ad-m'$$), 1, 'contraparte (to) exclui');
select is(tests.affected($$update public.settlements set deleted_at = null where notes = 'ad-m'$$), 0, 'desexcluir segue proibido (linha ja excluida nao e visivel ao update)');
select tests.logout();

select tests.login_as('c');
select is(tests.affected($$update public.settlements set deleted_at = now() where notes = 'c-ad'$$), 0, 'ex-integrante nao exclui');
select tests.logout();

select tests.login_as('a');
select is((select count(*)::int from public.audit_events where action = 'settlement.deleted'), 1, 'auditoria settlement.deleted registrada');
select is((select deleted_by from public.settlements where notes = 'ad-m'), tests.uid('m'), 'deleted_by fixado pelo trigger');
select tests.logout();

select tests.login_as('ad');
select is(tests.affected($$update public.settlements set deleted_at = now() where notes = 'a-ad'$$), 1, 'parte (to, admin) exclui');
select tests.logout();

select * from finish();
rollback;
