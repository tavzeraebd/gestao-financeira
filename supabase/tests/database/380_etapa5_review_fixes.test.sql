-- Correções pós-revisão da Etapa 5: autor ex-integrante, início da série (12 meses), backoff de falha, reativar + end_date.
begin;

select plan(13);

select tests.setup_world();
select tests.create_user('x', 'Xavier Ex');

insert into public.family_members (family_id, user_id, role) values (tests.fid('A'), tests.uid('x'), 'member');
insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, is_active, created_by) values
  ('a9000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2020-01-01', true, tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, archived_at, created_by) values
  ('c9000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', null, tests.uid('a'));

-- séries futuras (fora do horizonte) e lançamentos: m = autor ativo, x = autor que sairá
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('e9000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'S ativo', 10, 'monthly', private.today() + 400, tests.uid('m')),
  ('e9000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'S ex', 10, 'monthly', private.today() + 400, tests.uid('x'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by) values
  ('f9000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'T ativo', 10, private.today(), 'pending', tests.uid('m')),
  ('f9000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'T ex', 10, private.today(), 'pending', tests.uid('x'));
update public.family_members set status = 'removed', ended_at = now() where user_id = tests.uid('x');

-- 1 · autor ex-integrante ---------------------------------------------------------------------------------------------------
select tests.login_as('x');
select is(tests.affected($$update public.recurrences set description = 'hack' where id = 'e9000000-0000-0000-0000-000000000002'$$), 0,
  'ex-integrante não edita a série que criou');
select is(tests.affected($$update public.transactions set description = 'hack' where id = 'f9000000-0000-0000-0000-000000000002'$$), 0,
  'ex-integrante não edita o lançamento que criou');
select tests.login_as('m');
select is(tests.affected($$update public.recurrences set description = 'ok' where id = 'e9000000-0000-0000-0000-000000000001'$$), 1,
  'integrante ativo autor edita a própria série');
select is(tests.affected($$update public.transactions set description = 'ok' where id = 'f9000000-0000-0000-0000-000000000001'$$), 1,
  'integrante ativo autor edita o próprio lançamento');
select tests.logout();
select is((select description from public.recurrences where id = 'e9000000-0000-0000-0000-000000000002'), 'S ex', 'a série do ex-integrante ficou intacta');

-- 2 · início da série -------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'Antiga', 10, 'monthly',
  (private.today() - interval '12 months' - interval '1 day')::date)$$,
  'P0001', 'INVALID_INPUT', 'início há mais de 12 meses é rejeitado');
select lives_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'No limite', 10, 'monthly',
  (private.today() - interval '12 months')::date)$$, 'início exatamente há 12 meses é aceito');
select tests.logout();
-- a série no limite não entra na materialização abaixo: pausada
update public.recurrences set is_active = false where description = 'No limite';

-- 3 · backoff de falha ------------------------------------------------------------------------------------------------------
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by,
                                last_failure_code, last_failure_at) values
  ('e9000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001',
   'Falha recente', 10, 'monthly', private.today(), tests.uid('a'), 'ACCOUNT_ARCHIVED', now() - interval '10 minutes');
select tests.login_as('a');
select is((select public.materialize_recurrences()), 0, 'série com falha há menos de 1 hora é pulada');
select is((select count(*)::int from public.transactions where recurrence_id = 'e9000000-0000-0000-0000-000000000003'), 0, 'nada foi criado para ela');
select tests.logout();
update public.recurrences set last_failure_at = now() - interval '2 hours' where id = 'e9000000-0000-0000-0000-000000000003';
select tests.login_as('a');
select ok((select public.materialize_recurrences()) >= 1, 'com a falha antiga (> 1 hora) a série é tentada de novo');
select ok((select last_failure_code is null from public.recurrences where id = 'e9000000-0000-0000-0000-000000000003'), 'e o sucesso limpa a falha');
select tests.logout();

-- 9 · reativar + mudar end_date no mesmo UPDATE -----------------------------------------------------------------------------
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('e9000000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001',
   'Reativar', 10, 'monthly', private.today() - 100, tests.uid('a'));
update public.recurrences set is_active = false where id = 'e9000000-0000-0000-0000-000000000004';
update public.recurrences set next_occurrence_date = start_date where id = 'e9000000-0000-0000-0000-000000000004';
select tests.login_as('a');
update public.recurrences set is_active = true, end_date = private.today() + 200 where id = 'e9000000-0000-0000-0000-000000000004';
select tests.logout();
select is((select next_occurrence_date from public.recurrences where id = 'e9000000-0000-0000-0000-000000000004'),
  private.recurrence_next_on_or_after(private.today() - 100, 'monthly', 1::smallint, private.today()),
  'reativar + end_date: ponteiro = primeira ocorrência >= hoje, sem atrasados');
select ok((select next_occurrence_date >= private.today() from public.recurrences where id = 'e9000000-0000-0000-0000-000000000004'),
  'o ponteiro não recuou para o período pausado');

select * from finish();
rollback;
