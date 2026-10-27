-- CA-E5-05 (pagar), CA-E5-06 (cancelar), CA-E5-07 (status/due_date/colunas do banco) e a máquina de estados do trigger.
-- Os valores exatos de R3 e R12 estão em 360. "Pagamentos concorrentes" é coberto pelo lock FOR UPDATE + transição:
-- numa só sessão, o segundo pagamento sobre a mesma linha falha com INVALID_STATUS_TRANSITION.
begin;

select plan(58);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, is_active, created_by) values
  ('a6000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 1000, '2020-01-01', true, tests.uid('a')),
  ('a6000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2020-01-01', true, tests.uid('a')),
  ('a6000000-0000-0000-0000-000000000004', tests.fid('A'), 'Arquivada', 'cash', 0, '2020-01-01', false, tests.uid('a')),
  ('a6000000-0000-0000-0000-000000000005', tests.fid('A'), 'Nova', 'cash', 0, private.today() - 5, true, tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c6000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c6000000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-2', 'briefcase', tests.uid('a'));
select set_config('tests.mem_m', (select id::text from public.family_members where user_id = tests.uid('m')), true);
insert into public.budgets (id, family_id, category_id, amount_limit, start_month, created_by) values
  ('b6000000-0000-0000-0000-000000000001', tests.fid('A'), 'c6000000-0000-0000-0000-000000000001', 500, '2020-01-01', tests.uid('a'));

insert into public.transactions (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f6000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', null, 'T1 vencida', 80, private.today() - 1, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', current_setting('tests.mem_m')::uuid, 'T2 do responsável', 30, private.today() + 3, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', null, 'T3 alheia', 20, private.today() + 3, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', null, 'T4 do autor', 15, private.today() + 3, 'pending', tests.uid('m')),
  ('f6000000-0000-0000-0000-000000000005', tests.fid('A'), 'income', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', null, 'T5 receita', 1000, private.today() + 2, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000006', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', null, 'T6 falhas', 60, private.today() + 4, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000007', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', null, 'T7 pago no passado', 25, private.today() - 8, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000008', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', null, 'T8 excluída', 10, private.today(), 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000009', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', null, 'T9 cancelada', 777.77, private.today(), 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000010', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', current_setting('tests.mem_m')::uuid, 'T10 responsável', 11, private.today() + 3, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000011', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', null, 'T11 do admin cancelar', 12, private.today() + 3, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000012', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', null, 'T12 do autor cancelar', 13, private.today() + 3, 'pending', tests.uid('m'));

-- CA-E5-07 · colunas do banco e due_date -------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok($$update public.transactions set status = 'paid' where id = 'f6000000-0000-0000-0000-000000000006'$$, '42501', null,
  'CA-E5-07: update de status por authenticated → 42501');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, due_date)
  values (tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Com vencimento', 1, private.today(), 'pending', private.today())$$,
  '42501', null, 'CA-E5-07: insert com due_date → 42501');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, recurrence_id)
  values (tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Com série', 1, private.today(), gen_random_uuid())$$,
  '42501', null, 'CA-E5-07: insert com recurrence_id → 42501');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, occurrence_date)
  values (tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Com ocorrência', 1, private.today(), private.today())$$,
  '42501', null, 'CA-E5-07: insert com occurrence_date → 42501');
select throws_ok($$update public.transactions set due_date = private.today() where id = 'f6000000-0000-0000-0000-000000000006'$$, '42501', null,
  'CA-E5-07: update de due_date → 42501');
select throws_ok($$insert into public.transactions (family_id, type, account_id, destination_account_id, description, amount, transaction_date, status)
  values (tests.fid('A'), 'transfer', 'a6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000002', 'Transf pendente', 1, private.today() + 1, 'pending')$$,
  '23514', null, 'CA-E5-07: transferência pendente → 23514');
