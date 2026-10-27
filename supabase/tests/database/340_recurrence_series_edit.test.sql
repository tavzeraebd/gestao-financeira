-- CA-E5-12: propagação de edição de série (ocorrências "intocadas"), pausar/reativar/encerrar, R13, ponteiro,
-- limite de 100 séries ativas e validações do trigger de recurrences. Linhas "intocadas" e "tocadas" são fabricadas como
-- postgres (recurrence_id + occurrence_date arbitrários, longe do horizonte) para não depender do dia do mês.
begin;

select plan(51);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, is_active, created_by) values
  ('a8000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2020-01-01', true, tests.uid('a')),
  ('a8000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2020-01-01', true, tests.uid('a')),
  ('a8000000-0000-0000-0000-000000000003', tests.fid('A'), 'Nova', 'cash', 0, private.today() + 30, true, tests.uid('a')),
  ('a8000000-0000-0000-0000-000000000004', tests.fid('A'), 'Arquivada', 'cash', 0, '2020-01-01', false, tests.uid('a')),
  ('a8000000-0000-0000-0000-000000000005', tests.fid('B'), 'Conta B', 'checking', 0, '2020-01-01', true, tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, archived_at, created_by) values
  ('c8000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', null, tests.uid('a')),
  ('c8000000-0000-0000-0000-000000000002', tests.fid('A'), 'Lazer', 'expense', 'chart-2', 'party-popper', null, tests.uid('a')),
  ('c8000000-0000-0000-0000-000000000003', tests.fid('A'), 'Salário', 'income', 'chart-3', 'briefcase', null, tests.uid('a')),
  ('c8000000-0000-0000-0000-000000000004', tests.fid('A'), 'Velha', 'expense', 'chart-4', 'car', now(), tests.uid('a')),
  ('c8000000-0000-0000-0000-000000000005', tests.fid('B'), 'Mercado B', 'expense', 'chart-1', 'utensils', null, tests.uid('b'));
select set_config('tests.mem_m', (select id::text from public.family_members where user_id = tests.uid('m')), true);
select set_config('tests.mem_ad', (select id::text from public.family_members where user_id = tests.uid('ad')), true);

-- série X (autor a) e suas ocorrências fabricadas
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('e8000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001',
   'c8000000-0000-0000-0000-000000000001', 'Série X', 100, 'monthly', private.today() - 60, tests.uid('a'));

