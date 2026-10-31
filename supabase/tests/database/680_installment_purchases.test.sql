-- ADR-0040 / D23 / R21 / R22: compra parcelada no cartão. Colunas de grupo fora dos grants, CHECKs de coerência, unicidade da
-- posição, create_installment_purchase (valores D13, datas D12, status por data, validações, idempotência, papéis, família, auditoria,
-- tetos de volume ADR-0033), post_due_installments (lançamento na data, cartão arquivado, família, excluídas) e
-- cancel_installment_remaining (papéis, idempotência). Excluir a compra e editar os dados são UPDATEs diretos (testados aqui).
-- "Hoje" é sempre private.today(): os cenários usam datas relativas, exceto o dia 31, que usa 2025 (passado fixo, sem depender do relógio).
-- Dentro da transação de teste now() não avança: toda linha criada conta na "última hora" da frequência.
begin;

select no_plan();

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, credit_limit,
                             statement_closing_day, statement_due_day, is_active, created_by) values
  ('a6800000-0000-0000-0000-000000000001', tests.fid('A'), 'Cartão A', 'credit_card', 0, '2020-01-01', 5000, 10, 20, true, tests.uid('a')),
  ('a6800000-0000-0000-0000-000000000002', tests.fid('A'), 'Cartão R21', 'credit_card', 0, '2020-01-01', 5000, 10, 20, true, tests.uid('a')),
  ('a6800000-0000-0000-0000-000000000003', tests.fid('A'), 'Cartão arquivado', 'credit_card', 0, '2020-01-01', 5000, 10, 20, false, tests.uid('a')),
  ('a6800000-0000-0000-0000-000000000004', tests.fid('A'), 'Corrente A', 'checking', 0, '2020-01-01', null, null, null, true, tests.uid('a')),
  ('a6800000-0000-0000-0000-000000000005', tests.fid('A'), 'Cartão recente', 'credit_card', 0, private.today() - 10, 5000, 10, 20, true, tests.uid('a')),
  ('a6800000-0000-0000-0000-00000000000b', tests.fid('B'), 'Cartão B', 'credit_card', 0, '2020-01-01', 5000, 10, 20, true, tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c6800000-0000-0000-0000-000000000001', tests.fid('A'), 'Eletrônicos', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c6800000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-2', 'briefcase', tests.uid('a')),
  ('c6800000-0000-0000-0000-00000000000b', tests.fid('B'), 'Eletrônicos B', 'expense', 'chart-1', 'utensils', tests.uid('b'));

-- atalho: compra de teste (rodam com o papel de quem chama; RLS e triggers valem)
create function tests.inst(p_acc uuid, p_cat uuid, p_total numeric, p_n integer, p_date date default null, p_key uuid default null)
returns uuid language sql as $$
  select public.create_installment_purchase(p_acc, p_cat, null, 'Compra teste', p_total, p_n,
                                            coalesce(p_date, private.today()), null, p_key) $$;
grant execute on function tests.inst(uuid, uuid, numeric, integer, date, uuid) to authenticated;

-- 1 · Estrutura e privilégios ------------------------------------------------------------------------------------------------
select has_column('public', 'transactions', 'installment_group_id', 'colunas: installment_group_id existe');
select col_type_is('public', 'transactions', 'installment_group_id', 'uuid', 'colunas: installment_group_id é uuid');
select col_type_is('public', 'transactions', 'installment_number', 'smallint', 'colunas: installment_number é smallint');
select col_type_is('public', 'transactions', 'installment_total', 'smallint', 'colunas: installment_total é smallint');
select ok(not exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.transactions'::regclass and a.attname like 'installment\_%' and a.attnotnull),
  'colunas: as três são anuláveis (instantâneas, sem backfill)');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.transactions'::regclass and attnum > 0 and not attisdropped and attname like 'installment\_%'
      and (has_column_privilege('authenticated', attrelid, attnum, 'INSERT')
        or has_column_privilege('authenticated', attrelid, attnum, 'UPDATE'))),
  null, 'privilégios: nenhuma coluna de parcela está nos grants de insert ou update');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.transactions'::regclass and attnum > 0 and not attisdropped and attname like 'installment\_%'
      and has_column_privilege('authenticated', attrelid, attnum, 'SELECT')),
  array['installment_group_id', 'installment_number', 'installment_total'], 'privilégios: as três são legíveis (select de tabela)');
select ok(not has_table_privilege('anon', 'public.transactions', 'select')
  and not has_any_column_privilege('anon', 'public.transactions', 'select, insert, update'), 'privilégios: anon sem acesso às colunas');
