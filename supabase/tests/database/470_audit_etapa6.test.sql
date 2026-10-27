-- CA-E6-15: auditoria da Etapa 6 (goal.*, goal_contribution.deleted, transaction.splits_changed, settlement.*).
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
  ('f6000000-0000-0000-0000-000000000471', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', tests.mem('a'), 'SEGREDO-DESC', 100, private.today() - 2, 'paid', tests.uid('a'));
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_ad', tests.mem('ad')::text, true);

select tests.login_as('a');
insert into public.goals (family_id, name, description, target_amount, target_date) values (tests.fid('A'), 'SEGREDO-META', 'SEGREDO-DESCRICAO', 5000, '2030-01-01');
select set_config('tests.goal', (select id::text from public.goals where name = 'SEGREDO-META'), true);
select is((select count(*)::int from public.audit_events), 0, 'criar meta e aporte não gera auditoria');
update public.goals set name = 'SEGREDO-NOVO', description = 'SEGREDO-2', icon = 'plane' where id = current_setting('tests.goal')::uuid;
select is((select count(*)::int from public.audit_events), 0, 'CA-E6-15: nome, descrição e ícone não são auditados');
update public.goals set target_amount = 6000, target_date = null where id = current_setting('tests.goal')::uuid;
select is((select metadata from public.audit_events where action = 'goal.updated'),
  jsonb_build_object('changed', jsonb_build_array('target_amount', 'target_date'),
                     'old', jsonb_build_object('target_amount', '5000.00', 'target_date', '2030-01-01'),
                     'new', jsonb_build_object('target_amount', '6000.00', 'target_date', null)),
  'CA-E6-15: goal.updated com changed/old/new');
update public.goals set status = 'paused' where id = current_setting('tests.goal')::uuid;
select is((select metadata from public.audit_events where action = 'goal.status_changed'), '{"from": "active", "to": "paused"}'::jsonb, 'CA-E6-15: goal.status_changed');
update public.goals set status = 'active' where id = current_setting('tests.goal')::uuid;

insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, notes)
  values (tests.fid('A'), current_setting('tests.goal')::uuid, tests.mem('a'), 'deposit', 25.5, private.today(), 'SEGREDO-NOTA');
select is((select count(*)::int from public.audit_events where action like 'goal_contribution.%'), 0, 'criação de aporte não é auditada');
update public.goal_contributions set deleted_at = now() where notes = 'SEGREDO-NOTA';
select is((select metadata from public.audit_events where action = 'goal_contribution.deleted'),
  jsonb_build_object('goal_id', current_setting('tests.goal')::uuid, 'kind', 'deposit', 'amount', '25.50'), 'CA-E6-15: goal_contribution.deleted');

select public.set_transaction_splits('f6000000-0000-0000-0000-000000000471', 'equal', jsonb_build_array(
  jsonb_build_object('member_id', current_setting('tests.mem_a')), jsonb_build_object('member_id', current_setting('tests.mem_ad'))));
select public.set_transaction_splits('f6000000-0000-0000-0000-000000000471', 'none', null);
select is((select array_agg(metadata order by created_at, metadata::text) from public.audit_events where action = 'transaction.splits_changed'),
  array['{"mode": "equal", "parts": 2}'::jsonb, '{"mode": "none", "parts": 0}'::jsonb], 'CA-E6-15: transaction.splits_changed (equal e none)');

insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes)
  values (tests.fid('A'), tests.mem('ad'), tests.mem('a'), 12.34, private.today() - 1, 'SEGREDO-ACERTO');
update public.settlements set deleted_at = now() where notes = 'SEGREDO-ACERTO';
select is((select metadata from public.audit_events where action = 'settlement.created'),
  jsonb_build_object('amount', '12.34', 'settlement_date', to_char(private.today() - 1, 'YYYY-MM-DD')), 'CA-E6-15: settlement.created');
select is((select metadata from public.audit_events where action = 'settlement.deleted'),
  jsonb_build_object('amount', '12.34', 'settlement_date', to_char(private.today() - 1, 'YYYY-MM-DD')), 'CA-E6-15: settlement.deleted');

select is((select string_agg(distinct action, ',' order by action) from public.audit_events),
  'goal_contribution.deleted,goal.status_changed,goal.updated,settlement.created,settlement.deleted,transaction.splits_changed', 'catálogo de ações da Etapa 6');
select is((select count(*)::int from public.audit_events where metadata::text ~* '(SEGREDO|@test\.local)'), 0, 'CA-E6-15: metadata sem nome, descrição, notas ou e-mail');
select is((select count(*)::int from public.audit_events where metadata ?| array['name', 'description', 'notes', 'email', 'display_name', 'user_id', 'member_id']), 0, 'CA-E6-15: sem chaves de pessoa ou texto livre');
select is((select count(*)::int from public.audit_events where actor_user_id is distinct from tests.uid('a')), 0, 'o ator é quem executou');
select tests.logout();

select tests.login_as('m');
select is((select count(*)::int from public.audit_events), 0, 'CA-E6-15: member lê 0 eventos');
select tests.logout();

select * from finish();
rollback;
