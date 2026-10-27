-- CA-E3-02 (isolamento), CA-E3-03 (FKs compostas), CA-E3-05 (created_by), CA-E3-06 (editar/excluir),
-- CA-E3-08 (exclusão lógica), CA-E3-11 (idempotência).
begin;

select plan(42);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2026-01-01', tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2026-01-01', tests.uid('a')),
  ('a1000000-0000-0000-0000-000000000003', tests.fid('B'), 'Conta B', 'checking', 500, '2026-01-01', tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-1', 'briefcase', tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000003', tests.fid('B'), 'Mercado B', 'expense', 'chart-1', 'utensils', tests.uid('b'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, created_by) values
  ('f1000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Do owner', 100, '2026-03-10', tests.uid('a')),
  ('f1000000-0000-0000-0000-000000000002', tests.fid('B'), 'expense', 'a1000000-0000-0000-0000-000000000003',
   'c1000000-0000-0000-0000-000000000003', 'Da família B', 40, '2026-03-10', tests.uid('b')),
  ('f1000000-0000-0000-0000-000000000011', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'Do membro', 25.50, '2026-03-11', tests.uid('m'));

-- CA-E3-02 · isolamento -------------------------------------------------------------------------------------------
select tests.login_as('b');
select is((select count(*)::int from public.accounts where family_id = tests.fid('A')), 0, 'CA-E3-02: B não lê contas de A');
select is((select count(*)::int from public.categories where family_id = tests.fid('A')), 0, 'CA-E3-02: B não lê categorias de A');
select is((select count(*)::int from public.transactions where family_id = tests.fid('A')), 0, 'CA-E3-02: B não lê lançamentos de A');
select is((select count(*)::int from public.account_balances()), 1, 'CA-E3-02: account_balances de B só traz a conta de B');
select is((select balance from public.account_balances()), '460.00', 'CA-E3-02: saldo de B não inclui nada de A (500 - 40)');
select is((select expense from public.period_summary('2026-03-01', '2026-03-31')), '40.00',
  'CA-E3-02: period_summary de B não inclui as despesas de A');
select tests.login_as('c');
select is((select count(*)::int from public.accounts) + (select count(*)::int from public.categories)
          + (select count(*)::int from public.transactions), 0, 'CA-E3-02: C (sem família) lê 0 linhas');
select is((select count(*)::int from public.account_balances()), 0, 'CA-E3-02: C sem contas em account_balances');
select is((select expense from public.period_summary('2026-03-01', '2026-03-31')), '0.00', 'CA-E3-02: C sem totais');
select tests.login_anon();
select throws_ok($$select count(*) from public.transactions$$, '42501', null, 'anon não lê transactions');
select throws_ok($$select * from public.account_balances()$$, '42501', null, 'anon não executa account_balances');

-- CA-E3-03 · FKs compostas e família ---------------------------------------------------------------------------------
select tests.login_as('b');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Invasão', 1, '2026-03-10')$$,
  '42501', null, 'CA-E3-03: inserir com family_id de A → 42501');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('B'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 'Conta de A', 1, '2026-03-10')$$,
  '23503', null, 'CA-E3-03: account_id de A na própria família → 23503');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date)
  values (tests.fid('B'), 'expense', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'Categoria de A', 1, '2026-03-10')$$,
  '23503', null, 'CA-E3-03: category_id de A na própria família → 23503');
select throws_ok($$insert into public.transactions (family_id, type, account_id, destination_account_id, description, amount, transaction_date)
  values (tests.fid('B'), 'transfer', 'a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'Destino de A', 1, '2026-03-10')$$,
  '23503', null, 'CA-E3-03: destination_account_id de A → 23503');
-- vínculo de membro de A (id lido como postgres e fixado em GUC)
select tests.logout();
select set_config('tests.member_a', (select id::text from public.family_members where user_id = tests.uid('m')), true);
select tests.login_as('b');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date)
  values (tests.fid('B'), 'expense', 'a1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003',
          current_setting('tests.member_a')::uuid, 'Responsável de A', 1, '2026-03-10')$$,
  '23503', null, 'CA-E3-03: assigned_member_id de A → 23503');
select throws_ok($$update public.transactions set account_id = 'a1000000-0000-0000-0000-000000000001'
  where id = 'f1000000-0000-0000-0000-000000000002'$$,
  '23503', null, 'CA-E3-03: update trocando para conta de A → 23503');

-- CA-E3-05 · member cria; created_by = chamador ------------------------------------------------------------------------
select tests.login_as('m');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, idempotency_key)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001',
          'c1000000-0000-0000-0000-000000000001', 'Criado pelo membro', 25.50, '2026-03-11', '11111111-1111-1111-1111-111111111111')$$,
  'CA-E3-05: member cria lançamento');