select has_index('public', 'transactions', 'transactions_installment_number_key', 'índice: unicidade (grupo, posição)');
select has_index('public', 'transactions', 'transactions_installment_due_idx', 'índice: parcelas pendentes por família e data');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname in ('create_installment_purchase', 'post_due_installments', 'cancel_installment_remaining')
    and p.prosecdef and coalesce(p.proconfig @> array['search_path=""'], false)),
  3, 'funções: as três RPCs são security definer com search_path vazio');
select ok(not has_function_privilege('anon', 'public.create_installment_purchase(uuid,uuid,uuid,text,numeric,integer,date,text,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.post_due_installments()', 'execute')
  and not has_function_privilege('anon', 'public.cancel_installment_remaining(uuid)', 'execute'),
  'funções: anon sem EXECUTE');
select ok(has_function_privilege('authenticated', 'public.create_installment_purchase(uuid,uuid,uuid,text,numeric,integer,date,text,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.post_due_installments()', 'execute')
  and has_function_privilege('authenticated', 'public.cancel_installment_remaining(uuid)', 'execute'),
  'funções: authenticated executa as três');

select tests.login_anon();
select throws_ok($$select public.create_installment_purchase('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', null, 'x', 10, 2, current_date, null, null)$$,
  '42501', null, 'anon não executa create_installment_purchase');
select throws_ok($$select public.post_due_installments()$$, '42501', null, 'anon não executa post_due_installments');
select throws_ok($$select public.cancel_installment_remaining('d6800000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon não executa cancel_installment_remaining');
select tests.logout();

-- 2 · R21: 100,00 em 3x ------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select set_config('tests.g_r21', tests.inst('a6800000-0000-0000-0000-000000000002', 'c6800000-0000-0000-0000-000000000001', 100.00, 3)::text, true);
select isnt(current_setting('tests.g_r21'), '', 'R21: a RPC devolve o id do grupo');
select results_eq($$select installment_number::int, installment_total::int, amount::text, status, transaction_date
    from public.transactions where installment_group_id = current_setting('tests.g_r21')::uuid order by installment_number$$,
  $$values (1, 3, '33.34', 'paid', private.today()),
           (2, 3, '33.33', 'pending', private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 1)),
           (3, 3, '33.33', 'pending', private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 2))$$,
  'R21: 100,00 em 3x = 33,34 (paga hoje) · 33,33 · 33,33 (pendentes nos meses seguintes)');
select is((select sum(amount)::text from public.transactions where installment_group_id = current_setting('tests.g_r21')::uuid),
  '100.00', 'R21: Σ das parcelas = total');
select results_eq($$select distinct type, account_id, category_id, description, created_by, family_id
    from public.transactions where installment_group_id = current_setting('tests.g_r21')::uuid$$,
  $$values ('expense'::text, 'a6800000-0000-0000-0000-000000000002'::uuid, 'c6800000-0000-0000-0000-000000000001'::uuid,
            'Compra teste'::text, tests.uid('a'), tests.fid('A'))$$,
  'R21: as parcelas são despesas da mesma conta, categoria e descrição, criadas pelo chamador');
select is((select balance from public.account_balances() where account_id = 'a6800000-0000-0000-0000-000000000002'), '-33.34',
  'R21: só a 1ª parcela entra no saldo do cartão (-33,34)');
select results_eq($$select due_date from public.transactions
    where installment_group_id = current_setting('tests.g_r21')::uuid order by installment_number$$,
  $$values (null::date), (private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 1)),
            (private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 2))$$,
  'R21: due_date do trigger existente (paga = nulo; pendentes = a própria data)');
select is((select payable from public.pending_summary()), '66.66', 'R21: "a pagar" = parcelas pendentes (66,66)');

-- R22: 1.000,00 em 6x (compra de hoje) ---------------------------------------------------------------------
select set_config('tests.g_6x', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 1000.00, 6)::text, true);
select results_eq($$select amount::text, count(*)::int from public.transactions
    where installment_group_id = current_setting('tests.g_6x')::uuid group by amount order by amount desc$$,
  $$values ('166.67', 4), ('166.66', 2)$$, 'R22: 1.000,00 em 6x = 166,67 ×4 e 166,66 ×2');
select results_eq($$select amount::text from public.transactions
    where installment_group_id = current_setting('tests.g_6x')::uuid order by installment_number$$,
  $$values ('166.67'), ('166.67'), ('166.67'), ('166.67'), ('166.66'), ('166.66')$$, 'R22: a sobra vai às primeiras parcelas');
