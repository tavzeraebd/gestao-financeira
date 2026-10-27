-- CA-E3-04 (categorias), CA-E3-12 (seed e backfill), CA-E3-13 (hierarquia, nome, exclusão).
begin;

select plan(46);

select tests.setup_world();

-- CA-E3-12 · create_family semeia as categorias padrão ----------------------------------------------------------
select tests.login_as('c');
select public.create_family('Família do Caio');
select tests.logout();

select is((select count(*)::int from public.categories c join public.families f on f.id = c.family_id
            where f.created_by = tests.uid('c') and c.type = 'expense'), 10, 'CA-E3-12: 10 categorias de despesa semeadas');
select is((select count(*)::int from public.categories c join public.families f on f.id = c.family_id
            where f.created_by = tests.uid('c') and c.type = 'income'), 6, 'CA-E3-12: 6 categorias de receita semeadas');
select is((select count(*)::int from public.categories c join public.families f on f.id = c.family_id
            where f.created_by = tests.uid('c') and c.is_default and c.parent_id is null and c.archived_at is null
              and c.created_by = tests.uid('c')), 16, 'CA-E3-12: todas is_default, raiz, ativas e criadas por quem criou a família');
select is((select string_agg(c.name || ':' || c.icon || ':' || c.color, ',' order by c.name) from public.categories c
            join public.families f on f.id = c.family_id where f.created_by = tests.uid('c') and c.type = 'expense'),
  'Alimentação:utensils:chart-3,Assinaturas:repeat:chart-2,Compras:shopping-bag:chart-5,Contas domésticas:zap:chart-3,'
  'Educação:graduation-cap:chart-4,Lazer:party-popper:chart-1,Moradia:house:chart-1,Outros:ellipsis:chart-6,'
  'Saúde:heart-pulse:chart-5,Transporte:car:chart-2',
  'CA-E3-12: despesas com ícone e cor do contrato');
select is((select string_agg(c.name || ':' || c.icon || ':' || c.color, ',' order by c.name) from public.categories c
            join public.families f on f.id = c.family_id where f.created_by = tests.uid('c') and c.type = 'income'),
  'Freelance:laptop:chart-2,Outros:ellipsis:chart-6,Reembolsos:undo-2:chart-5,Renda extra:hand-coins:chart-3,'
  'Rendimentos:trending-up:chart-4,Salário:briefcase:chart-1',
  'CA-E3-12: receitas com ícone e cor do contrato');

-- backfill das famílias existentes (A e B não têm categorias) e idempotência
select is((select count(*)::int from public.categories where family_id in (tests.fid('A'), tests.fid('B'))), 0,
  'famílias criadas fora de create_family começam sem categorias');
select private.seed_default_categories(f.id) from public.families f
where not exists (select 1 from public.categories c where c.family_id = f.id);
select is((select count(*)::int from public.categories where family_id = tests.fid('A')), 16,
  'CA-E3-12: backfill semeia a família A');
select private.seed_default_categories(f.id) from public.families f
where not exists (select 1 from public.categories c where c.family_id = f.id);
select private.seed_default_categories(tests.fid('A'));
select is((select count(*)::int from public.categories where family_id = tests.fid('A')), 16,
  'CA-E3-12: reaplicar o backfill não duplica');
select is((select count(*)::int from public.categories where family_id = tests.fid('B')), 16, 'backfill também semeou B');
select tests.login_as('a');
select throws_ok($$select private.seed_default_categories(tests.fid('A'))$$, '42501', null,
  'seed_default_categories não é executável por authenticated');
select tests.logout();