select lives_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status)
  values (tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Pendente nova', 5, private.today() + 9, 'pending'),
         (tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Paga nova', 6, private.today(), 'paid')$$,
  'CA-E5-07: insere um pendente e um pago');
select ok((select due_date = transaction_date from public.transactions where description = 'Pendente nova'),
  'CA-E5-07: insert pendente → due_date = transaction_date');
select ok((select due_date is null from public.transactions where description = 'Paga nova'), 'CA-E5-07: insert pago → due_date nulo');
update public.transactions set transaction_date = private.today() + 12 where description = 'Pendente nova';
select ok((select due_date = private.today() + 12 from public.transactions where description = 'Pendente nova'),
  'CA-E5-07: due_date acompanha a edição da data enquanto pendente');
select ok((select due_date = private.today() - 1 from public.transactions where id = 'f6000000-0000-0000-0000-000000000001'),
  'CA-E5-07: pendente de fixture tem due_date = transaction_date');

-- CA-E5-05 · pagar -----------------------------------------------------------------------------------------------------
select set_config('tests.cnt', (select count(*)::text from public.transactions), true);
select set_config('tests.bal', (select balance from public.account_balances(private.today()) where account_id = 'a6000000-0000-0000-0000-000000000001'), true);
select lives_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000001', private.today(), 85, 'a6000000-0000-0000-0000-000000000001')$$,
  'CA-E5-05: owner paga com valor real e data de hoje');
select results_eq($$select status, transaction_date, amount, due_date from public.transactions where id = 'f6000000-0000-0000-0000-000000000001'$$,
  $$select 'paid'::text, private.today(), 85.00::numeric, private.today() - 1$$,
  'CA-E5-05: a mesma linha vira paid, data = pagamento, valor real, due_date preservado');
select is((select count(*)::text from public.transactions), current_setting('tests.cnt'), 'CA-E5-05: contagem de linhas igual (mesma linha)');
select is((select balance::numeric from public.account_balances(private.today()) where account_id = 'a6000000-0000-0000-0000-000000000001'),
  current_setting('tests.bal')::numeric - 85, 'CA-E5-05: saldo da conta reduz pelo valor pago');
select is((select count(*)::int from public.audit_events where entity_id = 'f6000000-0000-0000-0000-000000000001' and action = 'transaction.paid'), 1,
  'CA-E5-05: transaction.paid auditado');
select is((select count(*)::int from public.audit_events where entity_id = 'f6000000-0000-0000-0000-000000000001' and action = 'transaction.updated'), 0,
  'CA-E5-05: sem transaction.updated na mesma transição');
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000001', private.today(), 85, 'a6000000-0000-0000-0000-000000000001')$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E5-05: segundo pagamento da mesma linha → INVALID_STATUS_TRANSITION');
select lives_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000007', private.today() - 3, 25, 'a6000000-0000-0000-0000-000000000002')$$,
  'CA-E5-05: paga com data passada e outra conta');
select results_eq($$select transaction_date, due_date, account_id from public.transactions where id = 'f6000000-0000-0000-0000-000000000007'$$,
  $$select private.today() - 3, private.today() - 8, 'a6000000-0000-0000-0000-000000000002'::uuid$$,
  'CA-E5-05: data de pagamento, vencimento original preservado, conta ajustada');

-- falhas da própria RPC / trigger (T6 permanece pendente)
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000006', private.today() + 1, 60, 'a6000000-0000-0000-0000-000000000001')$$,
  'P0001', 'FUTURE_DATE_NOT_ALLOWED', 'CA-E5-05: data futura → FUTURE_DATE_NOT_ALLOWED');
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000006', private.today() - 10, 60, 'a6000000-0000-0000-0000-000000000005')$$,
  'P0001', 'DATE_BEFORE_OPENING_BALANCE', 'CA-E5-05: antes do saldo inicial → DATE_BEFORE_OPENING_BALANCE');
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000006', private.today(), 60, 'a6000000-0000-0000-0000-000000000004')$$,
  'P0001', 'ACCOUNT_ARCHIVED', 'CA-E5-05: conta arquivada → ACCOUNT_ARCHIVED');
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000006', private.today(), 0, 'a6000000-0000-0000-0000-000000000001')$$,
  'P0001', 'INVALID_INPUT', 'CA-E5-05: p_amount 0 → INVALID_INPUT');
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000006', private.today(), null, 'a6000000-0000-0000-0000-000000000001')$$,
  'P0001', 'INVALID_INPUT', 'CA-E5-05: p_amount nulo → INVALID_INPUT');
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000006', null, 60, 'a6000000-0000-0000-0000-000000000001')$$,
  'P0001', 'INVALID_INPUT', 'CA-E5-05: p_paid_on nulo → INVALID_INPUT');
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000006', private.today(), 100000000, 'a6000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'CA-E5-05: valor acima do teto → 23514');
select is((select status from public.transactions where id = 'f6000000-0000-0000-0000-000000000006'), 'pending',
  'CA-E5-05: as tentativas que falharam não alteraram a linha');
