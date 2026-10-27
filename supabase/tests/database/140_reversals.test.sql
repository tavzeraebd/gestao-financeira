-- CA-E3-09 (estorno) e CA-E3-10 (campos travados / exclusão bloqueada).
begin;

select plan(32);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2026-01-01', tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2026-01-01', tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000003', tests.fid('B'), 'Conta B', 'checking', 0, '2026-01-01', tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-1', 'briefcase', tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000005', tests.fid('A'), 'Lazer', 'expense', 'chart-2', 'party-popper', tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000003', tests.fid('B'), 'Mercado B', 'expense', 'chart-1', 'utensils', tests.uid('b'));
insert into public.transactions (id, family_id, type, account_id, destination_account_id, category_id, description, amount, transaction_date, status, created_by) values
  ('f1000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', null,
   'c1000000-0000-0000-0000-000000000001', 'Despesa 100', 100, '2026-03-10', 'paid', tests.uid('a')),
  ('f1000000-0000-0000-0000-000000000002', tests.fid('A'), 'income', 'a1000000-0000-0000-0000-000000000001', null,
   'c1000000-0000-0000-0000-000000000002', 'Receita 200', 200, '2026-03-10', 'paid', tests.uid('a')),
  ('f1000000-0000-0000-0000-000000000003', tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
   null, 'Transferência 50', 50, '2026-03-10', 'paid', tests.uid('a')),
  ('f1000000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', null,
   'c1000000-0000-0000-0000-000000000001', 'Pendente 30', 30, '2026-03-10', 'pending', tests.uid('a')),
  ('f1000000-0000-0000-0000-000000000005', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', null,
   'c1000000-0000-0000-0000-000000000001', 'Do admin 80', 80, '2026-03-10', 'paid', tests.uid('ad')),
  ('f1000000-0000-0000-0000-000000000006', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', null,
   'c1000000-0000-0000-0000-000000000001', 'Do membro 60', 60, '2026-03-10', 'paid', tests.uid('m')),
  ('f1000000-0000-0000-0000-000000000007', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', null,
   'c1000000-0000-0000-0000-000000000001', 'Excluída', 10, '2026-03-10', 'paid', tests.uid('a')),
  ('f1000000-0000-0000-0000-000000000008', tests.fid('B'), 'expense', 'a1000000-0000-0000-0000-000000000003', null,
   'c1000000-0000-0000-0000-000000000003', 'Da família B', 10, '2026-03-10', 'paid', tests.uid('b'));

select tests.login_as('a');
select lives_ok($$update public.transactions set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000007'$$, 'prepara o excluído');

-- CA-E3-09 · estorno válido ---------------------------------------------------------------------------------------------
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno: Despesa 100', 30, '2026-03-12', 'f1000000-0000-0000-0000-000000000001')$$,
  'CA-E3-09: estorno parcial (30 de 100) mesmo tipo, conta e categoria');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno demais', 70.01, '2026-03-12', 'f1000000-0000-0000-0000-000000000001')$$,
  'P0001', 'REVERSAL_EXCEEDS_REMAINING', 'CA-E3-09: Σ estornos > original → REVERSAL_EXCEEDS_REMAINING (o segundo estorno falha)');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno do resto', 70, '2026-03-13', 'f1000000-0000-0000-0000-000000000001')$$,
  'CA-E3-09: Σ estornos = original é aceito');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Nada sobrou', 0.01, '2026-03-13', 'f1000000-0000-0000-0000-000000000001')$$,
  'P0001', 'REVERSAL_EXCEEDS_REMAINING', 'original totalmente estornado não aceita mais estorno');

-- CA-E3-09 · estornos inválidos -----------------------------------------------------------------------------------------
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'income', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002',
          'Tipo diferente', 10, '2026-03-12', 'f1000000-0000-0000-0000-000000000001')$$,
  'P0001', 'INVALID_REVERSAL', 'CA-E3-09: tipo diferente do original');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'income', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002',
          'Outra conta', 10, '2026-03-12', 'f1000000-0000-0000-0000-000000000002')$$,
  'P0001', 'INVALID_REVERSAL', 'CA-E3-09: conta diferente da original');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005',
          'Outra categoria', 10, '2026-03-12', 'f1000000-0000-0000-0000-000000000005')$$,
  'P0001', 'INVALID_REVERSAL', 'CA-E3-09: categoria diferente da original');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Antes do original', 10, '2026-03-09', 'f1000000-0000-0000-0000-000000000005')$$,
  'P0001', 'INVALID_REVERSAL', 'CA-E3-09: data anterior à do original');