select is((select sum(amount)::text from public.transactions where installment_group_id = current_setting('tests.g_6x')::uuid),
  '1000.00', 'R22: Σ = 1.000,00');

-- Compra antiga lançada hoje: as parcelas com data <= hoje já nascem efetivadas (dia 31: 31/01 -> 28/02 -> 31/03) ------------------
select set_config('tests.g_31', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 300.00, 3, '2025-01-31')::text, true);
select results_eq($$select transaction_date, status, amount::text from public.transactions
    where installment_group_id = current_setting('tests.g_31')::uuid order by installment_number$$,
  $$values ('2025-01-31'::date, 'paid', '100.00'), ('2025-02-28'::date, 'paid', '100.00'), ('2025-03-31'::date, 'paid', '100.00')$$,
  'dia 31: 31/01 -> 28/02 -> 31/03 (sem encadear), todas efetivadas por já terem passado');
select is((select count(*)::int from public.transactions where installment_group_id = current_setting('tests.g_31')::uuid and due_date is null),
  3, 'dia 31: parcelas efetivadas na criação não têm due_date');

-- Limites de parcelas: 2 e 36 passam; 0, 1 e 37 não ---------------------------------------------------------------------------------
select set_config('tests.g_2x', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 10.01, 2)::text, true);
select results_eq($$select amount::text from public.transactions where installment_group_id = current_setting('tests.g_2x')::uuid order by installment_number$$,
  $$values ('5.01'), ('5.00')$$, '2x: 10,01 = 5,01 · 5,00');
select set_config('tests.g_36x', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 1234.56, 36)::text, true);
select results_eq($$select count(*)::int, sum(amount)::text, count(*) filter (where amount = 34.30)::int, count(*) filter (where amount = 34.29)::int,
      min(installment_number)::int, max(installment_number)::int, min(installment_total)::int, max(installment_total)::int
    from public.transactions where installment_group_id = current_setting('tests.g_36x')::uuid$$,
  $$values (36, '1234.56', 12, 24, 1, 36, 36, 36)$$, '36x: 36 parcelas, Σ = total, 12 de 34,30 e 24 de 34,29');
select is((select count(*)::int from public.transactions where installment_group_id = current_setting('tests.g_36x')::uuid and status = 'paid'),
  1, '36x: só a 1ª está efetivada');
select set_config('tests.g_cent', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 0.06, 6)::text, true);
select is((select count(*)::int from public.transactions where installment_group_id = current_setting('tests.g_cent')::uuid and amount = 0.01),
  6, 'valor mínimo: 0,06 em 6x = seis parcelas de 0,01');

-- Erros: nada é gravado ----------------------------------------------------------------------------------------------------------
select set_config('tests.cnt', (select count(*)::text from public.transactions), true);
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 0.05, 6)$$,
  'P0001', 'INSTALLMENT_AMOUNT_TOO_SMALL', 'R22: 0,05 em 6x → INSTALLMENT_AMOUNT_TOO_SMALL');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100, 37)$$,
  'P0001', 'INVALID_INPUT', 'R22: 37 parcelas → INVALID_INPUT');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100, 1)$$,
  'P0001', 'INVALID_INPUT', '1 parcela → INVALID_INPUT (à vista segue o caminho de D8)');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100, 0)$$,
  'P0001', 'INVALID_INPUT', '0 parcela → INVALID_INPUT');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100, null)$$,
  'P0001', 'INVALID_INPUT', 'parcelas nulas → INVALID_INPUT');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 0, 3)$$,
  'P0001', 'INVALID_INPUT', 'total 0 → INVALID_INPUT');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', -90, 3)$$,
  'P0001', 'INVALID_INPUT', 'total negativo → INVALID_INPUT');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100.005, 3)$$,
  'P0001', 'INVALID_INPUT', 'total com mais de 2 casas → INVALID_INPUT');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100000000.00, 3)$$,
  'P0001', 'INVALID_INPUT', 'total acima do teto de 99.999.999,99 → INVALID_INPUT');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 'NaN'::numeric, 3)$$,
  'P0001', 'INVALID_INPUT', 'total NaN → INVALID_INPUT');
select throws_ok($$select public.create_installment_purchase('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', null, '   ', 100, 3, private.today(), null, null)$$,
  'P0001', 'INVALID_INPUT', 'descrição em branco → INVALID_INPUT');
select throws_ok($$select public.create_installment_purchase('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', null, repeat('x', 121), 100, 3, private.today(), null, null)$$,
  'P0001', 'INVALID_INPUT', 'descrição com 121 caracteres → INVALID_INPUT');