insert into public.transactions (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status, notes,
                                 recurrence_id, occurrence_date, created_by) values
  ('f8000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', null, 'Série X', 100, private.today() + 101, 'pending', null, 'e8000000-0000-0000-0000-000000000001', private.today() + 101, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', null, 'Série X', 100, private.today(), 'paid', null, 'e8000000-0000-0000-0000-000000000001', private.today() + 102, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', null, 'Série X', 100, private.today() + 103, 'pending', null, 'e8000000-0000-0000-0000-000000000001', private.today() + 103, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', null, 'Série X', 100, private.today() + 104, 'pending', null, 'e8000000-0000-0000-0000-000000000001', private.today() + 104, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000005', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', null, 'Série X', 7, private.today() + 105, 'pending', null, 'e8000000-0000-0000-0000-000000000001', private.today() + 105, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000006', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', null, 'Série X', 100, private.today() + 107, 'pending', null, 'e8000000-0000-0000-0000-000000000001', private.today() + 106, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000007', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', null, 'Série X', 100, private.today() + 107, 'pending', 'com nota', 'e8000000-0000-0000-0000-000000000001', private.today() + 107, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000008', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', null, 'Outra descrição', 100, private.today() + 108, 'pending', null, 'e8000000-0000-0000-0000-000000000001', private.today() + 108, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000009', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000002', 'c8000000-0000-0000-0000-000000000001', null, 'Série X', 100, private.today() + 109, 'pending', null, 'e8000000-0000-0000-0000-000000000001', private.today() + 109, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000010', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', current_setting('tests.mem_m')::uuid, 'Série X', 100, private.today() + 110, 'pending', null, 'e8000000-0000-0000-0000-000000000001', private.today() + 110, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000011', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', null, 'Série X', 100, private.today() - 5, 'pending', null, 'e8000000-0000-0000-0000-000000000001', private.today() - 5, tests.uid('a'));
-- f..03 será cancelada e f..04 excluída (como owner, abaixo)
select tests.login_as('a');
select public.cancel_pending_transaction('f8000000-0000-0000-0000-000000000003');
update public.transactions set deleted_at = now() where id = 'f8000000-0000-0000-0000-000000000004';

-- 1 · valor: só a intocada muda --------------------------------------------------------------------------------------------
update public.recurrences set amount = 150 where id = 'e8000000-0000-0000-0000-000000000001';
select is((select amount from public.transactions where id = 'f8000000-0000-0000-0000-000000000001'), 150.00, 'CA-E5-12: editar o valor atualiza a ocorrência intocada');
select is((select count(*)::int from public.transactions where recurrence_id = 'e8000000-0000-0000-0000-000000000001' and amount = 100), 9,
  'CA-E5-12: passada, paga, cancelada, excluída e editadas (data, nota, descrição, conta, responsável) ficam com 100');
select is((select amount from public.transactions where id = 'f8000000-0000-0000-0000-000000000005'), 7.00, 'CA-E5-12: a de valor editado fica com 7');
select is((select metadata from public.audit_events where action = 'transaction.updated' and entity_id = 'f8000000-0000-0000-0000-000000000001'),
  jsonb_build_object('changed', jsonb_build_array('amount'), 'old', jsonb_build_object('amount', '100.00'), 'new', jsonb_build_object('amount', '150.00')),
  'CA-E5-12: a propagação audita transaction.updated na ocorrência');
select is((select metadata from public.audit_events where action = 'recurrence.series_updated' and entity_id = 'e8000000-0000-0000-0000-000000000001'),
  '{"changed": ["amount"]}'::jsonb, 'CA-E5-12: recurrence.series_updated com os nomes das colunas');

-- 2 · descrição, conta, categoria e responsável -------------------------------------------------------------------------------
update public.recurrences set description = 'Série Y' where id = 'e8000000-0000-0000-0000-000000000001';
select is((select description from public.transactions where id = 'f8000000-0000-0000-0000-000000000001'), 'Série Y', 'CA-E5-12: descrição propagada');
select is((select count(*)::int from public.transactions where recurrence_id = 'e8000000-0000-0000-0000-000000000001' and description = 'Série Y'), 1,
  'CA-E5-12: só a intocada recebeu a descrição');
update public.recurrences set account_id = 'a8000000-0000-0000-0000-000000000002', category_id = 'c8000000-0000-0000-0000-000000000002',
  assigned_member_id = current_setting('tests.mem_m')::uuid where id = 'e8000000-0000-0000-0000-000000000001';
select results_eq($$select account_id, category_id, assigned_member_id from public.transactions where id = 'f8000000-0000-0000-0000-000000000001'$$,
  $$select 'a8000000-0000-0000-0000-000000000002'::uuid, 'c8000000-0000-0000-0000-000000000002'::uuid, current_setting('tests.mem_m')::uuid$$,
  'CA-E5-12: conta, categoria e responsável propagados à intocada');
select is((select count(*)::int from public.audit_events where action = 'recurrence.series_updated' and entity_id = 'e8000000-0000-0000-0000-000000000001'
            and metadata = '{"changed": ["account_id", "category_id", "assigned_member_id"]}'::jsonb), 1,
  'CA-E5-12: series_updated lista account_id, category_id e assigned_member_id');
select is((select count(*)::int from public.transactions where recurrence_id = 'e8000000-0000-0000-0000-000000000001' and category_id = 'c8000000-0000-0000-0000-000000000002'), 1,
  'CA-E5-12: nenhuma outra ocorrência mudou de categoria');

-- 3 · término: remove as intocadas depois dele ---------------------------------------------------------------------------------
select tests.logout();
insert into public.transactions (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status,
                                 recurrence_id, occurrence_date, created_by) values
  ('f8000000-0000-0000-0000-000000000012', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000002', 'c8000000-0000-0000-0000-000000000002', current_setting('tests.mem_m')::uuid, 'Série Y', 150, private.today() + 120, 'pending', 'e8000000-0000-0000-0000-000000000001', private.today() + 120, tests.uid('a')),
  ('f8000000-0000-0000-0000-000000000013', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000002', 'c8000000-0000-0000-0000-000000000002', current_setting('tests.mem_m')::uuid, 'Série Y', 150, private.today() + 121, 'pending', 'e8000000-0000-0000-0000-000000000001', private.today() + 121, tests.uid('a'));
select tests.login_as('a');
update public.recurrences set end_date = private.today() + 104 where id = 'e8000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.transactions where id in ('f8000000-0000-0000-0000-000000000012', 'f8000000-0000-0000-0000-000000000013')), 0,
  'CA-E5-12: end_date remove as intocadas depois do término');
select is((select count(*)::int from public.transactions where id in ('f8000000-0000-0000-0000-000000000001', 'f8000000-0000-0000-0000-000000000006', 'f8000000-0000-0000-0000-000000000007')), 3,
  'CA-E5-12: a intocada até o término e as editadas depois dele ficam');
select is((select count(*)::int from public.audit_events where action = 'recurrence.series_updated' and entity_id = 'e8000000-0000-0000-0000-000000000001'
            and metadata = '{"changed": ["end_date"]}'::jsonb), 1, 'CA-E5-12: series_updated {end_date}');

-- 4 · pausar remove as intocadas com data >= hoje; reativar recalcula o ponteiro --------------------------------------------------------
update public.recurrences set is_active = false where id = 'e8000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.transactions where id = 'f8000000-0000-0000-0000-000000000001'), 0, 'CA-E5-12: pausar remove a intocada');
select is((select count(*)::int from public.transactions where recurrence_id = 'e8000000-0000-0000-0000-000000000001'), 10,
  'CA-E5-12: pausar mantém passada, paga, cancelada, excluída e editadas (10 linhas)');
select is((select count(*)::int from public.audit_events where action = 'recurrence.paused' and entity_id = 'e8000000-0000-0000-0000-000000000001'), 1, 'CA-E5-12: recurrence.paused');
update public.recurrences set is_active = true where id = 'e8000000-0000-0000-0000-000000000001';
select is((select next_occurrence_date from public.recurrences where id = 'e8000000-0000-0000-0000-000000000001'),
  private.recurrence_next_on_or_after(private.today() - 60, 'monthly', 1::smallint, private.today()), 'CA-E5-12: reativar coloca o ponteiro na primeira data >= hoje');
select is((select count(*)::int from public.audit_events where action = 'recurrence.resumed' and entity_id = 'e8000000-0000-0000-0000-000000000001'), 1, 'CA-E5-12: recurrence.resumed');
select is((select metadata from public.audit_events where action = 'recurrence.paused' and entity_id = 'e8000000-0000-0000-0000-000000000001'), '{}'::jsonb,
  'CA-E5-12: paused sem metadata');

-- 5 · mudança de end_date move o ponteiro: least(antigo, primeira data >= hoje) -----------------------------------------------------------------
update public.recurrences set end_date = private.today() + 400 where id = 'e8000000-0000-0000-0000-000000000001';
select is((select next_occurrence_date from public.recurrences where id = 'e8000000-0000-0000-0000-000000000001'),
  private.recurrence_next_on_or_after(private.today() - 60, 'monthly', 1::smallint, private.today()),
  'CA-E5-12: end_date estendido: ponteiro = least(antigo, primeira data >= hoje) = primeira data >= hoje');
select tests.logout();
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('e8000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001',
   'c8000000-0000-0000-0000-000000000001', 'Ponteiro', 10, 'monthly', private.today() - 60, tests.uid('a'));
select is((select next_occurrence_date from public.recurrences where id = 'e8000000-0000-0000-0000-000000000002'), private.today() - 60,
  'CA-E5-12: insert → ponteiro = start_date');
update public.recurrences set next_occurrence_date = private.today() + 500 where id = 'e8000000-0000-0000-0000-000000000002';
select tests.login_as('a');
update public.recurrences set end_date = private.today() + 700 where id = 'e8000000-0000-0000-0000-000000000002';
select is((select next_occurrence_date from public.recurrences where id = 'e8000000-0000-0000-0000-000000000002'),
  private.recurrence_next_on_or_after(private.today() - 60, 'monthly', 1::smallint, private.today()),
  'CA-E5-12: ponteiro à frente + end_date alterado → recua para a primeira data >= hoje');

-- 6 · R13 · série mensal de 1.200,00 iniciada há dois meses -----------------------------------------------------------------------------------
select tests.logout();
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('e8000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001',
   'c8000000-0000-0000-0000-000000000001', 'R13', 1200, 'monthly', (private.today() - interval '2 months')::date, tests.uid('a'));
select tests.login_as('a');
select public.materialize_recurrences();
select is((select count(*)::int from public.transactions where recurrence_id = 'e8000000-0000-0000-0000-000000000003'), 4, 'R13: 4 ocorrências (-2, -1, este mês, próximo mês)');
select is((select public.materialize_recurrences()), 0, 'R13: a segunda chamada devolve 0');
select is((select count(*)::int from public.transactions where recurrence_id = 'e8000000-0000-0000-0000-000000000003' and transaction_date < private.today()),
  (select count(*)::int from generate_series(0, 3) n where private.recurrence_occurrence((private.today() - interval '2 months')::date, 'monthly', 1::smallint, n) < private.today()),
  'R13: as ocorrências anteriores a hoje estão vencidas (pendentes com data < hoje)');
update public.recurrences set is_active = false where id = 'e8000000-0000-0000-0000-000000000003';
select is((select count(*)::int from public.transactions where recurrence_id = 'e8000000-0000-0000-0000-000000000003'),
  (select count(*)::int from generate_series(0, 3) n where private.recurrence_occurrence((private.today() - interval '2 months')::date, 'monthly', 1::smallint, n) < private.today()),
  'R13: pausar remove as intocadas com data >= hoje; ficam só as vencidas');
select public.materialize_recurrences();
select is((select count(*)::int from public.transactions where recurrence_id = 'e8000000-0000-0000-0000-000000000003' and transaction_date >= private.today()), 0,
  'R13: série pausada não materializa');
update public.recurrences set is_active = true where id = 'e8000000-0000-0000-0000-000000000003';
select public.materialize_recurrences();
select is((select count(*)::int from public.transactions where recurrence_id = 'e8000000-0000-0000-0000-000000000003'), 4,
  'R13: reativar recria as de data >= hoje, sem duplicar as vencidas');

-- 7 · edição de série de member propaga como o autor da série ------------------------------------------------------------------------------------------
select tests.logout();
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('e8000000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001',
   'c8000000-0000-0000-0000-000000000001', 'Do membro', 30, 'monthly', private.today() + 500, tests.uid('m'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status, recurrence_id, occurrence_date, created_by) values
  ('f8000000-0000-0000-0000-000000000020', tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001',
   'Do membro', 30, private.today() + 130, 'pending', 'e8000000-0000-0000-0000-000000000004', private.today() + 130, tests.uid('m'));
select tests.login_as('m');
select is(tests.affected($$update public.recurrences set amount = 35 where id = 'e8000000-0000-0000-0000-000000000004'$$), 1, 'CA-E5-12: member edita a própria série');
select is((select amount from public.transactions where id = 'f8000000-0000-0000-0000-000000000020'), 35.00, 'CA-E5-12: a propagação (definer) atualiza a ocorrência da série do member');
select is((select count(*)::int from public.audit_events where action = 'recurrence.series_updated' and entity_id = 'e8000000-0000-0000-0000-000000000004'), 0,
  'CA-E5-12: member não lê auditoria (0 eventos visíveis)');
select tests.logout();
select is((select actor_user_id from public.audit_events where action = 'recurrence.series_updated' and entity_id = 'e8000000-0000-0000-0000-000000000004'), tests.uid('m'),
  'CA-E5-12: o ator da auditoria é quem editou');

-- 8 · validações do trigger de recurrences ---------------------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'Antes do saldo', 1, 'monthly', '2019-12-31')$$,
  'P0001', 'DATE_BEFORE_OPENING_BALANCE', 'CA-E5-12: start_date antes do saldo inicial → DATE_BEFORE_OPENING_BALANCE');
select throws_ok($$update public.recurrences set account_id = 'a8000000-0000-0000-0000-000000000003' where id = 'e8000000-0000-0000-0000-000000000002'$$,
  'P0001', 'DATE_BEFORE_OPENING_BALANCE', 'CA-E5-12: trocar para conta cujo saldo inicial é futuro → DATE_BEFORE_OPENING_BALANCE (usa greatest(início, hoje))');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000003', 'Tipo errado', 1, 'monthly', private.today())$$,
  'P0001', 'CATEGORY_TYPE_MISMATCH', 'CA-E5-12: categoria de outro tipo → CATEGORY_TYPE_MISMATCH');
