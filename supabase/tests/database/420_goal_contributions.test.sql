-- CA-E6-05, CA-E6-06, CA-E6-12: aportes, exclusão lógica e goal_summary.
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

insert into public.goals (id, family_id, name, target_amount, created_by) values
  ('90000000-0000-0000-0000-000000000001', tests.fid('A'), 'Viagem', 5000, tests.uid('a')),
  ('90000000-0000-0000-0000-000000000002', tests.fid('A'), 'Pausada', 1000, tests.uid('a')),
  ('90000000-0000-0000-0000-000000000003', tests.fid('A'), 'Concluída', 1000, tests.uid('a')),
  ('90000000-0000-0000-0000-000000000004', tests.fid('A'), 'Vazia', 1000, tests.uid('a'));
update public.goals set status = 'paused' where id = '90000000-0000-0000-0000-000000000002';
update public.goals set status = 'completed' where id = '90000000-0000-0000-0000-000000000003';
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_m', tests.mem('m')::text, true);
select set_config('tests.mem_c', (select id::text from public.family_members where user_id = tests.uid('c')), true);

-- member no próprio nome
select tests.login_as('m');
select lives_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, notes)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('m'), 'deposit', 100, private.today() - 10, 'm100')$$,
  'CA-E6-05: member registra no próprio nome');
select is((select created_by from public.goal_contributions where notes = 'm100'), tests.uid('m'), 'CA-E6-05: created_by é o chamador');
select throws_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', current_setting('tests.mem_a')::uuid, 'deposit', 10, private.today())$$,
  '42501', 'FORBIDDEN', 'CA-E6-05: member com member_id de outro → 42501');
select throws_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, created_by)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('m'), 'deposit', 10, private.today(), tests.uid('a'))$$,
  '42501', null, 'CA-E6-05: created_by no insert → 42501');
select throws_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('m'), 'deposit', 10, private.today() + 1)$$,
  'P0001', 'FUTURE_DATE_NOT_ALLOWED', 'CA-E6-05: data futura');
select throws_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000002', tests.mem('m'), 'deposit', 10, private.today())$$,
  'P0001', 'GOAL_NOT_ACTIVE', 'CA-E6-05: meta pausada');
select throws_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000003', tests.mem('m'), 'deposit', 10, private.today())$$,
  'P0001', 'GOAL_NOT_ACTIVE', 'CA-E6-05: meta concluída');
select throws_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('m'), 'deposit', 0, private.today())$$,
  '23514', null, 'CA-E6-05: valor 0 → 23514');
select tests.logout();

-- owner/admin para qualquer integrante ativo
select tests.login_as('a');
select lives_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, notes)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('a'), 'deposit', 300, private.today() - 5, 'a300')$$,
  'CA-E6-05: owner registra o próprio aporte');
select lives_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, notes)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('m'), 'deposit', 50, private.today() - 4, 'm50-pela-dona')$$,
  'CA-E6-05: owner registra para outro integrante');
select throws_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', current_setting('tests.mem_c')::uuid, 'deposit', 10, private.today())$$,
  'P0001', 'INVALID_INPUT', 'CA-E6-05: integrante inativo → INVALID_INPUT');
-- saldo: 100 + 300 + 50 = 450
select throws_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('a'), 'withdrawal', 450.01, private.today())$$,
  'P0001', 'GOAL_NEGATIVE_PROGRESS', 'CA-E6-05: retirada maior que o acumulado');
select lives_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, notes)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('a'), 'withdrawal', 50, private.today() - 1, 'a-50')$$,
  'CA-E6-05: retirada dentro do acumulado');
select tests.logout();