select throws_ok($$select public.create_installment_purchase('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', null, 'x', 100, 3, private.today(), repeat('n', 1001), null)$$,
  'P0001', 'INVALID_INPUT', 'observações com 1001 caracteres → INVALID_INPUT');
select throws_ok($$select public.create_installment_purchase('a6800000-0000-0000-0000-000000000001', null, null, 'x', 100, 3, private.today(), null, null)$$,
  'P0001', 'INVALID_INPUT', 'categoria nula → INVALID_INPUT');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000004', 'c6800000-0000-0000-0000-000000000001', 100, 2)$$,
  'P0001', 'INSTALLMENT_REQUIRES_CREDIT_CARD', 'R22: 2x em conta corrente → INSTALLMENT_REQUIRES_CREDIT_CARD');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100, 2, private.today() + 1)$$,
  'P0001', 'FUTURE_DATE_NOT_ALLOWED', 'R22: compra datada de amanhã → FUTURE_DATE_NOT_ALLOWED');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000002', 100, 2)$$,
  'P0001', 'CATEGORY_TYPE_MISMATCH', 'categoria de receita → CATEGORY_TYPE_MISMATCH (só despesa)');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000003', 'c6800000-0000-0000-0000-000000000001', 100, 2)$$,
  'P0001', 'ACCOUNT_ARCHIVED', 'cartão arquivado → ACCOUNT_ARCHIVED');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000005', 'c6800000-0000-0000-0000-000000000001', 100, 2, private.today() - 20)$$,
  'P0001', 'DATE_BEFORE_OPENING_BALANCE', 'compra anterior ao saldo inicial do cartão → DATE_BEFORE_OPENING_BALANCE');
select throws_ok($$select tests.inst(gen_random_uuid(), 'c6800000-0000-0000-0000-000000000001', 100, 2)$$,
  'P0001', 'NOT_FOUND', 'conta inexistente → NOT_FOUND');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-00000000000b', 'c6800000-0000-0000-0000-000000000001', 100, 2)$$,
  'P0001', 'NOT_FOUND', 'cartão de outra família → NOT_FOUND');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-00000000000b', 100, 2)$$,
  '23503', null, 'categoria de outra família → 23503 (FK composta)');
select throws_ok($$select public.create_installment_purchase('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', gen_random_uuid(), 'x', 100, 3, private.today(), null, null)$$,
  '23503', null, 'responsável inexistente/de outra família → 23503 (FK composta)');
select is((select count(*)::text from public.transactions), current_setting('tests.cnt'), 'erros: nenhuma linha foi gravada');

-- Sem sessão / sem família -----------------------------------------------------------------------------------------------------------
select tests.login_no_sub();
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100, 2)$$,
  'P0001', 'NOT_AUTHENTICATED', 'sem sub no JWT → NOT_AUTHENTICATED');
select tests.login_as('c');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100, 2)$$,
  '42501', null, 'usuário sem família → 42501');
select throws_ok($$select public.post_due_installments()$$, '42501', null, 'usuário sem família não executa post_due_installments');
select throws_ok($$select public.cancel_installment_remaining('d6800000-0000-0000-0000-000000000001')$$, '42501', null,
  'usuário sem família não executa cancel_installment_remaining');

-- 3 · Idempotência ----------------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select set_config('tests.g_idem', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 600.00, 6,
  null, '91680000-0000-0000-0000-000000000001')::text, true);
select is(tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 600.00, 6,
  null, '91680000-0000-0000-0000-000000000001')::text, current_setting('tests.g_idem'),
  'R22: repetir com a mesma chave devolve o mesmo grupo');
select is((select count(*)::int from public.transactions where installment_group_id = current_setting('tests.g_idem')::uuid), 6,
  'R22: a repetição não criou linhas (continua com 6)');
select is((select count(*)::int from public.transactions where family_id = tests.fid('A') and idempotency_key = '91680000-0000-0000-0000-000000000001'),
  1, 'idempotência: a chave fica só na 1ª parcela');
select is((select installment_number::int from public.transactions where family_id = tests.fid('A') and idempotency_key = '91680000-0000-0000-0000-000000000001'),
  1, 'idempotência: a chave está na parcela 1');
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, idempotency_key)
  values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000004', 'c6800000-0000-0000-0000-000000000001', 'Comum', 5, private.today(), 'paid',
          '91680000-0000-0000-0000-000000000002');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100, 2, null, '91680000-0000-0000-0000-000000000002')$$,
  'P0001', 'INVALID_INPUT', 'chave já usada por um lançamento comum → INVALID_INPUT');