-- fixtures auxiliares (como postgres): conta e lançamento para as regras de exclusão
insert into public.accounts (id, family_id, name, type, opening_balance_date, created_by) values
  ('a1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', '2026-01-01', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c1000000-0000-0000-0000-000000000001', tests.fid('A'), 'Pet', 'expense', 'chart-4', 'dog', tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000002', tests.fid('A'), 'Presentes', 'expense', 'chart-5', 'gift', tests.uid('a')),
  ('c1000000-0000-0000-0000-000000000003', tests.fid('B'), 'Pai de B', 'expense', 'chart-5', 'gift', tests.uid('b'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, created_by) values
  ('f1000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000002', 'Presente', 10, '2026-03-10', tests.uid('a'));

-- CA-E3-04 · permissões ------------------------------------------------------------------------------------------
select tests.login_as('m');
select throws_ok($$insert into public.categories (family_id, name, type, color, icon) values (tests.fid('A'), 'Do membro', 'expense', 'chart-1', 'gift')$$,
  '42501', null, 'CA-E3-04: member não cria categoria');
select is(tests.affected($$update public.categories set name = 'Hack' where id = 'c1000000-0000-0000-0000-000000000001'$$), 0,
  'CA-E3-04: member não altera categoria (0 linhas)');
select is(tests.affected($$delete from public.categories where id = 'c1000000-0000-0000-0000-000000000001'$$), 0,
  'CA-E3-04: member não exclui categoria (0 linhas)');
select is((select count(*)::int from public.categories where family_id = tests.fid('A')), 18, 'member lê as categorias da família');

select tests.login_as('ad');
select lives_ok($$insert into public.categories (family_id, name, type, color, icon) values (tests.fid('A'), 'Do admin', 'expense', 'chart-1', 'gift')$$,
  'CA-E3-04: admin cria categoria');
select tests.login_as('a');
select lives_ok($$insert into public.categories (family_id, name, type, color, icon) values (tests.fid('A'), 'Do owner', 'income', 'chart-2', 'wallet')$$,
  'CA-E3-04: owner cria categoria');
select is((select created_by from public.categories where name = 'Do owner'), tests.uid('a'), 'created_by = chamador');
select lives_ok($$update public.categories set name = 'Pets', color = 'chart-6', icon = 'dog' where id = 'c1000000-0000-0000-0000-000000000001'$$,
  'owner altera nome, cor e ícone');
select throws_ok($$update public.categories set type = 'income' where id = 'c1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'CA-E3-04: ninguém altera o type da categoria');
select throws_ok($$insert into public.categories (family_id, name, type, color, icon) values (tests.fid('B'), 'Invasão', 'expense', 'chart-1', 'gift')$$,
  '42501', null, 'owner de A não cria categoria em B');
select throws_ok($$insert into public.categories (family_id, name, type, color, icon) values (tests.fid('A'), 'Cor ruim', 'expense', 'red', 'gift')$$,
  '23514', null, 'color fora de chart-1..6');
select throws_ok($$insert into public.categories (family_id, name, type, color, icon) values (tests.fid('A'), 'Ícone ruim', 'expense', 'chart-1', 'Gift Icon')$$,
  '23514', null, 'icon fora do formato');
select throws_ok($$insert into public.categories (family_id, name, type, color, icon) values (tests.fid('A'), ' ', 'expense', 'chart-1', 'gift')$$,
  '23514', null, 'nome vazio após btrim');

select tests.login_as('b');
select is((select count(*)::int from public.categories where family_id = tests.fid('A')), 0, 'B não lê categorias de A');
select tests.login_as('c');
select is((select count(*)::int from public.categories where family_id = tests.fid('A')), 0, 'C não lê categorias de A');

-- CA-E3-13 · nome único -------------------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok($$insert into public.categories (family_id, name, type, color, icon) values (tests.fid('A'), ' moradia ', 'expense', 'chart-1', 'house')$$,
  '23505', null, 'CA-E3-13: nome único entre ativas por tipo, sem diferenciar maiúsculas');
select lives_ok($$insert into public.categories (family_id, name, type, color, icon) values (tests.fid('A'), 'Moradia', 'income', 'chart-1', 'house')$$,
  'CA-E3-13: mesmo nome em tipo diferente é permitido');
select lives_ok($$insert into public.categories (family_id, name, type, color, icon, parent_id)
  values (tests.fid('A'), 'Moradia', 'expense', 'chart-1', 'house', 'c1000000-0000-0000-0000-000000000001')$$,
  'CA-E3-13: mesmo nome sob outro pai é permitido');
select throws_ok($$insert into public.categories (family_id, name, type, color, icon, parent_id)
  values (tests.fid('A'), 'MORADIA', 'expense', 'chart-1', 'house', 'c1000000-0000-0000-0000-000000000001')$$,
  '23505', null, 'CA-E3-13: nome repetido sob o mesmo pai');
select lives_ok($$update public.categories set archived_at = now() where name = 'Do owner'$$, 'arquiva categoria');
select lives_ok($$insert into public.categories (family_id, name, type, color, icon) values (tests.fid('A'), 'Do owner', 'income', 'chart-2', 'wallet')$$,
  'CA-E3-13: nome de categoria arquivada pode ser reutilizado');

-- CA-E3-13 · hierarquia (c...01 é pai da filha 'Moradia' criada acima) ---------------------------------------------
select throws_ok($$insert into public.categories (family_id, name, type, color, icon, parent_id)
  values (tests.fid('A'), 'Neta', 'expense', 'chart-1', 'gift', (select id from public.categories where name = 'Moradia' and parent_id is not null))$$,
  'P0001', 'INVALID_CATEGORY_PARENT', 'CA-E3-13: só 1 nível (pai não pode ter pai)');
select throws_ok($$insert into public.categories (family_id, name, type, color, icon, parent_id)
  values (tests.fid('A'), 'Filha de receita', 'income', 'chart-1', 'gift', 'c1000000-0000-0000-0000-000000000001')$$,
  'P0001', 'INVALID_CATEGORY_PARENT', 'CA-E3-13: pai de tipo diferente');
select throws_ok($$update public.categories set parent_id = id where id = 'c1000000-0000-0000-0000-000000000002'$$,
  'P0001', 'INVALID_CATEGORY_PARENT', 'CA-E3-13: categoria não é pai de si mesma');
select throws_ok($$update public.categories set parent_id = 'c1000000-0000-0000-0000-000000000002' where id = 'c1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'INVALID_CATEGORY_PARENT', 'CA-E3-13: categoria com filhos não vira filha');
select throws_ok($$insert into public.categories (family_id, name, type, color, icon, parent_id)
  values (tests.fid('A'), 'Filha de B', 'expense', 'chart-1', 'gift', 'c1000000-0000-0000-0000-000000000003')$$,
  '23503', null, 'pai de outra família → 23503 (FK composta)');
select lives_ok($$update public.categories set archived_at = now() where id = 'c1000000-0000-0000-0000-000000000002'$$,
  'arquiva categoria com lançamento');
select throws_ok($$insert into public.categories (family_id, name, type, color, icon, parent_id)
  values (tests.fid('A'), 'Filha de arquivada', 'expense', 'chart-1', 'gift', 'c1000000-0000-0000-0000-000000000002')$$,
  'P0001', 'INVALID_CATEGORY_PARENT', 'CA-E3-13: pai arquivado');
select throws_ok($$update public.categories set archived_at = now() where id = 'c1000000-0000-0000-0000-000000000001'$$,
  'P0001', 'CATEGORY_HAS_CHILDREN', 'CA-E3-13: arquivar pai com filha ativa');
select lives_ok($$update public.categories set archived_at = now() where name = 'Moradia' and parent_id is not null$$,
  'arquiva a filha');
select lives_ok($$update public.categories set archived_at = now() where id = 'c1000000-0000-0000-0000-000000000001'$$,
  'agora o pai pode ser arquivado');

-- CA-E3-13 · exclusão -----------------------------------------------------------------------------------------------
select throws_ok($$delete from public.categories where id = 'c1000000-0000-0000-0000-000000000002'$$,
  '23503', null, 'CA-E3-13: excluir categoria com lançamento → 23503');
select lives_ok($$update public.transactions set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'exclui logicamente o lançamento');
select throws_ok($$delete from public.categories where id = 'c1000000-0000-0000-0000-000000000002'$$,
  '23503', null, 'CA-E3-13: lançamento excluído logicamente ainda bloqueia a exclusão da categoria');
select throws_ok($$delete from public.categories where id = 'c1000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'CA-E3-13: excluir categoria com subcategoria → 23503');
select is(tests.affected($$delete from public.categories where name = 'Do admin'$$), 1,
  'owner exclui categoria sem histórico');

select * from finish();
rollback;
