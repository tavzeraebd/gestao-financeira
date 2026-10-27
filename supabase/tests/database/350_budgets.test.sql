-- CA-E5-13 (regras do orçamento) e CA-E5-14 (estrutura/vigência/limites de budget_progress). Valores exatos de R14 em 360.
begin;

select plan(40);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a9000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2020-01-01', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, archived_at, created_by) values
  ('c9000000-0000-0000-0000-000000000001', tests.fid('A'), 'Alimentação', 'expense', 'chart-1', 'utensils', null, tests.uid('a')),
  ('c9000000-0000-0000-0000-000000000003', tests.fid('A'), 'Transporte', 'expense', 'chart-2', 'car', null, tests.uid('a')),
  ('c9000000-0000-0000-0000-000000000004', tests.fid('A'), 'Salário', 'income', 'chart-3', 'briefcase', null, tests.uid('a')),
  ('c9000000-0000-0000-0000-000000000005', tests.fid('A'), 'Velha', 'expense', 'chart-4', 'gift', now(), tests.uid('a')),
  ('c9000000-0000-0000-0000-000000000006', tests.fid('A'), 'Lazer', 'expense', 'chart-5', 'party-popper', null, tests.uid('a')),
  ('c9000000-0000-0000-0000-000000000007', tests.fid('A'), 'Casa', 'expense', 'chart-1', 'home', null, tests.uid('a')),
  ('c9000000-0000-0000-0000-000000000008', tests.fid('A'), 'Sem uso', 'expense', 'chart-2', 'gift', null, tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, parent_id, created_by) values
  ('c9000000-0000-0000-0000-000000000002', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', 'c9000000-0000-0000-0000-000000000001', tests.uid('a'));

-- movimento de março/2024 (fixture)
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by) values
  ('f9000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'Alimentação', 300, '2024-03-05', 'paid', tests.uid('a')),
  ('f9000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000002', 'Mercado', 150, '2024-03-06', 'paid', tests.uid('a')),
  ('f9000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000003', 'Transporte', 60, '2024-03-07', 'paid', tests.uid('a')),
  ('f9000000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'Pendente', 80, '2024-03-20', 'pending', tests.uid('a')),
  ('f9000000-0000-0000-0000-000000000005', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'A cancelar', 55, '2024-03-21', 'pending', tests.uid('a')),
  ('f9000000-0000-0000-0000-000000000006', tests.fid('A'), 'income', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000004', 'Receita', 1000, '2024-03-10', 'paid', tests.uid('a'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status, deleted_at, deleted_by, created_by) values
  ('f9000000-0000-0000-0000-000000000007', tests.fid('A'), 'expense', 'a9000000-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'Excluída', 999, '2024-03-11', 'paid', now(), tests.uid('a'), tests.uid('a'));
update public.transactions set status = 'canceled' where id = 'f9000000-0000-0000-0000-000000000005';

-- CA-E5-13 · criação ---------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000004', 100, '2024-01-01')$$, 'P0001', 'CATEGORY_TYPE_MISMATCH', 'CA-E5-13: categoria de receita → CATEGORY_TYPE_MISMATCH');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000005', 100, '2024-01-01')$$, 'P0001', 'CATEGORY_ARCHIVED', 'CA-E5-13: categoria arquivada na criação → CATEGORY_ARCHIVED');
select lives_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000001', 500, '2024-01-01')$$, 'CA-E5-13: cria o orçamento de Alimentação');
select is((select created_by from public.budgets where category_id = 'c9000000-0000-0000-0000-000000000001'), tests.uid('a'), 'CA-E5-13: created_by é o chamador');
select tests.logout();
update public.budgets set id = 'b9000000-0000-0000-0000-000000000001' where category_id = 'c9000000-0000-0000-0000-000000000001';
select tests.login_as('a');

select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000001', 100, '2024-02-01')$$, '23505', null, 'CA-E5-13: dois ativos para a mesma categoria → 23505');
select lives_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), null, 400, '2024-01-01')$$, 'CA-E5-13: cria o orçamento "todas as despesas"');
select tests.logout();
update public.budgets set id = 'b9000000-0000-0000-0000-000000000002' where category_id is null;
select tests.login_as('a');