select throws_ok($$update public.recurrences set category_id = 'c8000000-0000-0000-0000-000000000003' where id = 'e8000000-0000-0000-0000-000000000002'$$,
  'P0001', 'CATEGORY_TYPE_MISMATCH', 'CA-E5-12: trocar para categoria de outro tipo → CATEGORY_TYPE_MISMATCH');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000004', 'Categoria arquivada', 1, 'monthly', private.today())$$,
  'P0001', 'CATEGORY_ARCHIVED', 'CA-E5-12: categoria arquivada → CATEGORY_ARCHIVED');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000004', 'c8000000-0000-0000-0000-000000000001', 'Conta arquivada', 1, 'monthly', private.today())$$,
  'P0001', 'ACCOUNT_ARCHIVED', 'CA-E5-12: conta arquivada → ACCOUNT_ARCHIVED');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'income', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'Receita em categoria de despesa', 1, 'monthly', private.today())$$,
  'P0001', 'CATEGORY_TYPE_MISMATCH', 'CA-E5-12: série de receita com categoria de despesa → CATEGORY_TYPE_MISMATCH');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date, end_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'Término antes', 1, 'monthly', private.today(), private.today() - 1)$$,
  '23514', null, 'end_date antes de start_date → 23514');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, interval_count, start_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'Intervalo', 1, 'monthly', 13, private.today())$$,
  '23514', null, 'interval_count 13 → 23514');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'Acima do teto', 100000000, 'monthly', private.today())$$,
  '23514', null, 'amount acima do teto → 23514');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'NaN', 'NaN', 'monthly', private.today())$$,
  '23514', null, 'amount NaN → 23514');