select throws_ok($$select public.pay_pending_transaction(gen_random_uuid(), private.today(), 1, 'a6000000-0000-0000-0000-000000000001')$$,
  'P0001', 'NOT_FOUND', 'CA-E5-05: id inexistente → NOT_FOUND');
update public.transactions set deleted_at = now() where id = 'f6000000-0000-0000-0000-000000000008';
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000008', private.today(), 10, 'a6000000-0000-0000-0000-000000000001')$$,
  'P0001', 'NOT_FOUND', 'CA-E5-05: lançamento excluído → NOT_FOUND');

-- papéis
select tests.login_as('ad');
select lives_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000005', private.today(), 1000, 'a6000000-0000-0000-0000-000000000001')$$,
  'CA-E5-05: admin paga (receita)');
select tests.login_as('m');
select lives_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000002', private.today(), 30, 'a6000000-0000-0000-0000-000000000001')$$,
  'CA-E5-05: responsável (não autor) paga');
select lives_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000004', private.today(), 15, 'a6000000-0000-0000-0000-000000000001')$$,
  'CA-E5-05: autor (member) paga');
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000003', private.today(), 20, 'a6000000-0000-0000-0000-000000000001')$$,
  '42501', 'FORBIDDEN', 'CA-E5-05: outro member (nem autor nem responsável) → 42501');
select is((select status from public.transactions where id = 'f6000000-0000-0000-0000-000000000003'), 'pending', 'CA-E5-05: a linha negada continua pendente');

-- sem sessão / sem família
select tests.login_no_sub();
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000003', private.today(), 20, 'a6000000-0000-0000-0000-000000000001')$$,
  'P0001', 'NOT_AUTHENTICATED', 'CA-E5-05: sem auth.uid() → NOT_AUTHENTICATED');
select throws_ok($$select public.cancel_pending_transaction('f6000000-0000-0000-0000-000000000003')$$,
  'P0001', 'NOT_AUTHENTICATED', 'CA-E5-06: cancelar sem auth.uid() → NOT_AUTHENTICATED');
select tests.login_as('c');
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000003', private.today(), 20, 'a6000000-0000-0000-0000-000000000001')$$,
  '42501', 'FORBIDDEN', 'CA-E5-05: usuário sem família → FORBIDDEN');
select throws_ok($$select public.cancel_pending_transaction('f6000000-0000-0000-0000-000000000003')$$,
  '42501', 'FORBIDDEN', 'CA-E5-06: cancelar sem família → FORBIDDEN');

-- CA-E5-06 · cancelar --------------------------------------------------------------------------------------------------
select tests.login_as('m');
select throws_ok($$select public.cancel_pending_transaction('f6000000-0000-0000-0000-000000000010')$$,
  '42501', 'FORBIDDEN', 'CA-E5-06: responsável que não é autor não cancela → 42501');
select lives_ok($$select public.cancel_pending_transaction('f6000000-0000-0000-0000-000000000012')$$, 'CA-E5-06: autor (member) cancela');
select tests.login_as('ad');
select lives_ok($$select public.cancel_pending_transaction('f6000000-0000-0000-0000-000000000011')$$, 'CA-E5-06: admin cancela');

select tests.login_as('a');
select set_config('tests.snap',
  (select string_agg(balance, ',' order by account_id) from public.account_balances(private.today()))
  || '|' || (select expense from public.period_summary(date_trunc('month', private.today()::timestamp)::date, private.today()))
  || '|' || coalesce((select string_agg(amount, ',' order by category_id) from public.category_totals(date_trunc('month', private.today()::timestamp)::date, private.today(), 'expense')), '')
  || '|' || (select string_agg(expense, ',' order by month) from public.monthly_cash_flow(date_trunc('month', private.today()::timestamp)::date, private.today())), true);
