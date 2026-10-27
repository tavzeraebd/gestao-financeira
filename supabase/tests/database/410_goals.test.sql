-- CA-E6-04: metas (permissões, transições, constraints).
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

select tests.login_as('m');
select throws_ok($$insert into public.goals (family_id, name, target_amount) values (tests.fid('A'), 'Do membro', 100)$$, '42501', null, 'CA-E6-04: member não cria meta');
select tests.logout();
select tests.login_as('a');
select lives_ok($$insert into public.goals (family_id, name, target_amount, target_date, icon) values (tests.fid('A'), 'Viagem', 5000, '2030-01-01', 'plane')$$, 'CA-E6-04: owner cria meta');
select tests.logout();
select tests.login_as('ad');
select lives_ok($$insert into public.goals (family_id, name, target_amount) values (tests.fid('A'), 'Reserva', 1000)$$, 'CA-E6-04: admin cria meta');
select is((select created_by from public.goals where name = 'Reserva'), tests.uid('ad'), 'CA-E6-04: created_by é o chamador');
select is((select status || '/' || icon from public.goals where name = 'Reserva'), 'active/target', 'CA-E6-04: defaults active e ícone target');
select throws_ok($$insert into public.goals (family_id, name, target_amount, icon) values (tests.fid('A'), 'x', 10, 'rocket')$$, '23514', null, 'CA-E6-04: ícone fora da lista → 23514');
select throws_ok($$insert into public.goals (family_id, name, target_amount) values (tests.fid('A'), 'x', 0)$$, '23514', null, 'CA-E6-04: alvo 0 → 23514');
select throws_ok($$insert into public.goals (family_id, name, target_amount) values (tests.fid('A'), 'x', 'NaN')$$, '23514', null, 'CA-E6-04: alvo NaN → 23514');
select throws_ok($$insert into public.goals (family_id, name, target_amount) values (tests.fid('A'), 'x', 100000000)$$, '23514', null, 'CA-E6-04: alvo acima do teto → 23514');
select lives_ok($$insert into public.goals (family_id, name, target_amount) values (tests.fid('A'), 'No teto', 99999999.99)$$, 'CA-E6-04: alvo no teto aceito');
select throws_ok($$insert into public.goals (family_id, name, target_amount) values (tests.fid('A'), '   ', 10)$$, '23514', null, 'CA-E6-04: nome em branco → 23514');
select throws_ok($$insert into public.goals (family_id, name, target_amount, target_date) values (tests.fid('A'), 'x', 10, '1999-01-01')$$, '23514', null, 'CA-E6-04: data-alvo antes de 2000 → 23514');
select throws_ok($$insert into public.goals (family_id, name, target_amount, completed_at) values (tests.fid('A'), 'x', 10, now())$$, '42501', null, 'CA-E6-04: completed_at fora do grant de insert');
select tests.logout();

select tests.login_as('m');
select is(tests.affected($$update public.goals set name = 'Hack' where name = 'Viagem'$$), 0, 'CA-E6-04: member não altera meta (0 linhas)');
select tests.logout();

select tests.login_as('ad');
select is(tests.affected($$update public.goals set name = 'Viagem dos sonhos', description = 'desc' where name = 'Viagem'$$), 1, 'CA-E6-04: admin edita meta');
select throws_ok($$update public.goals set completed_at = now() where name = 'Reserva'$$, '42501', null, 'CA-E6-04: completed_at fora do grant de update');
select throws_ok($$update public.goals set target_amount = 0 where name = 'Reserva'$$, '23514', null, 'CA-E6-04: alvo 0 na edição → 23514');
-- transições
select lives_ok($$update public.goals set status = 'paused' where name = 'Reserva'$$, 'CA-E6-04: active → paused');
select is((select completed_at from public.goals where name = 'Reserva'), null, 'CA-E6-04: completed_at nulo fora de completed');
select lives_ok($$update public.goals set status = 'active' where name = 'Reserva'$$, 'CA-E6-04: paused → active');
select lives_ok($$update public.goals set status = 'paused' where name = 'Reserva'$$, 'CA-E6-04: active → paused (de novo)');
select lives_ok($$update public.goals set status = 'completed' where name = 'Reserva'$$, 'CA-E6-04: paused → completed');
select isnt((select completed_at from public.goals where name = 'Reserva'), null, 'CA-E6-04: completed_at preenchido pelo banco');
select throws_ok($$update public.goals set name = 'Outro' where name = 'Reserva'$$, 'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E6-04: meta concluída não aceita update nenhum');
select throws_ok($$update public.goals set status = 'active' where name = 'Reserva'$$, 'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E6-04: completed → active inválido');
select lives_ok($$update public.goals set status = 'canceled' where name = 'Viagem dos sonhos'$$, 'CA-E6-04: active → canceled');
select throws_ok($$update public.goals set status = 'active' where name = 'Viagem dos sonhos'$$, 'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E6-04: canceled → active inválido');
select throws_ok($$update public.goals set description = 'x' where name = 'Viagem dos sonhos'$$, 'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E6-04: meta cancelada não aceita update nenhum');
select lives_ok($$update public.goals set status = 'completed' where name = 'No teto'$$, 'CA-E6-04: active → completed');
select tests.logout();
select is((select count(*)::int from public.goals where (status = 'completed') <> (completed_at is not null)), 0, 'CA-E6-04: completed_at preenchido só em completed');

select * from finish();
rollback;