-- responsável inativo (insert) e reativação com conta arquivada
select tests.logout();
update public.family_members set status = 'removed', ended_at = now() where user_id = tests.uid('ad');
select tests.login_as('a');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, assigned_member_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', current_setting('tests.mem_ad')::uuid, 'Responsável inativo', 1, 'monthly', private.today())$$,
  'P0001', 'INVALID_INPUT', 'CA-E5-12: responsável com vínculo inativo → INVALID_INPUT');
update public.recurrences set is_active = false where id = 'e8000000-0000-0000-0000-000000000002';
select tests.logout();
update public.accounts set is_active = false where id = 'a8000000-0000-0000-0000-000000000001';
select tests.login_as('a');
select throws_ok($$update public.recurrences set is_active = true where id = 'e8000000-0000-0000-0000-000000000002'$$,
  'P0001', 'ACCOUNT_ARCHIVED', 'CA-E5-12: reativar série com conta arquivada → ACCOUNT_ARCHIVED');
select tests.logout();
update public.accounts set is_active = true where id = 'a8000000-0000-0000-0000-000000000001';
update public.categories set archived_at = now() where id = 'c8000000-0000-0000-0000-000000000001';
select tests.login_as('a');
select throws_ok($$update public.recurrences set is_active = true where id = 'e8000000-0000-0000-0000-000000000002'$$,
  'P0001', 'CATEGORY_ARCHIVED', 'CA-E5-12: reativar série com categoria arquivada → CATEGORY_ARCHIVED');