select tests.login_as('b');
select lives_ok($$select public.create_installment_purchase('a6800000-0000-0000-0000-00000000000b', 'c6800000-0000-0000-0000-00000000000b', null, 'Compra B', 90, 3, private.today(), null, '91680000-0000-0000-0000-000000000001')$$,
  'idempotência: a chave é por família (B reaproveita o mesmo uuid)');
select is((select count(*)::int from public.transactions where family_id = tests.fid('B')), 3, 'família B: 3 parcelas da compra de B');

-- 4 · Papéis, família e auditoria ---------------------------------------------------------------------------------------------------
select tests.login_as('m');
select set_config('tests.g_m', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 90.00, 3)::text, true);
select is((select count(*)::int from public.transactions where installment_group_id = current_setting('tests.g_m')::uuid and created_by = tests.uid('m')), 3,
  'papel: member cria compra parcelada (created_by = chamador)');
select tests.login_as('ad');
select set_config('tests.g_ad', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 90.00, 3)::text, true);
select is((select count(*)::int from public.transactions where installment_group_id = current_setting('tests.g_ad')::uuid), 3, 'papel: admin cria compra parcelada');

select tests.logout();
select is((select count(*)::int from public.audit_events where action = 'transaction.installments_created'
    and metadata ->> 'group_id' = current_setting('tests.g_r21')), 1, 'auditoria: um evento por grupo (R21)');
select is((select (select array_agg(k order by k) from jsonb_object_keys(e.metadata) k) from public.audit_events e
    where e.action = 'transaction.installments_created' and e.metadata ->> 'group_id' = current_setting('tests.g_r21')),
  array['first_date', 'group_id', 'installment_total', 'total_amount'], 'auditoria: metadata mínima (sem descrição nem notas)');
select results_eq($$select e.metadata ->> 'installment_total', e.metadata ->> 'total_amount', e.metadata ->> 'first_date', e.family_id, e.actor_user_id,
      e.entity_id = (select t.id from public.transactions t where t.installment_group_id = current_setting('tests.g_r21')::uuid and t.installment_number = 1)
    from public.audit_events e where e.action = 'transaction.installments_created' and e.metadata ->> 'group_id' = current_setting('tests.g_r21')$$,
  $$values ('3'::text, '100.00'::text, to_char(private.today(), 'YYYY-MM-DD'), tests.fid('A'), tests.uid('a'), true)$$,
  'auditoria: total de parcelas, total em texto, 1ª data, ator e entidade = 1ª parcela');
select is((select count(*)::int from public.audit_events where action = 'transaction.installments_created' and family_id = tests.fid('A')), 9,
  'auditoria: 9 grupos de A criados até aqui, um evento cada');

-- 5 · Colunas sem grant e CHECKs de coerência -------------------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok($$update public.transactions set installment_total = 5 where installment_group_id = current_setting('tests.g_r21')::uuid$$,
  '42501', null, 'grant: installment_total não é atualizável');
select throws_ok($$update public.transactions set installment_number = 5 where installment_group_id = current_setting('tests.g_r21')::uuid$$,
  '42501', null, 'grant: installment_number não é atualizável');
select throws_ok($$update public.transactions set installment_group_id = null where installment_group_id = current_setting('tests.g_r21')::uuid$$,
  '42501', null, 'grant: installment_group_id não é atualizável');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status,
    installment_group_id, installment_number, installment_total)
  values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 'Forjada', 1, private.today(), 'paid',
          gen_random_uuid(), 1, 2)$$, '42501', null, 'grant: insert direto com colunas de grupo → 42501');

