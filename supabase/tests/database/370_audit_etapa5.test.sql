-- CA-E5-16: auditoria da Etapa 5 (transaction.paid, transaction.canceled, recurrence.*), metadata mínima e leitura restrita.
begin;

select plan(13);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('ab000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2020-01-01', tests.uid('a')),
  ('ab000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2020-01-01', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('cb000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, notes, amount, transaction_date, status, created_by) values
  ('fb000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'ab000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'SEGREDO-DESC', 'SEGREDO-NOTAS', 80, private.today() - 1, 'pending', tests.uid('a')),
  ('fb000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'ab000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'SEGREDO-DESC2', null, 30, private.today() + 2, 'pending', tests.uid('a')),
  ('fb000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'ab000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'SEGREDO-DESC3', null, 15, private.today() + 3, 'pending', tests.uid('a'));
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('eb000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'ab000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'SEGREDO-SERIE', 10, 'monthly', private.today() + 60, tests.uid('a'));

select tests.login_as('a');
select public.pay_pending_transaction('fb000000-0000-0000-0000-000000000001', private.today(), 85, 'ab000000-0000-0000-0000-000000000002');
select is((select metadata from public.audit_events where action = 'transaction.paid' and entity_id = 'fb000000-0000-0000-0000-000000000001'),
  jsonb_build_object('amount', '85.00', 'transaction_date', to_char(private.today(), 'YYYY-MM-DD'), 'due_date', to_char(private.today() - 1, 'YYYY-MM-DD'),
                     'changed', jsonb_build_array('amount', 'account_id'),
                     'old', jsonb_build_object('amount', '80.00', 'account_id', 'ab000000-0000-0000-0000-000000000001')),
  'CA-E5-16: transaction.paid com amount, datas, changed e old');
select public.pay_pending_transaction('fb000000-0000-0000-0000-000000000002', private.today(), 30, 'ab000000-0000-0000-0000-000000000001');
select is((select metadata from public.audit_events where action = 'transaction.paid' and entity_id = 'fb000000-0000-0000-0000-000000000002') -> 'changed',
  '[]'::jsonb, 'CA-E5-16: pagamento sem ajuste → changed vazio');
select is((select count(*)::int from public.audit_events where action = 'transaction.updated'), 0, 'CA-E5-16: pagar não gera transaction.updated');
select public.cancel_pending_transaction('fb000000-0000-0000-0000-000000000003');
select is((select metadata from public.audit_events where action = 'transaction.canceled' and entity_id = 'fb000000-0000-0000-0000-000000000003'),
  jsonb_build_object('type', 'expense', 'amount', '15.00', 'transaction_date', to_char(private.today() + 3, 'YYYY-MM-DD')), 'CA-E5-16: transaction.canceled');
update public.recurrences set is_active = false where id = 'eb000000-0000-0000-0000-000000000001';
update public.recurrences set is_active = true, description = 'SEGREDO-NOVA', amount = 12 where id = 'eb000000-0000-0000-0000-000000000001';
select is((select metadata from public.audit_events where action = 'recurrence.paused'), '{}'::jsonb, 'CA-E5-16: recurrence.paused {}');
select is((select metadata from public.audit_events where action = 'recurrence.resumed'), '{}'::jsonb, 'CA-E5-16: recurrence.resumed {}');
select is((select metadata from public.audit_events where action = 'recurrence.series_updated'), '{"changed": ["amount", "description"]}'::jsonb,
  'CA-E5-16: recurrence.series_updated lista só nomes de coluna');
select is((select string_agg(distinct action, ',' order by action) from public.audit_events),
  'recurrence.paused,recurrence.resumed,recurrence.series_updated,transaction.canceled,transaction.paid', 'catálogo de ações da Etapa 5');
select is((select count(*)::int from public.audit_events where metadata::text ~* '(SEGREDO|@test\.local)'), 0, 'CA-E5-16: metadata sem descrição, notas ou e-mail');
select is((select count(*)::int from public.audit_events where metadata ?| array['description', 'notes', 'email', 'name', 'display_name']), 0, 'CA-E5-16: sem chaves description/notes/email/name');
select is((select count(*)::int from public.audit_events where actor_user_id is distinct from tests.uid('a')), 0, 'CA-E5-16: o ator é quem executou');
select tests.login_as('m');
select is((select count(*)::int from public.audit_events), 0, 'CA-E5-16: member lê 0 eventos');
select tests.login_as('b');
select is((select count(*)::int from public.audit_events where family_id = tests.fid('A')), 0, 'CA-E5-16: B não lê eventos de A');

select * from finish();
rollback;