select tests.logout();
update public.categories set archived_at = null where id = 'c8000000-0000-0000-0000-000000000001';

-- 9 · limite de 100 séries ativas por família ---------------------------------------------------------------------------------------------------------------------
insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by)
select tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'Lote ' || n, 1, 'monthly',
       private.today() + 500, tests.uid('a')
from generate_series(1, 100 - (select count(*)::int from public.recurrences where family_id = tests.fid('A') and is_active)) n;
select is((select count(*)::int from public.recurrences where family_id = tests.fid('A') and is_active), 100, 'família A com exatamente 100 séries ativas');
select tests.login_as('a');
select throws_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'A 101ª', 1, 'monthly', private.today())$$,
  'P0001', 'RECURRENCE_LIMIT_REACHED', 'CA-E5-12: a 101ª série ativa → RECURRENCE_LIMIT_REACHED');
select tests.login_as('b');
select lives_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('B'), 'expense', 'a8000000-0000-0000-0000-000000000005', 'c8000000-0000-0000-0000-000000000005', 'Série de B', 1, 'monthly', private.today() + 400)$$,
  'CA-E5-12: o limite é por família (B segue criando)');
select tests.login_as('a');
update public.recurrences set is_active = false where id = 'e8000000-0000-0000-0000-000000000001';
select lives_ok($$insert into public.recurrences (family_id, type, account_id, category_id, description, amount, frequency, start_date)
  values (tests.fid('A'), 'expense', 'a8000000-0000-0000-0000-000000000001', 'c8000000-0000-0000-0000-000000000001', 'Ocupa a vaga', 1, 'monthly', private.today() + 400)$$,
  'CA-E5-12: pausar libera uma vaga');
select throws_ok($$update public.recurrences set is_active = true where id = 'e8000000-0000-0000-0000-000000000001'$$,
  'P0001', 'RECURRENCE_LIMIT_REACHED', 'CA-E5-12: reativar também respeita o limite');

select * from finish();
rollback;