select tests.logout();
-- (como dono do banco, que ignora os grants: o CHECK e a unicidade valem para qualquer caminho)
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, created_by, description, amount, transaction_date, status,
    installment_group_id) values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', tests.uid('a'),
    'x', 1, private.today(), 'paid', gen_random_uuid())$$, '23514', null, 'CHECK: grupo sem posição e total → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, created_by, description, amount, transaction_date, status,
    installment_number, installment_total) values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', tests.uid('a'),
    'x', 1, private.today(), 'paid', 1, 2)$$, '23514', null, 'CHECK: posição e total sem grupo → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, created_by, description, amount, transaction_date, status,
    installment_group_id, installment_number, installment_total) values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', tests.uid('a'),
    'x', 1, private.today(), 'paid', gen_random_uuid(), 1, 1)$$, '23514', null, 'CHECK: total 1 → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, created_by, description, amount, transaction_date, status,
    installment_group_id, installment_number, installment_total) values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', tests.uid('a'),
    'x', 1, private.today(), 'paid', gen_random_uuid(), 1, 37)$$, '23514', null, 'CHECK: total 37 → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, created_by, description, amount, transaction_date, status,
    installment_group_id, installment_number, installment_total) values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', tests.uid('a'),
    'x', 1, private.today(), 'paid', gen_random_uuid(), 0, 3)$$, '23514', null, 'CHECK: posição 0 → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, created_by, description, amount, transaction_date, status,
    installment_group_id, installment_number, installment_total) values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', tests.uid('a'),
    'x', 1, private.today(), 'paid', gen_random_uuid(), 4, 3)$$, '23514', null, 'CHECK: posição maior que o total → 23514');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, created_by, description, amount, transaction_date, status,
    installment_group_id, installment_number, installment_total) values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', tests.uid('a'),
    'x', 1, private.today(), 'paid', 'd6800000-0000-0000-0000-0000000000f1', 2, 2)$$, 'CHECK: linha coerente (2 de 2) é aceita');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, created_by, description, amount, transaction_date, status,
    installment_group_id, installment_number, installment_total) values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', tests.uid('a'),
    'x', 1, private.today(), 'paid', 'd6800000-0000-0000-0000-0000000000f1', 2, 2)$$, '23505', null, 'unicidade: (grupo, posição) repetida → 23505');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, created_by, description, amount, transaction_date, status)
    values (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', tests.uid('a'), 'a', 1, private.today(), 'paid'),
           (tests.fid('A'), 'expense', 'a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', tests.uid('a'), 'b', 1, private.today(), 'paid')$$,
  'unicidade: várias linhas sem grupo convivem (NULLs não colidem)');

-- 6 · post_due_installments ---------------------------------------------------------------------------------------------------------------
-- Cria o grupo como 'a' e antecipa a data da parcela 2 como dono do banco (não dá para avançar o relógio da transação).
select tests.login_as('a');
select set_config('tests.g_due', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 90.00, 3)::text, true);
select tests.logout();
update public.transactions set transaction_date = private.today() - 1
  where installment_group_id = current_setting('tests.g_due')::uuid and installment_number = 2;
select tests.login_as('a');
select is(public.post_due_installments(), 1, 'post_due: lança 1 parcela cuja data chegou');
select results_eq($$select installment_number::int, status, transaction_date from public.transactions
    where installment_group_id = current_setting('tests.g_due')::uuid order by installment_number$$,
  $$values (1, 'paid', private.today()), (2, 'paid', private.today() - 1),
           (3, 'pending', private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 2))$$,
  'post_due: a parcela 2 virou paid mantendo a data; a 3 segue pendente');
select is(public.post_due_installments(), 0, 'post_due: 2ª chamada não faz nada (idempotente)');
select tests.logout();
select is((select count(*)::int from public.audit_events where action = 'transaction.paid'
    and entity_id = (select t.id from public.transactions t where t.installment_group_id = current_setting('tests.g_due')::uuid and t.installment_number = 2)),
  1, 'post_due: o trigger existente grava um transaction.paid');

-- cartão arquivado: a parcela fica pendente e volta a ser lançada depois da reativação
update public.transactions set transaction_date = private.today() - 2
  where installment_group_id = current_setting('tests.g_due')::uuid and installment_number = 3;
update public.accounts set is_active = false where id = 'a6800000-0000-0000-0000-000000000001';
select tests.login_as('a');
select is(public.post_due_installments(), 0, 'post_due: cartão arquivado → nada é lançado');
select is((select status from public.transactions where installment_group_id = current_setting('tests.g_due')::uuid and installment_number = 3),
  'pending', 'post_due: a parcela do cartão arquivado segue pendente');
select tests.logout();
update public.accounts set is_active = true where id = 'a6800000-0000-0000-0000-000000000001';
select tests.login_as('a');
select is(public.post_due_installments(), 1, 'post_due: reativado o cartão, a parcela é lançada');
select is((select status from public.transactions where installment_group_id = current_setting('tests.g_due')::uuid and installment_number = 3),
  'paid', 'post_due: a parcela 3 virou paid');

-- só a família do chamador; excluídas e canceladas ficam de fora
select set_config('tests.g_q', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 40.00, 2)::text, true);
select tests.logout();
update public.transactions set transaction_date = private.today() - 1
  where installment_group_id = current_setting('tests.g_q')::uuid and installment_number = 2;
