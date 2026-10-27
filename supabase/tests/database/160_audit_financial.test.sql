-- CA-E3-15: auditoria financeira (transaction.*, account.*, category.archived), metadata mínima e leitura só por owner/admin.
begin;

select plan(25);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 100, '2026-01-01', tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2026-01-01', tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000003', tests.fid('A'), 'Carteira', 'cash', 0, '2026-01-01', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000005', tests.fid('A'), 'Lazer', 'expense', 'chart-2', 'party-popper', tests.uid('a'));
insert into public.transactions (id, family_id, type, account_id, destination_account_id, category_id, description, notes, amount, transaction_date, created_by) values
  ('f1000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', null,
   'c1000000-0000-0000-0000-000000000001', 'SEGREDO-DESC', 'SEGREDO-NOTAS', 100, '2026-03-10', tests.uid('a')),
  ('f1000000-0000-0000-0000-000000000002', tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
   null, 'SEGREDO-TRANSF', null, 20, '2026-03-10', tests.uid('a')),
  ('f1000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', null,
   'c1000000-0000-0000-0000-000000000001', 'SEGREDO-ESTORNO', null, 40, '2026-03-10', tests.uid('a')),
  ('f1000000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', null,
   'c1000000-0000-0000-0000-000000000001', 'SEGREDO-EXCLUIR', null, 15.5, '2026-03-11', tests.uid('a'));

select tests.login_as('a');

-- transaction.updated -------------------------------------------------------------------------------------------------------------
update public.transactions set amount = 250.50, transaction_date = '2026-03-12' where id = 'f1000000-0000-0000-0000-000000000001';
select is((select metadata from public.audit_events where action = 'transaction.updated' and entity_id = 'f1000000-0000-0000-0000-000000000001'),
  '{"changed": ["amount", "transaction_date"], "old": {"amount": "100.00", "transaction_date": "2026-03-10"}, "new": {"amount": "250.50", "transaction_date": "2026-03-12"}}'::jsonb,
  'CA-E3-15: transaction.updated com changed/old/new só dos campos alterados, valores em text');
update public.transactions set description = 'SEGREDO-NOVA', notes = 'SEGREDO-OUTRA', assigned_member_id = null where id = 'f1000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.audit_events where action = 'transaction.updated' and entity_id = 'f1000000-0000-0000-0000-000000000001'), 1,
  'CA-E3-15: editar descrição/notas/responsável não gera evento');
update public.transactions set account_id = 'a1000000-0000-0000-0000-000000000003', category_id = 'c1000000-0000-0000-0000-000000000005'
  where id = 'f1000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.audit_events where action = 'transaction.updated' and entity_id = 'f1000000-0000-0000-0000-000000000001'), 2,
  'CA-E3-15: segundo transaction.updated (conta e categoria)');
select is((select count(*)::int from public.audit_events where action = 'transaction.updated' and entity_id = 'f1000000-0000-0000-0000-000000000001'
              and metadata -> 'changed' = '["account_id", "category_id"]'::jsonb
              and metadata -> 'new' ->> 'account_id' = 'a1000000-0000-0000-0000-000000000003'
              and metadata -> 'old' ->> 'category_id' = 'c1000000-0000-0000-0000-000000000001'), 1,
  'CA-E3-15: old/new de conta e categoria com ids');
update public.transactions set destination_account_id = 'a1000000-0000-0000-0000-000000000003' where id = 'f1000000-0000-0000-0000-000000000002';
select is((select metadata -> 'changed' from public.audit_events where action = 'transaction.updated' and entity_id = 'f1000000-0000-0000-0000-000000000002'),
  '["destination_account_id"]'::jsonb, 'CA-E3-15: mudança de destino da transferência');

-- transaction.reversed (entity = original) ---------------------------------------------------------------------------------------------
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
        'SEGREDO-ESTORNO-DESC', 10, '2026-03-15', 'f1000000-0000-0000-0000-000000000003');
select is((select metadata - 'reversal_id' from public.audit_events where action = 'transaction.reversed' and entity_id = 'f1000000-0000-0000-0000-000000000003'),
  '{"amount": "10.00", "transaction_date": "2026-03-15"}'::jsonb, 'CA-E3-15: transaction.reversed na entidade original');
select is((select (metadata ->> 'reversal_id')::uuid from public.audit_events where action = 'transaction.reversed' and entity_id = 'f1000000-0000-0000-0000-000000000003'),
  (select id from public.transactions where description = 'SEGREDO-ESTORNO-DESC'), 'reversal_id aponta para o estorno');