select set_config('tests.payable', (select payable from public.pending_summary()), true);
select set_config('tests.committed', (select committed from public.budget_progress(date_trunc('month', private.today()::timestamp)::date, date_trunc('month', private.today()::timestamp)::date)), true);
select set_config('tests.spent', (select spent from public.budget_progress(date_trunc('month', private.today()::timestamp)::date, date_trunc('month', private.today()::timestamp)::date)), true);
select lives_ok($$select public.cancel_pending_transaction('f6000000-0000-0000-0000-000000000009')$$, 'CA-E5-06: owner cancela');
select is(
  (select string_agg(balance, ',' order by account_id) from public.account_balances(private.today()))
  || '|' || (select expense from public.period_summary(date_trunc('month', private.today()::timestamp)::date, private.today()))
  || '|' || coalesce((select string_agg(amount, ',' order by category_id) from public.category_totals(date_trunc('month', private.today()::timestamp)::date, private.today(), 'expense')), '')
  || '|' || (select string_agg(expense, ',' order by month) from public.monthly_cash_flow(date_trunc('month', private.today()::timestamp)::date, private.today())),
  current_setting('tests.snap'),
  'CA-E5-06: cancelado fora de account_balances, period_summary, category_totals e monthly_cash_flow');
select is((select payable::numeric from public.pending_summary()), current_setting('tests.payable')::numeric - 777.77,
  'CA-E5-06: cancelado sai de pending_summary');
select is((select committed::numeric from public.budget_progress(date_trunc('month', private.today()::timestamp)::date, date_trunc('month', private.today()::timestamp)::date)),
  current_setting('tests.committed')::numeric - 777.77, 'CA-E5-06: cancelado sai do comprometido de budget_progress');
select is((select spent from public.budget_progress(date_trunc('month', private.today()::timestamp)::date, date_trunc('month', private.today()::timestamp)::date)),
  current_setting('tests.spent'), 'CA-E5-06: realizado de budget_progress não muda');
select is((select count(*)::int from public.audit_events where action = 'transaction.canceled'), 3, 'CA-E5-06: transaction.canceled auditado (3 cancelamentos)');
select throws_ok($$update public.transactions set description = 'Editada' where id = 'f6000000-0000-0000-0000-000000000009'$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E5-06: update em linha cancelada → INVALID_STATUS_TRANSITION');
select throws_ok($$update public.transactions set deleted_at = now() where id = 'f6000000-0000-0000-0000-000000000009'$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E5-06: nem a exclusão lógica de linha cancelada');
select throws_ok($$select public.cancel_pending_transaction('f6000000-0000-0000-0000-000000000009')$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E5-06: cancelar cancelado → INVALID_STATUS_TRANSITION');
select throws_ok($$select public.cancel_pending_transaction('f6000000-0000-0000-0000-000000000001')$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E5-06: cancelar pago → INVALID_STATUS_TRANSITION');
select throws_ok($$select public.pay_pending_transaction('f6000000-0000-0000-0000-000000000009', private.today(), 1, 'a6000000-0000-0000-0000-000000000001')$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'CA-E5-05: pagar cancelado → INVALID_STATUS_TRANSITION');
select throws_ok($$select public.cancel_pending_transaction(gen_random_uuid())$$,
  'P0001', 'NOT_FOUND', 'CA-E5-06: cancelar inexistente → NOT_FOUND');

-- máquina de estados no trigger (contra um definer com defeito: papel postgres, sem RPC)
select tests.logout();
select throws_ok($$update public.transactions set status = 'paid' where id = 'f6000000-0000-0000-0000-000000000009'$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'trigger: canceled → paid barrado');
select throws_ok($$update public.transactions set status = 'pending' where id = 'f6000000-0000-0000-0000-000000000001'$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'trigger: paid → pending barrado');
select throws_ok($$update public.transactions set status = 'canceled' where id = 'f6000000-0000-0000-0000-000000000001'$$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'trigger: paid → canceled barrado');
select throws_ok($$update public.transactions set status = 'paid', transaction_date = private.today() + 2 where id = 'f6000000-0000-0000-0000-000000000006'$$,
  'P0001', 'FUTURE_DATE_NOT_ALLOWED', 'trigger: pending → paid com data futura barrado mesmo sem RPC');

select * from finish();
rollback;