select tests.login_as('b');
select is(public.post_due_installments(), 0, 'post_due: outra família não lança parcelas de A');
select is((select count(*)::int from public.transactions where family_id = tests.fid('B') and status = 'pending'), 2,
  'post_due: as parcelas pendentes de B não foram tocadas');
select tests.login_as('a');
select is(tests.affected($$update public.transactions set deleted_at = now() where installment_group_id = current_setting('tests.g_q')::uuid and installment_number = 2$$),
  1, 'post_due: (preparo) a parcela vencida é excluída logicamente');
select is(public.post_due_installments(), 0, 'post_due: parcela excluída não é lançada');
select tests.logout();
select is((select status from public.transactions where installment_group_id = current_setting('tests.g_q')::uuid and installment_number = 2),
  'pending', 'post_due: a parcela excluída segue pendente');
select tests.login_as('m');
select is(public.post_due_installments(), 0, 'post_due: member também executa (sem parcelas vencidas elegíveis, devolve 0)');

-- 7 · cancel_installment_remaining e papéis ------------------------------------------------------------------------------------------------
select tests.login_as('a');
select set_config('tests.g_c', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 100.00, 3)::text, true);
select tests.login_as('m');
select throws_ok($$select public.cancel_installment_remaining(current_setting('tests.g_c')::uuid)$$, '42501', null,
  'cancel: member que não é o autor → 42501');
select tests.login_as('b');
select throws_ok($$select public.cancel_installment_remaining(current_setting('tests.g_c')::uuid)$$, 'P0001', 'NOT_FOUND',
  'cancel: outra família → NOT_FOUND');
select throws_ok($$select public.cancel_installment_remaining(gen_random_uuid())$$, 'P0001', 'NOT_FOUND', 'cancel: grupo inexistente → NOT_FOUND');
select throws_ok($$select public.cancel_installment_remaining(null)$$, 'P0001', 'INVALID_INPUT', 'cancel: grupo nulo → INVALID_INPUT');
select tests.login_as('a');
select is(public.cancel_installment_remaining(current_setting('tests.g_c')::uuid), 2, 'cancel: o autor/dono cancela as 2 parcelas pendentes');
select results_eq($$select installment_number::int, status from public.transactions
    where installment_group_id = current_setting('tests.g_c')::uuid order by installment_number$$,
  $$values (1, 'paid'), (2, 'canceled'), (3, 'canceled')$$, 'cancel: a efetivada fica; as pendentes viram canceled; o grupo segue com 3 linhas');
select is(public.cancel_installment_remaining(current_setting('tests.g_c')::uuid), 0, 'cancel: idempotente (2ª chamada devolve 0)');
select is((select balance from public.account_balances() where account_id = 'a6800000-0000-0000-0000-000000000002'), '-33.34',
  'cancel: o saldo do cartão R21 não foi afetado por cancelamentos de outros grupos');
select tests.logout();
select is((select count(*)::int from public.audit_events where action = 'transaction.canceled'
    and entity_id in (select id from public.transactions where installment_group_id = current_setting('tests.g_c')::uuid)),
  2, 'cancel: o trigger existente grava um transaction.canceled por parcela');

-- o autor member cancela a própria compra; o admin cancela a de outro
select tests.login_as('m');
select is(public.cancel_installment_remaining(current_setting('tests.g_m')::uuid), 2, 'cancel: member cancela a própria compra');
select tests.login_as('m');
select set_config('tests.g_m2', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 60.00, 3)::text, true);
select tests.login_as('ad');
select is(public.cancel_installment_remaining(current_setting('tests.g_m2')::uuid), 2, 'cancel: admin cancela a compra de outro integrante');

-- R21 final: depois de cancelar as futuras, o dono ainda vê o grupo inteiro
select tests.login_as('a');
select is(public.cancel_installment_remaining(current_setting('tests.g_r21')::uuid), 2, 'R21: cancelar as parcelas futuras do cartão R21');
select is((select count(*)::int from public.transactions where installment_group_id = current_setting('tests.g_r21')::uuid), 3,
  'R21: 3 linhas no grupo depois do cancelamento');
select is((select count(*)::int from public.transactions where installment_group_id = current_setting('tests.g_r21')::uuid and status = 'pending'), 0,
  'R21: sem parcelas pendentes no grupo (a pagar do grupo = 0,00)');