select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), null, 100, '2024-02-01')$$, '23505', null, 'CA-E5-13: dois ativos para "todas" (categoria nula) → 23505');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000008', 100, '2024-01-15')$$, '23514', null, 'CA-E5-13: start_month fora do dia 1 → 23514');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month, end_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000008', 100, '2024-01-01', '2024-06-15')$$, '23514', null, 'CA-E5-13: end_month fora do dia 1 → 23514');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month, end_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000008', 100, '2024-06-01', '2024-05-01')$$, '23514', null, 'CA-E5-13: end_month antes de start_month → 23514');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000008', 100, '1999-12-01')$$, '23514', null, 'CA-E5-13: start_month antes de 2000 → 23514');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000008', 0, '2024-01-01')$$, '23514', null, 'CA-E5-13: limite 0 → 23514');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000008', 'NaN', '2024-01-01')$$, '23514', null, 'CA-E5-13: limite NaN → 23514');
select throws_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000008', 100000000, '2024-01-01')$$, '23514', null, 'CA-E5-13: limite acima do teto → 23514');
select lives_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000008', 99999999.99, '2024-01-01')$$, 'CA-E5-13: limite no teto é aceito');
select throws_ok($$update public.budgets set amount_limit = 0 where id = 'b9000000-0000-0000-0000-000000000001'$$, '23514', null, 'CA-E5-13: atualizar o limite para 0 → 23514');
select is(tests.affected($$update public.budgets set amount_limit = 520, end_month = '2025-12-01' where id = 'b9000000-0000-0000-0000-000000000001'$$), 1,
  'CA-E5-13: atualiza limite e término');
select lives_ok($$update public.budgets set amount_limit = 500, end_month = null where id = 'b9000000-0000-0000-0000-000000000001'$$, 'CA-E5-13: volta ao limite 500 sem término');

-- arquivar e recriar: o índice único é parcial (só ativos)
select lives_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000007', 100, '2024-01-01')$$, 'orçamento de Casa');
select tests.logout();
update public.budgets set id = 'b9000000-0000-0000-0000-000000000005' where category_id = 'c9000000-0000-0000-0000-000000000007';
select tests.login_as('a');
update public.budgets set archived_at = now() where id = 'b9000000-0000-0000-0000-000000000005';
select lives_ok($$insert into public.budgets (family_id, category_id, amount_limit, start_month)
  values (tests.fid('A'), 'c9000000-0000-0000-0000-000000000007', 200, '2024-01-01')$$,
  'CA-E5-13: arquivado não bloqueia um novo ativo da mesma categoria');
select throws_ok($$update public.budgets set archived_at = null where id = 'b9000000-0000-0000-0000-000000000005'$$, '23505', null,
  'CA-E5-13: desarquivar com outro ativo da categoria → 23505');

-- desarquivar com categoria arquivada; categoria arquivada depois não afeta o cálculo
select tests.logout();
insert into public.budgets (id, family_id, category_id, amount_limit, start_month, end_month, created_by) values
  ('b9000000-0000-0000-0000-000000000003', tests.fid('A'), 'c9000000-0000-0000-0000-000000000003', 100, '2024-03-01', '2024-04-01', tests.uid('a')),
  ('b9000000-0000-0000-0000-000000000004', tests.fid('A'), 'c9000000-0000-0000-0000-000000000006', 100, '2024-01-01', null, tests.uid('a'));
update public.budgets set archived_at = now() where id = 'b9000000-0000-0000-0000-000000000004';
update public.categories set archived_at = now() where id in ('c9000000-0000-0000-0000-000000000003', 'c9000000-0000-0000-0000-000000000006');
select tests.login_as('a');
select throws_ok($$update public.budgets set archived_at = null where id = 'b9000000-0000-0000-0000-000000000004'$$, 'P0001', 'CATEGORY_ARCHIVED',
  'CA-E5-13: desarquivar orçamento com categoria arquivada → CATEGORY_ARCHIVED');
select results_eq($$select spent, committed from public.budget_progress('2024-03-01', '2024-03-01') where budget_id = 'b9000000-0000-0000-0000-000000000003'$$,
  $$values ('60.00'::text, '0.00'::text)$$, 'CA-E5-13: categoria arquivada depois continua calculando (Transporte 60,00)');
select throws_ok($$delete from public.categories where id = 'c9000000-0000-0000-0000-000000000006'$$, '23503', null,
  'CA-E5-13: excluir categoria com orçamento → 23503');