-- transaction.deleted ------------------------------------------------------------------------------------------------------------------
update public.transactions set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000004';
select is((select metadata from public.audit_events where action = 'transaction.deleted' and entity_id = 'f1000000-0000-0000-0000-000000000004'),
  '{"type": "expense", "amount": "15.50", "transaction_date": "2026-03-11"}'::jsonb, 'CA-E3-15: transaction.deleted');
select is((select count(*)::int from public.audit_events where entity_id = 'f1000000-0000-0000-0000-000000000004' and action = 'transaction.updated'), 0,
  'exclusão lógica não gera transaction.updated');

-- account.* ---------------------------------------------------------------------------------------------------------------------------------
update public.accounts set opening_balance = 250.75, opening_balance_date = '2025-12-01' where id = 'a1000000-0000-0000-0000-000000000001';
select is((select metadata from public.audit_events where action = 'account.opening_balance_changed' and entity_id = 'a1000000-0000-0000-0000-000000000001'),
  '{"old": {"amount": "100.00", "date": "2026-01-01"}, "new": {"amount": "250.75", "date": "2025-12-01"}}'::jsonb,
  'CA-E3-15: account.opening_balance_changed');
update public.accounts set name = 'Corrente renomeada', institution_name = 'Banco Secreto' where id = 'a1000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.audit_events where entity_type = 'account' and entity_id = 'a1000000-0000-0000-0000-000000000001'), 1,
  'renomear conta não gera evento');
update public.accounts set is_active = false where id = 'a1000000-0000-0000-0000-000000000002';
select is((select metadata from public.audit_events where action = 'account.archived' and entity_id = 'a1000000-0000-0000-0000-000000000002'),
  '{}'::jsonb, 'CA-E3-15: account.archived');
update public.accounts set is_active = true where id = 'a1000000-0000-0000-0000-000000000002';
select is((select metadata from public.audit_events where action = 'account.reactivated' and entity_id = 'a1000000-0000-0000-0000-000000000002'),
  '{}'::jsonb, 'CA-E3-15: account.reactivated');

-- category.archived ---------------------------------------------------------------------------------------------------------------------------
update public.categories set name = 'Lazer e cultura' where id = 'c1000000-0000-0000-0000-000000000005';
select is((select count(*)::int from public.audit_events where entity_type = 'category'), 0, 'renomear categoria não gera evento');
update public.categories set archived_at = now() where id = 'c1000000-0000-0000-0000-000000000005';
select is((select metadata from public.audit_events where action = 'category.archived' and entity_id = 'c1000000-0000-0000-0000-000000000005'),
  '{}'::jsonb, 'CA-E3-15: category.archived');

-- conteúdo e permissões ---------------------------------------------------------------------------------------------------------------------------
select is((select string_agg(distinct action, ',' order by action) from public.audit_events),
  'account.archived,account.opening_balance_changed,account.reactivated,category.archived,transaction.deleted,transaction.reversed,transaction.updated',
  'catálogo de ações financeiras da Etapa 3');
select is((select count(*)::int from public.audit_events
            where metadata::text ~* '(SEGREDO|Banco Secreto|Corrente renomeada|@test\.local)'), 0,
  'CA-E3-15: metadata sem descrição, notas, nome, instituição nem e-mail');
select is((select count(*)::int from public.audit_events where metadata ?| array['description', 'notes', 'email', 'name', 'display_name', 'institution_name']), 0,
  'CA-E3-15: metadata sem chaves description/notes/email/name');
select is((select count(*)::int from public.audit_events where actor_user_id is distinct from tests.uid('a')), 0,
  'o ator de todo evento é quem executou');
select ok((select bool_and(entity_id is not null) from public.audit_events), 'todo evento tem entidade');
select tests.login_as('ad');
select cmp_ok((select count(*)::int from public.audit_events), '>=', 9, 'CA-E3-15: admin lê os eventos');
select tests.login_as('m');
select is((select count(*)::int from public.audit_events), 0, 'CA-E3-15: member lê 0 eventos');
select tests.login_as('b');
select is((select count(*)::int from public.audit_events where family_id = tests.fid('A')), 0, 'B não lê eventos de A');
select tests.login_as('a');
select throws_ok($$update public.audit_events set action = 'a.b'$$, '42501', null, 'audit_events segue append-only');
select throws_ok($$select private.accounts_audit()$$, '42501', null, 'funções de trigger de auditoria não são executáveis pela API');

select * from finish();
rollback;
