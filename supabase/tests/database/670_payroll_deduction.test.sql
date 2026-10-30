-- Recorrência de despesa "desconto em folha" (payroll_deduction): coluna, check, materialização, projeção de caixa,
-- marcar/desmarcar e grants. Datas relativas a private.today(); horizonte = último dia do mês seguinte.
begin;

select no_plan();

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a9000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2020-01-01', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c9000000-0000-0000-0000-000000000001', tests.fid('A'), 'Empréstimo', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c9000000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-2', 'briefcase', tests.uid('a'));

-- Coluna ---------------------------------------------------------------------------------------------------------
select has_column('public', 'recurrences', 'payroll_deduction', 'payroll_deduction existe');
select col_type_is('public', 'recurrences', 'payroll_deduction', 'boolean', 'payroll_deduction é boolean');
select col_not_null('public', 'recurrences', 'payroll_deduction', 'payroll_deduction é not null');
select col_default_is('public', 'recurrences', 'payroll_deduction', 'false', 'payroll_deduction tem default false');

-- Séries: P (folha, aberta), N (normal), F (folha já encerrada: end_date no passado), I (receita)
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, end_date, payroll_deduction, created_by) values
  ('e9000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001',
   'c9000000-0000-0000-0000-000000000001', 'Empréstimo em folha', 777, 'monthly', private.today(), null, true, tests.uid('a')),
  ('e9000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001',
   'c9000000-0000-0000-0000-000000000001', 'Aluguel normal', 100, 'monthly', private.today(), null, false, tests.uid('a')),
  ('e9000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001',
   'c9000000-0000-0000-0000-000000000001', 'Folha encerrada', 555, 'monthly', private.today() - 60, private.today() - 30, true, tests.uid('a')),
  ('e9000000-0000-0000-0000-000000000004', tests.fid('A'), 'income', 'a9000000-0000-0000-0000-000000000001',
   'c9000000-0000-0000-0000-000000000002', 'Receita', 50, 'monthly', private.today(), null, false, tests.uid('a'));

-- Check: só despesa ----------------------------------------------------------------------------------------------
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date, payroll_deduction, created_by)
  values (tests.fid('A'), 'income', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000002', 'Receita em folha', 10, 'monthly', private.today(), true, tests.uid('a'))$$,
  '23514', null, 'check: receita não pode ter payroll_deduction (insert)');

-- Materialização: a série em folha e a encerrada não geram nada; a normal continua gerando ----------------------------
select tests.login_as('a');
select is((select public.materialize_recurrences()), 4, 'materialize: cria só as de N (2) e da receita (2)');
select is((select count(*)::int from public.transactions where recurrence_id = 'e9000000-0000-0000-0000-000000000001'), 0,
  'materialize: série em folha não gera transação');
select is((select count(*)::int from public.transactions where recurrence_id = 'e9000000-0000-0000-0000-000000000003'), 0,
  'materialize: série em folha encerrada não gera transação');
select is((select count(*)::int from public.transactions where recurrence_id = 'e9000000-0000-0000-0000-000000000002'), 2,
  'materialize: série normal continua gerando');
select is((select next_occurrence_date from public.recurrences where id = 'e9000000-0000-0000-0000-000000000001'),
  private.today(), 'materialize: ponteiro da série em folha não anda');
select is((select public.materialize_recurrences()), 0, 'materialize: segunda chamada devolve 0');

-- Projeção de caixa: só N entra (3ª ocorrência dentro de 3 meses = 100); folha (777) e encerrada (555) ficam fora --------
select is((select sum(recurring_expense::numeric)::text from public.projected_cash_flow(3)), '100.00',
  'projected_cash_flow: séries em folha ignoradas, a normal é projetada');
select is((select sum(recurring_expense::numeric)::text from public.projected_cash_flow(12)), '1000.00',
  'projected_cash_flow(12): normal: ocorrências 3 a 12 (10 x 100); folha fora');

-- "Ativa" no comprometimento = is_active e (sem término ou término >= hoje): a série encerrada não conta, a aberta conta
select is((select array_agg(id::text order by id) from public.recurrences
            where payroll_deduction and is_active and (end_date is null or end_date >= private.today())),
  array['e9000000-0000-0000-0000-000000000001'],
  'série em folha com end_date no passado não é ativa; a sem término é');

-- Grants: inserir e marcar pela API ----------------------------------------------------------------------------------
select lives_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date, payroll_deduction)
  values (tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'Folha via API', 20, 'monthly', private.today(), true)$$,
  'authenticated insere série com payroll_deduction');
select throws_ok($$update public.recurrences set payroll_deduction = true where id = 'e9000000-0000-0000-0000-000000000004'$$,
  '23514', null, 'check: receita não pode ser marcada (update)');

-- Marcar a série normal N: remove as pendentes futuras intocadas e preserva a editada -----------------------------------
update public.transactions set notes = 'negociado' where recurrence_id = 'e9000000-0000-0000-0000-000000000002' and occurrence_date = private.today();
update public.recurrences set payroll_deduction = true where id = 'e9000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.transactions where recurrence_id = 'e9000000-0000-0000-0000-000000000002'), 1,
  'marcar: removeu a pendente intocada e manteve a editada');
select is((select sum(recurring_expense::numeric)::text from public.projected_cash_flow(3)), '0.00',
  'marcar: a série saiu da projeção de caixa');
select tests.logout();
select is((select metadata from public.audit_events where action = 'recurrence.series_updated' and entity_id = 'e9000000-0000-0000-0000-000000000002'),
  '{"changed": ["payroll_deduction"]}'::jsonb, 'marcar: auditado como series_updated (nome da coluna)');

-- Desmarcar: ponteiro volta a hoje e a materialização retoma (a editada de hoje não duplica) ---------------------------
select tests.login_as('a');
update public.recurrences set payroll_deduction = false where id = 'e9000000-0000-0000-0000-000000000002';
select is((select next_occurrence_date from public.recurrences where id = 'e9000000-0000-0000-0000-000000000002'),
  private.today(), 'desmarcar: ponteiro reposicionado na primeira data >= hoje');
select is((select public.materialize_recurrences()), 1, 'desmarcar: materialize recria só a ocorrência que faltava');
select is((select count(*)::int from public.transactions where recurrence_id = 'e9000000-0000-0000-0000-000000000002'), 2,
  'desmarcar: volta a 2 ocorrências sem duplicar');

select * from finish();
rollback;
