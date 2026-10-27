-- CA-E6-13: projected_cash_flow (D15) e private.allocate_cents (D13).
begin;

select no_plan();

select tests.setup_world();
create function tests.mem(p_key text) returns uuid language sql stable as $$
  select id from public.family_members where user_id = tests.uid(p_key) $$;
grant execute on function tests.mem(text) to authenticated;
create function tests.check_splits() returns void language plpgsql as $$
begin set constraints all immediate; set constraints all deferred; end $$;
grant execute on function tests.check_splits() to authenticated;
update public.family_members set joined_at = '2020-01-01' where user_id = tests.uid('a');
update public.family_members set joined_at = '2020-02-01' where user_id = tests.uid('ad');
update public.family_members set joined_at = '2020-03-01' where user_id = tests.uid('m');
insert into public.family_members (family_id, user_id, role, status, joined_at, ended_at)
  values (tests.fid('A'), tests.uid('c'), 'member', 'removed', '2019-01-01', now());
insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a6000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 1000, '2020-01-01', tests.uid('a')),
  ('a6000000-0000-0000-0000-000000000002', tests.fid('A'), 'Poupança', 'savings', 0, '2020-01-01', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c6000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c6000000-0000-0000-0000-000000000002', tests.fid('A'), 'Salário', 'income', 'chart-2', 'briefcase', tests.uid('a'));

select set_config('tests.first', date_trunc('month', private.today()::timestamp)::date::text, true);

-- pendentes: vencidos (1º mês), do mês 2, cancelado, pago e excluído (fora)
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by) values
  ('f6000000-0000-0000-0000-000000000451', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Vencida', 20, private.today() - 5, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000452', tests.fid('A'), 'income', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'Receita vencida', 70, private.today() - 3, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000453', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Mês 2', 30, (current_setting('tests.first')::date + interval '1 month 3 days')::date, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000454', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'A cancelar', 999, (current_setting('tests.first')::date + interval '1 month 4 days')::date, 'pending', tests.uid('a')),
  ('f6000000-0000-0000-0000-000000000455', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Paga', 888, private.today() - 1, 'paid', tests.uid('a'));
update public.transactions set status = 'canceled' where id = 'f6000000-0000-0000-0000-000000000454';
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by, deleted_at, deleted_by) values
  ('f6000000-0000-0000-0000-000000000456', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Excluída', 777, private.today() + 1, 'pending', tests.uid('a'), now(), tests.uid('a'));

-- séries: mensal dia 15 do mês 2 (despesa 100); receita com término no mês 2; paralisada; série já materializada até o mês 2
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, end_date, created_by) values
  ('e6000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Aluguel', 100, 'monthly', (current_setting('tests.first')::date + interval '1 month 14 days')::date, null, tests.uid('a')),
  ('e6000000-0000-0000-0000-000000000002', tests.fid('A'), 'income', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000002', 'Bônus', 50, 'monthly', (current_setting('tests.first')::date + interval '1 month 14 days')::date, (current_setting('tests.first')::date + interval '1 month 20 days')::date, tests.uid('a')),
  ('e6000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Pausada', 999, 'monthly', (current_setting('tests.first')::date + interval '1 month 14 days')::date, null, tests.uid('a')),
  ('e6000000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Já materializada', 7, 'monthly', (current_setting('tests.first')::date - interval '2 months' + interval '4 days')::date, null, tests.uid('a'));
update public.recurrences set is_active = false where id = 'e6000000-0000-0000-0000-000000000003';
update public.recurrences set next_occurrence_date = (current_setting('tests.first')::date + interval '1 month 4 days')::date where id = 'e6000000-0000-0000-0000-000000000004';

select tests.login_as('a');
select is((select count(*)::int from public.projected_cash_flow(12)), 12, 'CA-E6-13: 12 meses presentes');
select is((select min(month)::text from public.projected_cash_flow(12)), current_setting('tests.first'), 'CA-E6-13: começa no mês de hoje');
select is((select count(distinct month)::int from public.projected_cash_flow(12)), 12, 'CA-E6-13: meses distintos');
select is((select pending_expense || '/' || pending_income from public.projected_cash_flow(3) order by month limit 1), '20.00/70.00', 'CA-E6-13: pendentes vencidos entram no 1º mês');
select is((select pending_expense from public.projected_cash_flow(3) order by month offset 1 limit 1), '30.00', 'CA-E6-13: pendente no mês da sua data; cancelado, pago e excluído fora');
select is((select recurring_expense from public.projected_cash_flow(3) order by month limit 1), '0.00', 'CA-E6-13: sem virtual no 1º mês (série começa no mês 2; materializada não repete)');
select is((select recurring_expense from public.projected_cash_flow(3) order by month offset 1 limit 1), '107.00', 'CA-E6-13: mês 2: aluguel 100 + série cujo ponteiro está no mês 2 (7); pausada fora');
select is((select recurring_expense from public.projected_cash_flow(3) order by month offset 2 limit 1), '107.00', 'CA-E6-13: mês 3 repete as séries ativas');
select is((select recurring_income from public.projected_cash_flow(3) order by month offset 1 limit 1), '50.00', 'CA-E6-13: receita recorrente no mês 2');
select is((select recurring_income from public.projected_cash_flow(3) order by month offset 2 limit 1), '0.00', 'CA-E6-13: end_date respeitado (sem ocorrência no mês 3)');
select is((select count(*)::int from public.projected_cash_flow(1)), 1, 'p_months = 1');
select throws_ok($$select * from public.projected_cash_flow(0)$$, 'P0001', 'INVALID_INPUT', 'CA-E6-13: p_months 0');
select throws_ok($$select * from public.projected_cash_flow(13)$$, 'P0001', 'INVALID_INPUT', 'CA-E6-13: p_months 13');
select throws_ok($$select * from public.projected_cash_flow(null)$$, 'P0001', 'INVALID_INPUT', 'CA-E6-13: p_months nulo');
select tests.logout();

-- D13 em SQL (mesma tabela do TS)
select is(private.allocate_cents(100, array[1, 1, 1]), array[33.34, 33.33, 33.33]::numeric[], 'D13: 100,00 / 3');
select is(private.allocate_cents(200, array[1, 1, 1]), array[66.67, 66.67, 66.66]::numeric[], 'D13: 200,00 / 3 (R16)');
select is(private.allocate_cents(1, array[1, 1, 1, 1, 1, 1, 1]), array[0.15, 0.15, 0.14, 0.14, 0.14, 0.14, 0.14]::numeric[], 'D13: 1,00 / 7');
select is(private.allocate_cents(50, array[66.67, 66.67, 66.66]), array[16.67, 16.67, 16.66]::numeric[], 'D13: estorno de 50,00 pelos pesos 66,67/66,67/66,66');
select is(private.allocate_cents(101, array[33.34, 33.33, 33.33]), array[33.68, 33.66, 33.66]::numeric[], 'D13: R17');
select is(private.allocate_cents(0, array[1, 2]), array[0, 0]::numeric[], 'D13: total 0');
select is((select sum(x) from unnest(private.allocate_cents(99999999.99, array[1, 3, 7, 11])) x), 99999999.99, 'D13: Σ = total exato');
select throws_ok($$select private.allocate_cents(-1, array[1])$$, 'P0001', 'INVALID_INPUT', 'D13: total negativo');
select throws_ok($$select private.allocate_cents(1.001, array[1])$$, 'P0001', 'INVALID_INPUT', 'D13: 3 casas');
select throws_ok($$select private.allocate_cents(1, array[0, 0])$$, 'P0001', 'INVALID_INPUT', 'D13: Σ pesos 0');
select throws_ok($$select private.allocate_cents(1, array[-1, 2])$$, 'P0001', 'INVALID_INPUT', 'D13: peso negativo');
select throws_ok($$select private.allocate_cents(1, '{}'::numeric[])$$, 'P0001', 'INVALID_INPUT', 'D13: sem pesos');
select throws_ok($$select private.allocate_cents(null, array[1])$$, 'P0001', 'INVALID_INPUT', 'D13: total nulo');

select * from finish();
rollback;