-- 8 · Excluir e editar a compra por UPDATE direto (sem RPC) ----------------------------------------------------------------------------------
select throws_ok($$update public.transactions set deleted_at = now() where installment_group_id = current_setting('tests.g_c')::uuid$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'excluir: incluir uma parcela cancelada na instrução falha (cancelada é imutável) e nada muda');
select is(tests.affected($$update public.transactions set deleted_at = now() where installment_group_id = current_setting('tests.g_c')::uuid and status <> 'canceled'$$),
  1, 'excluir: excluindo só as não canceladas, 1 linha (a parcela 1 efetivada)');

select set_config('tests.g_e', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 90.00, 3)::text, true);
select is(tests.affected($$update public.transactions set description = 'Compra editada', notes = 'obs' where installment_group_id = current_setting('tests.g_e')::uuid and status <> 'canceled'$$),
  3, 'editar: descrição e observações do grupo inteiro numa só instrução');
select is((select count(distinct description)::int from public.transactions where installment_group_id = current_setting('tests.g_e')::uuid), 1,
  'editar: todas as parcelas ficaram com a mesma descrição');
select is(tests.affected($$update public.transactions set deleted_at = now() where installment_group_id = current_setting('tests.g_e')::uuid and status <> 'canceled' and deleted_at is null$$),
  3, 'excluir: a compra inteira (3 linhas) é excluída por UPDATE direto');
select is((select count(*)::int from public.transactions where installment_group_id = current_setting('tests.g_e')::uuid and deleted_at is not null), 3,
  'excluir: as 3 linhas estão excluídas logicamente');
select throws_ok($$select public.cancel_installment_remaining(current_setting('tests.g_e')::uuid)$$, 'P0001', 'NOT_FOUND',
  'cancel: compra toda excluída → NOT_FOUND');

-- estorno ativo bloqueia a exclusão da compra, atomicamente
select set_config('tests.g_r', tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 90.00, 3)::text, true);
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
  select family_id, 'expense', account_id, category_id, 'Estorno parcial', 10, private.today(), id
  from public.transactions where installment_group_id = current_setting('tests.g_r')::uuid and installment_number = 1;
select throws_ok($$update public.transactions set deleted_at = now() where installment_group_id = current_setting('tests.g_r')::uuid and status <> 'canceled'$$,
  'P0001', 'TRANSACTION_HAS_REVERSALS', 'excluir: parcela com estorno ativo → TRANSACTION_HAS_REVERSALS');
select is((select count(*)::int from public.transactions where installment_group_id = current_setting('tests.g_r')::uuid and deleted_at is not null), 0,
  'excluir: a instrução é atômica (nenhuma parcela do grupo foi excluída)');
select tests.logout();

-- 9 · Tetos de volume (ADR-0033): cada parcela conta ------------------------------------------------------------------------------------------
update private.volume_limits
  set max_active = (select count(*) from public.transactions where family_id = tests.fid('A') and deleted_at is null) + 2, max_per_hour = 0
  where kind = 'transactions';
select set_config('tests.cnt', (select count(*)::text from public.transactions where family_id = tests.fid('A')), true);
select tests.login_as('a');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 90.00, 3)$$,
  'P0001', 'VOLUME_LIMIT_REACHED', 'volume: 3 parcelas com 2 vagas → VOLUME_LIMIT_REACHED');
select tests.logout();
select is((select count(*)::text from public.transactions where family_id = tests.fid('A')), current_setting('tests.cnt'),
  'volume: a negação não gravou nenhuma parcela (compra atômica)');
select tests.login_as('a');
select lives_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 90.00, 2)$$,
  'volume: 2 parcelas com 2 vagas passam');
select tests.logout();

update private.volume_limits set max_active = 100000,
  max_per_hour = (select count(*) from public.transactions where created_by = tests.uid('a') and created_at > now() - interval '1 hour' and recurrence_id is null) + 2
  where kind = 'transactions';
select set_config('tests.cnt', (select count(*)::text from public.transactions where family_id = tests.fid('A')), true);
select tests.login_as('a');
select throws_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 90.00, 3)$$,
  'P0001', 'RATE_LIMITED', 'frequência: 3 parcelas com 2 vagas por hora → RATE_LIMITED');
select tests.logout();
select is((select count(*)::text from public.transactions where family_id = tests.fid('A')), current_setting('tests.cnt'),
  'frequência: a negação não gravou nenhuma parcela');
select tests.login_as('ad');
select lives_ok($$select tests.inst('a6800000-0000-0000-0000-000000000001', 'c6800000-0000-0000-0000-000000000001', 90.00, 3)$$,
  'frequência: outro integrante (ad) não é afetado pelo teto de a, que já está acima da base');

select * from finish();
rollback;
