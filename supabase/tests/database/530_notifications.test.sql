-- CA-E7-07 (AB-115): refresh_notifications. Cada tipo para os destinatários certos, dedupe_key e data do contrato, idempotência,
-- limites (79%/80%, 3/4 dias, 30/31 dias), "desde", isolamento entre famílias, teto de 100 e limpeza.
begin;

select no_plan();

select tests.setup_world();
create function tests.mem(p_key text) returns uuid language sql stable as $$
  select id from public.family_members where user_id = tests.uid(p_key)
  order by (status = 'active') desc, joined_at desc limit 1 $$;
grant execute on function tests.mem(text) to authenticated;
update public.family_members set joined_at = '2020-01-01' where user_id in (tests.uid('a'), tests.uid('ad'), tests.uid('m'), tests.uid('b'));
-- c entrou agora (member); d entrou há 40 dias (fora da janela "desde" de quem já estava)
insert into public.family_members (family_id, user_id, role) values (tests.fid('A'), tests.uid('c'), 'member');
insert into public.family_members (family_id, user_id, role, joined_at) values (tests.fid('A'), tests.uid('d'), 'member', now() - interval '40 days');
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_ad', tests.mem('ad')::text, true);
select set_config('tests.mem_m', tests.mem('m')::text, true);
select set_config('tests.mem_c', tests.mem('c')::text, true);

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a7530000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2020-01-01', tests.uid('a')),
  ('a7530000-0000-0000-0000-0000000000b1', tests.fid('B'), 'Conta B', 'checking', 0, '2020-01-01', tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c7530000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c7530000-0000-0000-0000-000000000002', tests.fid('A'), 'Transporte', 'expense', 'chart-2', 'car', tests.uid('a')),
  ('c7530000-0000-0000-0000-000000000003', tests.fid('A'), 'Outros', 'expense', 'chart-3', 'tag', tests.uid('a')),
  ('c7530000-0000-0000-0000-000000000004', tests.fid('A'), 'Salário', 'income', 'chart-4', 'briefcase', tests.uid('a')),
  ('c7530000-0000-0000-0000-0000000000b1', tests.fid('B'), 'Outros B', 'expense', 'chart-1', 'tag', tests.uid('b'));

-- compromissos (pending). A = account/category de A; datas relativas a hoje.
insert into public.transactions (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f7530000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000003', null, 'Aluguel', 1200, private.today() + 3, 'pending', tests.uid('a')),
  ('f7530000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000003', null, 'Quatro dias', 10, private.today() + 4, 'pending', tests.uid('a')),
  ('f7530000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000003', null, 'Vencida do membro', 30, private.today() - 1, 'pending', tests.uid('m')),
  ('f7530000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000003', null, 'Venceu há 30', 40, private.today() - 30, 'pending', tests.uid('a')),
  ('f7530000-0000-0000-0000-000000000005', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000003', null, 'Venceu há 31', 50, private.today() - 31, 'pending', tests.uid('a')),
  ('f7530000-0000-0000-0000-000000000006', tests.fid('A'), 'income', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000004', tests.mem('m'), 'Receber do m', 80, private.today() + 1, 'pending', tests.uid('a')),
  ('f7530000-0000-0000-0000-000000000007', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000003', null, 'Será excluída', 15, private.today(), 'pending', tests.uid('a')),
  ('f7530000-0000-0000-0000-000000000008', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000003', null, 'Será cancelada', 16, private.today(), 'pending', tests.uid('a'));
-- efetivados: orçamento (Mercado 400 de 500 = 80%; Transporte 799,99 de 1000 = 79,99%), evento financeiro, série
insert into public.transactions (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f7530000-0000-0000-0000-000000000009', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000001', null, 'Mercado', 400, private.today(), 'paid', tests.uid('a')),
  ('f7530000-0000-0000-0000-00000000000a', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000002', null, 'Transporte', 799.99, private.today(), 'paid', tests.uid('a')),
  ('f7530000-0000-0000-0000-00000000000b', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000003', tests.mem('m'), 'Supermercado', 342.50, private.today(), 'paid', tests.uid('a')),
  ('f7530000-0000-0000-0000-00000000000c', tests.fid('A'), 'income', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000004', tests.mem('ad'), 'Reembolso', 50, private.today(), 'paid', tests.uid('a'));
insert into public.recurrences (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, frequency, start_date, created_by) values
  ('e7530000-0000-0000-0000-0000000000a1', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000003', tests.mem('m'), 'Série', 10, 'monthly', private.today(), tests.uid('a'));
insert into public.transactions (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by, recurrence_id, occurrence_date) values
  ('f7530000-0000-0000-0000-00000000000d', tests.fid('A'), 'expense', 'a7530000-0000-0000-0000-000000000001', 'c7530000-0000-0000-0000-000000000003', tests.mem('m'), 'Da série', 10, private.today(), 'paid', tests.uid('a'), 'e7530000-0000-0000-0000-0000000000a1', private.today());
insert into public.budgets (id, family_id, category_id, amount_limit, start_month, created_by) values
  ('b7530000-0000-0000-0000-000000000001', tests.fid('A'), 'c7530000-0000-0000-0000-000000000001', 500, '2020-01-01', tests.uid('a')),
  ('b7530000-0000-0000-0000-000000000002', tests.fid('A'), 'c7530000-0000-0000-0000-000000000002', 1000, '2020-01-01', tests.uid('a'));
insert into public.goals (id, family_id, name, target_amount, created_by) values
  ('90753000-0000-0000-0000-000000000001', tests.fid('A'), 'Reserva', 1000, tests.uid('a')),
  ('90753000-0000-0000-0000-000000000002', tests.fid('A'), 'Viagem', 1000, tests.uid('a')),
  ('90753000-0000-0000-0000-000000000003', tests.fid('A'), 'Carro', 1000, tests.uid('a')),
  ('90753000-0000-0000-0000-000000000004', tests.fid('A'), 'Pausada', 1000, tests.uid('a'));
-- acertos: m→a (por a), ad→m (por ad), um excluído
insert into public.settlements (id, family_id, from_member_id, to_member_id, amount, settlement_date, created_by) values
  ('57530000-0000-0000-0000-000000000001', tests.fid('A'), tests.mem('m'), tests.mem('a'), 25, private.today(), tests.uid('a')),
  ('57530000-0000-0000-0000-000000000002', tests.fid('A'), tests.mem('ad'), tests.mem('m'), 15, private.today(), tests.uid('ad'));
-- família B: 120 compromissos para o teto de 100
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by)
select tests.fid('B'), 'expense', 'a7530000-0000-0000-0000-0000000000b1', 'c7530000-0000-0000-0000-0000000000b1', 'Cap ' || g, 1, private.today() + 1, 'pending', tests.uid('b')
from generate_series(1, 120) g;

select tests.login_as('a');
insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date) values
  (tests.fid('A'), '90753000-0000-0000-0000-000000000001', tests.mem('a'), 'deposit', 800, private.today()),
  (tests.fid('A'), '90753000-0000-0000-0000-000000000002', tests.mem('a'), 'deposit', 799.99, private.today()),
  (tests.fid('A'), '90753000-0000-0000-0000-000000000003', tests.mem('a'), 'deposit', 1000, private.today()),
  (tests.fid('A'), '90753000-0000-0000-0000-000000000004', tests.mem('a'), 'deposit', 900, private.today());
update public.goals set status = 'paused' where id = '90753000-0000-0000-0000-000000000004';
select public.cancel_pending_transaction('f7530000-0000-0000-0000-000000000008');
update public.transactions set deleted_at = now() where id = 'f7530000-0000-0000-0000-000000000007';
update public.settlements set deleted_at = now() where id = '57530000-0000-0000-0000-000000000002';
select tests.logout();
-- (o acerto ad→m excluído acima não gera aviso; recriamos um vivo para o m)
insert into public.settlements (id, family_id, from_member_id, to_member_id, amount, settlement_date, created_by)
  values ('57530000-0000-0000-0000-000000000003', tests.fid('A'), tests.mem('ad'), tests.mem('m'), 15, private.today(), tests.uid('ad'));

-- a (owner) -----------------------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select is((select public.refresh_notifications()), 7, 'CA-E7-07: a recebe 7 (2 vencidas, 2 a vencer, orçamento, meta, novo integrante c)');
select is((select string_agg(type || '=' || n, ',' order by type) from (select type, count(*) as n from public.notifications group by type) s),
  'bill_due_soon=2,bill_overdue=2,budget_near_limit=1,goal_near_target=1,member_joined=1',
  'CA-E7-07: tipos de a (sem financial_event; 4 dias, 31 dias, 79,99%, 799,99/1000, d com 40 dias, excluída e cancelada fora)');
select is((select array_agg(dedupe_key order by dedupe_key) from public.notifications where type = 'bill_due_soon'),
  array['bill_due_soon:f7530000-0000-0000-0000-000000000001:' || to_char(private.today() + 3, 'YYYY-MM-DD'),
        'bill_due_soon:f7530000-0000-0000-0000-000000000006:' || to_char(private.today() + 1, 'YYYY-MM-DD')],
  'CA-E7-07: dedupe_key de bill_due_soon (vence em 3 entra, em 4 não)');
select is((select array_agg(dedupe_key order by dedupe_key) from public.notifications where type = 'bill_overdue'),
  array['bill_overdue:f7530000-0000-0000-0000-000000000003:' || to_char(private.today() - 1, 'YYYY-MM-DD'),
        'bill_overdue:f7530000-0000-0000-0000-000000000004:' || to_char(private.today() - 30, 'YYYY-MM-DD')],
  'CA-E7-07: dedupe_key de bill_overdue (há 30 dias entra, há 31 não)');
select is((select data from public.notifications where dedupe_key like 'bill_due_soon:f7530000-0000-0000-0000-000000000001:%'),
  jsonb_build_object('kind', 'expense', 'description', 'Aluguel', 'amount', '1200.00', 'due_date', to_char(private.today() + 3, 'YYYY-MM-DD')),
  'CA-E7-07: data de bill_due_soon');
select is((select entity_type || '/' || entity_id::text from public.notifications where dedupe_key like 'bill_due_soon:f7530000-0000-0000-0000-000000000001:%'),
  'transaction/f7530000-0000-0000-0000-000000000001', 'CA-E7-07: entidade da notificação de compromisso');
select is((select data from public.notifications where type = 'budget_near_limit'),
  jsonb_build_object('category_name', 'Mercado', 'month', to_char(private.today(), 'YYYY-MM'), 'spent', '400.00', 'limit', '500.00', 'percent', 80),
  'CA-E7-07: data de budget_near_limit (80% entra, 79,99% não)');
select is((select dedupe_key from public.notifications where type = 'budget_near_limit'),
  'budget_near_limit:b7530000-0000-0000-0000-000000000001:' || to_char(private.today(), 'YYYY-MM'), 'CA-E7-07: dedupe_key do orçamento');
select is((select data from public.notifications where type = 'goal_near_target'),
  jsonb_build_object('name', 'Reserva', 'saved', '800.00', 'target', '1000.00', 'percent', 80), 'CA-E7-07: data de goal_near_target (100%, 79,99% e pausada fora)');
select is((select dedupe_key from public.notifications where type = 'goal_near_target'),
  'goal_near_target:90753000-0000-0000-0000-000000000001:100000', 'CA-E7-07: dedupe_key da meta leva o alvo em centavos');
select is((select dedupe_key from public.notifications where type = 'member_joined'),
  'member_joined:' || current_setting('tests.mem_c'), 'CA-E7-07: member_joined só do que entrou desde (c sim, d não)');
select is((select data from public.notifications where type = 'member_joined'), '{"role": "member"}'::jsonb, 'CA-E7-07: data de member_joined');
select is((select public.refresh_notifications()), 0, 'CA-E7-07: segunda chamada devolve 0');
select is((select count(*)::int from public.notifications), 7, 'CA-E7-07: nada duplicado');

-- ad (admin) ------------------------------------------------------------------------------------------------------------------------
select tests.login_as('ad');
select is((select public.refresh_notifications()), 8, 'CA-E7-07: ad recebe 8 (as 7 de gestor + evento do Reembolso atribuído a ele)');
select is((select dedupe_key from public.notifications where type = 'financial_event'), 'financial_event:f7530000-0000-0000-0000-00000000000c:assigned',
  'CA-E7-07: evento para o responsável; o acerto criado por ele mesmo não gera aviso');
select is((select data from public.notifications where type = 'financial_event'),
  jsonb_build_object('kind', 'income', 'description', 'Reembolso', 'amount', '50.00', 'date', to_char(private.today(), 'YYYY-MM-DD'), 'status', 'paid'),
  'CA-E7-07: data de financial_event (lançamento)');
select is((select public.refresh_notifications()), 0, 'CA-E7-07: segunda chamada de ad devolve 0');

-- m (member) ---------------------------------------------------------------------------------------------------------------------------
select tests.login_as('m');
select is((select public.refresh_notifications()), 9, 'CA-E7-07: m recebe 9 (vencida de que é autor, a receber de que é responsável, orçamento, meta, 4 eventos, c)');
select is((select string_agg(type || '=' || n, ',' order by type) from (select type, count(*) as n from public.notifications group by type) s),
  'bill_due_soon=1,bill_overdue=1,budget_near_limit=1,financial_event=4,goal_near_target=1,member_joined=1',
  'CA-E7-07: tipos de m (só compromissos que pode pagar)');
select is((select array_agg(dedupe_key order by dedupe_key) from public.notifications where type = 'financial_event'),
  array['financial_event:57530000-0000-0000-0000-000000000001:settlement', 'financial_event:57530000-0000-0000-0000-000000000003:settlement',
        'financial_event:f7530000-0000-0000-0000-000000000006:assigned', 'financial_event:f7530000-0000-0000-0000-00000000000b:assigned'],
  'CA-E7-07: eventos de m: lançamentos atribuídos criados por outro e as duas partes de acerto; série e acerto excluído fora');
select is((select data from public.notifications where dedupe_key = 'financial_event:57530000-0000-0000-0000-000000000001:settlement'),
  jsonb_build_object('amount', '25.00', 'settlement_date', to_char(private.today(), 'YYYY-MM-DD'), 'direction', 'from_me'),
  'CA-E7-07: data do acerto (m paga a a → from_me)');
select is((select data ->> 'direction' from public.notifications where dedupe_key = 'financial_event:57530000-0000-0000-0000-000000000003:settlement'),
  'to_me', 'CA-E7-07: direction to_me quando m recebe');

-- c (entrou agora) -----------------------------------------------------------------------------------------------------------------------
select tests.login_as('c');
select is((select public.refresh_notifications()), 2, 'CA-E7-07: c recebe só orçamento e meta (nada de "desde" nem de compromissos)');
select is((select count(*)::int from public.notifications where type in ('member_joined', 'financial_event', 'bill_due_soon', 'bill_overdue')), 0,
  'CA-E7-07: member_joined não aparece para quem entrou depois');

-- usuário sem família e família B ------------------------------------------------------------------------------------------------------------
select tests.login_as('d');
select is((select public.refresh_notifications()), 3, 'CA-E7-07: d (entrou há 40 dias) recebe orçamento, meta e o novo integrante c');
select is((select count(*)::int from public.notifications where type = 'member_joined' and data ->> 'role' = 'member'), 1,
  'CA-E7-07: d vê só c como novo integrante (a, ad e m entraram antes da janela dele)');
select tests.login_as('b');
select is((select public.refresh_notifications()), 100, 'CA-E7-07: teto de 100 inserções por chamada (b tem 120)');
select is((select public.refresh_notifications()), 20, 'CA-E7-07: a chamada seguinte cria o restante');
select is((select public.refresh_notifications()), 0, 'CA-E7-07: depois, 0');
select tests.logout();
select is((select count(*)::int from public.notifications where user_id = tests.uid('b') and family_id <> tests.fid('B')), 0,
  'AB-115: nada de A na central de b');
select is((select count(*)::int from public.notifications where family_id = tests.fid('B') and user_id <> tests.uid('b')), 0,
  'AB-115: nada de B para os usuários de A');

-- limpeza ------------------------------------------------------------------------------------------------------------------------------------
insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key, created_at) values
  (tests.fid('A'), tests.uid('a'), 'member_joined', 'family_member', 'e7530000-0000-0000-0000-0000000000f1', 'member_joined:e7530000-0000-0000-0000-0000000000f1', now() - interval '91 days'),
  (tests.fid('A'), tests.uid('a'), 'member_joined', 'family_member', 'e7530000-0000-0000-0000-0000000000f2', 'member_joined:e7530000-0000-0000-0000-0000000000f2', now() - interval '89 days');
select tests.login_as('a');
select public.pay_pending_transaction('f7530000-0000-0000-0000-000000000003', private.today(), 30, 'a7530000-0000-0000-0000-000000000001');
select is((select public.refresh_notifications()), 0, 'CA-E7-07: refresh após o pagamento não cria nada novo');
select is((select count(*)::int from public.notifications where dedupe_key like 'bill_overdue:f7530000-0000-0000-0000-000000000003:%'), 0,
  'CA-E7-07: pago → a notificação de vencida some para quem atualizou');
select is((select count(*)::int from public.notifications where dedupe_key = 'member_joined:e7530000-0000-0000-0000-0000000000f1'), 0,
  'CA-E7-07: notificação com mais de 90 dias removida');
select is((select count(*)::int from public.notifications where dedupe_key = 'member_joined:e7530000-0000-0000-0000-0000000000f2'), 1,
  'CA-E7-07: notificação com 89 dias permanece');
select tests.login_as('ad');
select is((select count(*)::int from public.notifications where dedupe_key like 'bill_overdue:f7530000-0000-0000-0000-000000000003:%'), 1,
  'CA-E7-07: a limpeza é só do chamador (a de ad ainda existe)');
select is((select public.refresh_notifications()), 0, 'CA-E7-07: ad atualiza sem criar nada');
select is((select count(*)::int from public.notifications where dedupe_key like 'bill_overdue:f7530000-0000-0000-0000-000000000003:%'), 0,
  'CA-E7-07: ...e a dele some na vez dele');
select tests.logout();

select * from finish();
rollback;