select lives_ok($$delete from public.categories where id = 'c9000000-0000-0000-0000-000000000008' and false$$, 'sem efeito (controle)');

-- CA-E5-14 · budget_progress --------------------------------------------------------------------------------------------------------
select results_eq($$select spent, committed from public.budget_progress('2024-03-01', '2024-03-31') where budget_id = 'b9000000-0000-0000-0000-000000000001'$$,
  $$values ('450.00'::text, '80.00'::text)$$, 'CA-E5-14: Alimentação inclui a filha; pendente é comprometido; cancelada, excluída, receita fora (450,00 / 80,00)');
select results_eq($$select spent, committed from public.budget_progress('2024-03-01', '2024-03-31') where budget_id = 'b9000000-0000-0000-0000-000000000002'$$,
  $$values ('510.00'::text, '80.00'::text)$$, 'CA-E5-14: "todas as despesas" soma tudo (510,00 / 80,00)');
select results_eq($$select month, spent, committed from public.budget_progress('2024-02-01', '2024-02-29') where budget_id = 'b9000000-0000-0000-0000-000000000001'$$,
  $$values ('2024-02-01'::date, '0.00'::text, '0.00'::text)$$, 'CA-E5-14: mês sem movimento aparece com 0,00');
select results_eq($$select month, budget_id from public.budget_progress('2024-03-15', '2024-03-20') where budget_id in ('b9000000-0000-0000-0000-000000000001', 'b9000000-0000-0000-0000-000000000002') order by budget_id$$,
  $$values ('2024-03-01'::date, 'b9000000-0000-0000-0000-000000000001'::uuid), ('2024-03-01'::date, 'b9000000-0000-0000-0000-000000000002'::uuid)$$,
  'CA-E5-14: datas no meio do mês são normalizadas para o dia 1');
select is((select count(*)::int from public.budget_progress('2024-01-01', '2024-12-31') where budget_id = 'b9000000-0000-0000-0000-000000000001'), 12,
  'CA-E5-14: 12 meses são aceitos (12 linhas por orçamento vigente o ano todo)');
select throws_ok($$select * from public.budget_progress('2024-01-01', '2025-01-01')$$, 'P0001', 'INVALID_INPUT', 'CA-E5-14: mais de 12 meses → INVALID_INPUT');
select throws_ok($$select * from public.budget_progress('2024-05-01', '2024-04-01')$$, 'P0001', 'INVALID_INPUT', 'CA-E5-14: início depois do fim → INVALID_INPUT');
select throws_ok($$select * from public.budget_progress(null, '2024-04-01')$$, 'P0001', 'INVALID_INPUT', 'CA-E5-14: parâmetro nulo → INVALID_INPUT');
select results_eq($$select month from public.budget_progress('2024-01-01', '2024-06-01') where budget_id = 'b9000000-0000-0000-0000-000000000003' order by month$$,
  $$values ('2024-03-01'::date), ('2024-04-01'::date)$$, 'CA-E5-14: mês fora da vigência não aparece (vigência mar–abr/2024)');
select ok((select count(*) > 0 from public.budget_progress('2024-01-01', '2024-01-01') where budget_id = 'b9000000-0000-0000-0000-000000000005'),
  'CA-E5-14: orçamento arquivado também aparece');
select is((select pg_typeof(spent)::text || pg_typeof(committed)::text from public.budget_progress('2024-03-01', '2024-03-01') limit 1), 'texttext',
  'CA-E5-14: spent e committed são text');
select tests.login_as('m');
select ok((select count(*) > 0 from public.budget_progress('2024-03-01', '2024-03-01')), 'CA-E5-14: member lê o progresso da família');
select tests.login_as('b');
select is((select count(*)::int from public.budget_progress('2024-01-01', '2024-12-31')), 0, 'CA-E5-14: B (sem orçamentos) não vê os de A');
select tests.login_as('c');
select is((select count(*)::int from public.budget_progress('2024-01-01', '2024-12-31')), 0, 'CA-E5-14: usuário sem família não vê nada');
select tests.login_anon();
select throws_ok($$select * from public.budget_progress('2024-01-01', '2024-01-01')$$, '42501', null, 'CA-E5-14: anon não executa budget_progress');

select * from finish();
rollback;