-- exclusão lógica (acumulado = 100 + 300 + 50 - 50 = 400)
select tests.login_as('m');
select is(tests.affected($$update public.goal_contributions set deleted_at = now() where notes = 'a300'$$), 0, 'CA-E6-06: outro member → 0 linhas');
select throws_ok($$update public.goal_contributions set amount = 1 where notes = 'm100'$$, '42501', null, 'CA-E6-06: update de coluna além de deleted_at → 42501');
select is(tests.affected($$update public.goal_contributions set deleted_at = now() where notes = 'm100'$$), 1, 'CA-E6-06: autor exclui o próprio aporte (400 → 300)');
select is(tests.affected($$update public.goal_contributions set deleted_at = now() where notes = 'm100'$$), 0, 'CA-E6-06: linha excluída não volta (0 linhas)');
select tests.logout();
select tests.login_as('a');
select lives_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, notes)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('a'), 'withdrawal', 250, private.today(), 'a-250')$$, 'retirada de 250 (acumulado 50)');
select throws_ok($$update public.goal_contributions set deleted_at = now() where notes = 'a300'$$, 'P0001', 'GOAL_NEGATIVE_PROGRESS',
  'CA-E6-06: excluir aporte que deixaria o acumulado negativo');
select is(tests.affected($$update public.goal_contributions set deleted_at = now() where notes = 'a-250'$$), 1, 'CA-E6-06: owner exclui a retirada (sempre permitido)');
select is(tests.affected($$update public.goal_contributions set deleted_at = now() where notes = 'm50-pela-dona'$$), 1, 'CA-E6-06: owner exclui aporte de outro integrante');
select is((select count(*)::int from public.goal_contributions where deleted_at is not null and deleted_by = tests.uid('a')), 2, 'CA-E6-06: deleted_by fixado pelo banco');
select tests.logout();
select tests.login_as('ad');
select is(tests.affected($$update public.goal_contributions set deleted_at = now() where notes = 'a-50'$$), 1, 'CA-E6-06: admin exclui');
select tests.logout();

-- CA-E6-12 · goal_summary (restam: a300 ativo; excluídos fora)
select tests.login_as('a');
select lives_ok($$insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, notes)
  values (tests.fid('A'), '90000000-0000-0000-0000-000000000001', tests.mem('a'), 'deposit', 40, private.today() - 200, 'velho40')$$, 'aporte antigo (fora do intervalo)');
select is((select saved from public.goal_summary(private.today() - 89, private.today()) where goal_id = '90000000-0000-0000-0000-000000000001'),
  '340.00', 'CA-E6-12: saved de todas as datas, sem excluídas');
select is((select deposits from public.goal_summary(private.today() - 89, private.today()) where goal_id = '90000000-0000-0000-0000-000000000001'),
  '300.00', 'CA-E6-12: deposits só do intervalo');
select is((select withdrawals from public.goal_summary(private.today() - 89, private.today()) where goal_id = '90000000-0000-0000-0000-000000000001'),
  '0.00', 'CA-E6-12: withdrawals só do intervalo, sem excluídas');
select is((select count(*)::int from public.goal_summary(private.today() - 89, private.today())), 4, 'CA-E6-12: uma linha por meta visível (todos os status)');
select is((select saved from public.goal_summary(private.today(), private.today()) where goal_id = '90000000-0000-0000-0000-000000000004'), '0.00', 'CA-E6-12: meta sem aportes → 0.00');
select throws_ok($$select * from public.goal_summary(null, private.today())$$, 'P0001', 'INVALID_INPUT', 'CA-E6-12: data nula');
select throws_ok($$select * from public.goal_summary(private.today(), private.today() - 1)$$, 'P0001', 'INVALID_INPUT', 'CA-E6-12: p_from > p_to');
select throws_ok($$select * from public.goal_summary(private.today() - 366, private.today())$$, 'P0001', 'INVALID_INPUT', 'CA-E6-12: 367 dias');
select lives_ok($$select * from public.goal_summary(private.today() - 365, private.today())$$, 'CA-E6-12: 366 dias aceitos');
select tests.logout();

select * from finish();
rollback;