select is((select created_by from public.transactions where description = 'Criado pelo membro'), tests.uid('m'),
  'CA-E3-05: created_by é o chamador');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, created_by)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Forjado', 1, '2026-03-11', tests.uid('a'))$$,
  '42501', null, 'CA-E3-05: enviar created_by → 42501');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date)
  values (tests.fid('A'), 'income', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002',
          current_setting('tests.member_a')::uuid, 'Com responsável', 10, '2026-03-11')$$,
  'responsável do mesmo vínculo ativo é aceito');

-- CA-E3-11 · idempotência --------------------------------------------------------------------------------------------
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, idempotency_key)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Repetido', 99, '2026-03-11',
          '11111111-1111-1111-1111-111111111111')$$,
  '23505', null, 'CA-E3-11: mesma idempotency_key → 23505');
select is((select count(*)::int from public.transactions where description = 'Repetido'), 0, 'CA-E3-11: nada muda');

-- CA-E3-06 · editar e excluir -------------------------------------------------------------------------------------------
select is(tests.affected($$update public.transactions set description = 'Hack' where id = 'f1000000-0000-0000-0000-000000000001'$$), 0,
  'CA-E3-06: member não edita lançamento de outro (0 linhas)');
select is(tests.affected($$update public.transactions set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000001'$$), 0,
  'CA-E3-06: member não exclui lançamento de outro (0 linhas)');
select is(tests.affected($$update public.transactions set description = 'Do membro (editado)', notes = 'ok' where id = 'f1000000-0000-0000-0000-000000000011'$$), 1,
  'CA-E3-06: member edita o próprio');
select throws_ok($$delete from public.transactions where id = 'f1000000-0000-0000-0000-000000000011'$$, '42501', null,
  'CA-E3-06: delete físico negado ao member');
select tests.login_as('ad');
select is(tests.affected($$update public.transactions set description = 'Editado pelo admin' where id = 'f1000000-0000-0000-0000-000000000011'$$), 1,
  'CA-E3-06: admin edita lançamento de qualquer um');
select throws_ok($$delete from public.transactions where id = 'f1000000-0000-0000-0000-000000000011'$$, '42501', null,
  'CA-E3-06: delete físico negado ao admin');
select tests.login_as('a');
select is(tests.affected($$update public.transactions set description = 'Editado pelo owner' where id = 'f1000000-0000-0000-0000-000000000011'$$), 1,
  'CA-E3-06: owner edita lançamento de qualquer um');
select throws_ok($$delete from public.transactions where id = 'f1000000-0000-0000-0000-000000000011'$$, '42501', null,
  'CA-E3-06: delete físico negado ao owner');
select tests.login_as('b');
select is(tests.affected($$update public.transactions set description = 'Hack' where id = 'f1000000-0000-0000-0000-000000000001'$$), 0,
  'owner de outra família não edita (0 linhas)');

-- CA-E3-08 · exclusão lógica ---------------------------------------------------------------------------------------------
select tests.login_as('m');
select is(tests.affected($$update public.transactions set deleted_at = '2000-01-01' where id = 'f1000000-0000-0000-0000-000000000011'$$), 1,
  'CA-E3-06: member exclui logicamente o próprio');
select ok((select deleted_at > now() - interval '1 minute' and deleted_by = tests.uid('m') from public.transactions
            where id = 'f1000000-0000-0000-0000-000000000011'),
  'CA-E3-08: o trigger fixa deleted_at = now() e deleted_by = auth.uid()');
select is(tests.affected($$update public.transactions set description = 'Zumbi' where id = 'f1000000-0000-0000-0000-000000000011'$$), 0,
  'CA-E3-08: linha excluída não é atualizável (0 linhas)');
select is(tests.affected($$update public.transactions set deleted_at = null where id = 'f1000000-0000-0000-0000-000000000011'$$), 0,
  'CA-E3-08: não existe "desexcluir"');
select tests.login_as('a');
select is(tests.affected($$update public.transactions set description = 'Zumbi' where id = 'f1000000-0000-0000-0000-000000000011'$$), 0,
  'CA-E3-08: nem o owner atualiza uma linha excluída');
select is((select description from public.transactions where id = 'f1000000-0000-0000-0000-000000000011'), 'Editado pelo owner',
  'CA-E3-08: a linha excluída continua legível e intacta');
select is(tests.affected($$update public.transactions set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000001'$$), 1,
  'owner exclui logicamente lançamento de outro');

-- status: insert aceita só paid/pending
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status)
  values (tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Cancelado', 1, '2026-03-11', 'canceled')$$,
  '23514', null, 'insert com status canceled → 23514');
select throws_ok($$update public.transactions set status = 'pending' where id = 'f1000000-0000-0000-0000-000000000001'$$, '42501', null,
  'status fora do grant de update');
select throws_ok($$update public.transactions set type = 'income' where id = 'f1000000-0000-0000-0000-000000000011'$$, '42501', null,
  'type fora do grant de update');

select * from finish();
rollback;