select throws_ok($$insert into public.transactions (family_id, type, account_id, destination_account_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'transfer', 'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
          'Estorno de transferência', 10, '2026-03-12', 'f1000000-0000-0000-0000-000000000003')$$,
  'P0001', 'INVALID_REVERSAL', 'CA-E3-09: estorno de transferência');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno de pendente', 10, '2026-03-12', 'f1000000-0000-0000-0000-000000000004')$$,
  'P0001', 'INVALID_REVERSAL', 'CA-E3-09: estorno de lançamento pendente');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno de excluído', 10, '2026-03-12', 'f1000000-0000-0000-0000-000000000007')$$,
  'P0001', 'INVALID_REVERSAL', 'CA-E3-09: estorno de lançamento excluído');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno de estorno', 5, '2026-03-14', (select id from public.transactions where description = 'Estorno: Despesa 100'))$$,
  'P0001', 'INVALID_REVERSAL', 'CA-E3-09: estorno de estorno');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id, status)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno pendente', 10, '2026-03-14', 'f1000000-0000-0000-0000-000000000005', 'pending')$$,
  'P0001', 'INVALID_REVERSAL', 'estorno precisa ser paid');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Original inexistente', 10, '2026-03-14', 'f1000000-0000-0000-0000-0000000000ff')$$,
  'P0001', 'INVALID_REVERSAL', 'original inexistente');
select tests.login_as('b');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('B'), 'expense', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003',
          'Original de outra família', 5, '2026-03-14', 'f1000000-0000-0000-0000-000000000001')$$,
  'P0001', 'INVALID_REVERSAL', 'original de outra família é invisível → INVALID_REVERSAL');

-- CA-E3-09 · quem pode estornar -------------------------------------------------------------------------------------------
select tests.login_as('m');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno alheio', 10, '2026-03-14', 'f1000000-0000-0000-0000-000000000005')$$,
  '42501', null, 'CA-E3-09: member estornando lançamento alheio → 42501');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno do autor', 10, '2026-03-14', 'f1000000-0000-0000-0000-000000000006')$$,
  'CA-E3-09: autor estorna o próprio lançamento');
select tests.login_as('ad');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno pelo admin', 10, '2026-03-14', 'f1000000-0000-0000-0000-000000000006')$$,
  'CA-E3-09: admin estorna lançamento de outro');

-- CA-E3-10 · travas ---------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok($$update public.transactions set amount = 120 where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'TRANSACTION_HAS_REVERSALS', 'CA-E3-10: original com estorno ativo — amount travado');
select throws_ok($$update public.transactions set transaction_date = '2026-03-11' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'TRANSACTION_HAS_REVERSALS', 'CA-E3-10: transaction_date travada');
select throws_ok($$update public.transactions set account_id = 'a1000000-0000-0000-0000-000000000002' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'TRANSACTION_HAS_REVERSALS', 'CA-E3-10: account_id travado');
select throws_ok($$update public.transactions set category_id = 'c1000000-0000-0000-0000-000000000005' where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'TRANSACTION_HAS_REVERSALS', 'CA-E3-10: category_id travado');
select throws_ok($$update public.transactions set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'TRANSACTION_HAS_REVERSALS', 'CA-E3-10: excluir original com estorno ativo é bloqueado');
select lives_ok($$update public.transactions set description = 'Descrição livre', notes = 'ok', assigned_member_id = null
  where id = 'f1000000-0000-0000-0000-000000000001'$$, 'CA-E3-10: campos não financeiros do original seguem editáveis');
select throws_ok($$update public.transactions set amount = 5 where description = 'Estorno: Despesa 100'$$,
  'P0001', 'TRANSACTION_HAS_REVERSALS', 'CA-E3-10: amount do estorno travado');
select throws_ok($$update public.transactions set transaction_date = '2026-03-20' where description = 'Estorno: Despesa 100'$$,
  'P0001', 'TRANSACTION_HAS_REVERSALS', 'CA-E3-10: data do estorno travada');
select throws_ok($$update public.transactions set reversal_of_id = null where description = 'Estorno: Despesa 100'$$,
  '42501', null, 'reversal_of_id fora do grant de update');

-- excluir os estornos libera o original
select lives_ok($$update public.transactions set deleted_at = now() where reversal_of_id = 'f1000000-0000-0000-0000-000000000001'$$,
  'CA-E3-10: estornos podem ser excluídos logicamente');
select lives_ok($$update public.transactions set amount = 120 where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'CA-E3-10: sem estorno ativo, o original volta a ser editável');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
          'Estorno total', 120, '2026-03-15', 'f1000000-0000-0000-0000-000000000001')$$,
  'estornos excluídos não contam na soma');
select is((select count(*)::int from public.transactions where reversal_of_id = 'f1000000-0000-0000-0000-000000000001' and deleted_at is null), 1,
  'um estorno ativo restante');

select * from finish();
rollback;
