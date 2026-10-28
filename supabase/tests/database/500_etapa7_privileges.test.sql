-- CA-E7-01 (RLS, grants exatos, security definer/invoker, anon, family_members sem escrita), CA-E7-08 (RLS de notificações, AB-114/116)
-- e CA-E7-13 (constraints de notifications).
begin;

select no_plan();

select tests.setup_world();
create function tests.mem(p_key text) returns uuid language sql stable as $$
  select id from public.family_members where user_id = tests.uid(p_key)
  order by (status = 'active') desc, joined_at desc limit 1 $$;
grant execute on function tests.mem(text) to authenticated;

-- uma notificação por usuário (a, ad, m na família A; b na família B), inseridas pelo dono (a API não insere)
insert into public.notifications (id, family_id, user_id, type, entity_type, entity_id, data, dedupe_key) values
  ('e7500000-0000-0000-0000-000000000001', tests.fid('A'), tests.uid('a'), 'member_joined', 'family_member',
   'e7500000-0000-0000-0000-0000000000f1', '{"role": "member"}', 'member_joined:e7500000-0000-0000-0000-0000000000f1'),
  ('e7500000-0000-0000-0000-000000000002', tests.fid('A'), tests.uid('ad'), 'member_joined', 'family_member',
   'e7500000-0000-0000-0000-0000000000f2', '{"role": "member"}', 'member_joined:e7500000-0000-0000-0000-0000000000f2'),
  ('e7500000-0000-0000-0000-000000000003', tests.fid('A'), tests.uid('m'), 'member_joined', 'family_member',
   'e7500000-0000-0000-0000-0000000000f3', '{"role": "member"}', 'member_joined:e7500000-0000-0000-0000-0000000000f3'),
  ('e7500000-0000-0000-0000-000000000004', tests.fid('B'), tests.uid('b'), 'member_joined', 'family_member',
   'e7500000-0000-0000-0000-0000000000f4', '{"role": "member"}', 'member_joined:e7500000-0000-0000-0000-0000000000f4');

-- CA-E7-01 · estrutura ---------------------------------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'CA-E7-01: notifications tem RLS');
select is((select array_agg(polname::text order by polname) from pg_policy where polrelid = 'public.notifications'::regclass),
  array['notifications_select', 'notifications_update'], 'CA-E7-01: só as policies de select e update');
select ok(has_table_privilege('authenticated', 'public.notifications', 'select'), 'CA-E7-01: notifications legível por authenticated');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'insert')
  and not has_table_privilege('authenticated', 'public.notifications', 'update')
  and not has_table_privilege('authenticated', 'public.notifications', 'delete')
  and not has_table_privilege('authenticated', 'public.notifications', 'truncate'),
  'CA-E7-01: sem privilégio de tabela de insert, update, delete e truncate');
select is((select count(*)::int from pg_attribute
    where attrelid = 'public.notifications'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'INSERT')),
  0, 'CA-E7-01: nenhuma coluna aceita insert');
select is((select array_agg(attname::text order by attname) from pg_attribute
    where attrelid = 'public.notifications'::regclass and attnum > 0 and not attisdropped
      and has_column_privilege('authenticated', attrelid, attnum, 'UPDATE')),
  array['read_at'], 'CA-E7-01: o grant de update é só read_at');
select is((select count(*)::int from pg_class c
    where c.oid = 'public.notifications'::regclass
      and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
        or has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))),
  0, 'CA-E7-01: anon sem privilégio em notifications');
select ok(not has_table_privilege('authenticated', 'public.family_members', 'insert')
  and not has_table_privilege('authenticated', 'public.family_members', 'update')
  and not has_table_privilege('authenticated', 'public.family_members', 'delete')
  and not has_any_column_privilege('authenticated', 'public.family_members', 'insert')
  and not has_any_column_privilege('authenticated', 'public.family_members', 'update'),
  'CA-E7-01: family_members continua sem nenhum grant de escrita (tabela ou coluna)');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'CA-E7-01: nenhuma tabela de public sem RLS');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('change_member_role', 'transfer_ownership', 'remove_family_member', 'leave_family', 'refresh_notifications')
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  5, 'CA-E7-01: as cinco RPCs são security definer com search_path vazio');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('account_flows', 'member_expense_totals')
      and not p.prosecdef and p.provolatile = 's' and p.proconfig @> array['search_path=""']),
  2, 'CA-E7-01: account_flows e member_expense_totals são security invoker, stable, com search_path vazio');
select is((select proargnames from pg_proc where oid = 'public.account_flows(date,date)'::regprocedure),
  array['p_from', 'p_to', 'account_id', 'opening', 'inflow', 'outflow', 'closing'],
  'AB-117: account_flows sem parâmetro de família');
select is((select proargnames from pg_proc where oid = 'public.member_expense_totals(date,date)'::regprocedure),
  array['p_from', 'p_to', 'member_id', 'amount'], 'AB-117: member_expense_totals sem parâmetro de família');
select is((select pronargs::int from pg_proc where oid = 'public.refresh_notifications()'::regprocedure), 0,
  'AB-115: refresh_notifications não tem parâmetros');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname in ('change_member_role', 'transfer_ownership', 'remove_family_member', 'leave_family', 'refresh_notifications',
                        'account_flows', 'member_expense_totals', 'revoke_member_invites', 'families_after_update_audit',
                        'notifications_before_update')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))),
  0, 'CA-E7-01: anon e PUBLIC sem EXECUTE em nenhuma função nova');
select ok(has_function_privilege('authenticated', 'public.change_member_role(uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.transfer_ownership(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.remove_family_member(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.leave_family()', 'execute')
  and has_function_privilege('authenticated', 'public.refresh_notifications()', 'execute')
  and has_function_privilege('authenticated', 'public.account_flows(date,date)', 'execute')
  and has_function_privilege('authenticated', 'public.member_expense_totals(date,date)', 'execute'),
  'CA-E7-01: authenticated executa as cinco RPCs e as duas leituras');
select ok(not has_function_privilege('authenticated', 'private.revoke_member_invites(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.families_after_update_audit()', 'execute')
  and not has_function_privilege('authenticated', 'private.notifications_before_update()', 'execute'),
  'CA-E7-01: helper e funções de trigger sem EXECUTE para authenticated');

-- anon e sem sub ---------------------------------------------------------------------------------------------------------
select tests.login_anon();
select throws_ok($$select * from public.notifications$$, '42501', null, 'CA-E7-01: anon não lê notifications');
select throws_ok($$select public.refresh_notifications()$$, '42501', null, 'CA-E7-01: anon não executa refresh_notifications');
select throws_ok($$select public.leave_family()$$, '42501', null, 'CA-E7-01: anon não executa leave_family');
select throws_ok($$select public.change_member_role(gen_random_uuid(), 'admin')$$, '42501', null, 'CA-E7-01: anon não executa change_member_role');
select throws_ok($$select * from public.account_flows(current_date, current_date)$$, '42501', null, 'CA-E7-01: anon não executa account_flows');
select throws_ok($$select * from public.member_expense_totals(current_date, current_date)$$, '42501', null,
  'CA-E7-01: anon não executa member_expense_totals');
select tests.logout();

select tests.login_no_sub();
select throws_ok($$select public.change_member_role(gen_random_uuid(), 'admin')$$, 'P0001', 'NOT_AUTHENTICATED', 'sem sub: change_member_role');
select throws_ok($$select public.transfer_ownership(gen_random_uuid())$$, 'P0001', 'NOT_AUTHENTICATED', 'sem sub: transfer_ownership');
select throws_ok($$select public.remove_family_member(gen_random_uuid())$$, 'P0001', 'NOT_AUTHENTICATED', 'sem sub: remove_family_member');
select throws_ok($$select public.leave_family()$$, 'P0001', 'NOT_AUTHENTICATED', 'sem sub: leave_family');
select throws_ok($$select public.refresh_notifications()$$, 'P0001', 'NOT_AUTHENTICATED', 'sem sub: refresh_notifications');
select tests.logout();

-- CA-E7-08 · RLS de notificações -------------------------------------------------------------------------------------------
select tests.login_as('a');
select is((select count(*)::int from public.notifications), 1, 'CA-E7-08: a lê só a própria notificação');
select is((select count(*)::int from public.notifications where id = 'e7500000-0000-0000-0000-000000000002'), 0,
  'CA-E7-08: a não lê a notificação de outro integrante da mesma família');
select is(tests.affected($$update public.notifications set read_at = now() where id = 'e7500000-0000-0000-0000-000000000002'$$), 0,
  'CA-E7-08: update no id de outro integrante → 0 linhas');
select is(tests.affected($$update public.notifications set read_at = now() where id = 'e7500000-0000-0000-0000-000000000004'$$), 0,
  'CA-E7-08: update no id de outra família → 0 linhas');
select is(tests.affected($$update public.notifications set read_at = now() where id = 'e7500000-0000-0000-0000-000000000001'$$), 1,
  'CA-E7-08: a marca a própria como lida');
select ok((select read_at is not null from public.notifications where id = 'e7500000-0000-0000-0000-000000000001'), 'CA-E7-08: read_at gravado');
select is(tests.affected($$update public.notifications set read_at = null where id = 'e7500000-0000-0000-0000-000000000001'$$), 1,
  'CA-E7-08: tentar desmarcar atualiza a linha...');
select ok((select read_at is not null from public.notifications where id = 'e7500000-0000-0000-0000-000000000001'),
  'CA-E7-08: ...mas read_at não volta a nulo');
select throws_ok($$update public.notifications set type = 'goal_near_target' where id = 'e7500000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E7-08: update de coluna além de read_at (type) → 42501');
select throws_ok($$update public.notifications set data = '{}' where id = 'e7500000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E7-08: update de data → 42501');
select throws_ok($$update public.notifications set user_id = tests.uid('ad') where id = 'e7500000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E7-08: update de user_id → 42501');
select throws_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
  values (%L, %L, 'financial_event', 'transaction', gen_random_uuid(), 'financial_event:e7500000-0000-0000-0000-0000000000f9:assigned')$$,
  tests.fid('A'), tests.uid('a')), '42501', null, 'CA-E7-08: insert direto → 42501 (AB-116)');
select throws_ok($$delete from public.notifications where id = 'e7500000-0000-0000-0000-000000000001'$$, '42501', null,
  'CA-E7-08: delete → 42501');

select tests.login_as('ad');
select is((select count(*)::int from public.notifications), 1, 'CA-E7-08: ad lê só a própria');
select is(tests.affected($$update public.notifications set read_at = '2000-01-01' where id = 'e7500000-0000-0000-0000-000000000002'$$), 1,
  'CA-E7-08: ad marca a própria como lida enviando uma data qualquer');
select ok((select read_at = now() from public.notifications where id = 'e7500000-0000-0000-0000-000000000002'),
  'CA-E7-08: o banco fixa read_at em now() (o valor enviado é descartado)');

select tests.login_as('b');
select is((select count(*)::int from public.notifications), 1, 'CA-E7-08: b lê só a própria (família B)');
select is(tests.affected($$update public.notifications set read_at = now() where id = 'e7500000-0000-0000-0000-000000000003'$$), 0,
  'CA-E7-08: b não atualiza notificação de A');

select tests.login_as('c');
select is((select count(*)::int from public.notifications), 0, 'CA-E7-08: usuário sem família lê 0');
select tests.logout();

-- integrante removido perde a leitura das próprias notificações
update public.family_members set status = 'removed', ended_at = now() where user_id = tests.uid('m');
select tests.login_as('m');
select is((select count(*)::int from public.notifications), 0, 'CA-E7-08: integrante removido lê 0 das próprias');
select is(tests.affected($$update public.notifications set read_at = now() where id = 'e7500000-0000-0000-0000-000000000003'$$), 0,
  'CA-E7-08: integrante removido não marca como lida');
select tests.logout();

-- CA-E7-13 · constraints -----------------------------------------------------------------------------------------------------
select throws_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
  values (%L, %L, 'member_joined', 'family_member', gen_random_uuid(), 'member_joined:e7500000-0000-0000-0000-0000000000f1')$$,
  tests.fid('A'), tests.uid('a')), '23505', null, 'CA-E7-13: unique (user_id, dedupe_key)');
select lives_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
  values (%L, %L, 'member_joined', 'family_member', gen_random_uuid(), 'member_joined:e7500000-0000-0000-0000-0000000000f1')$$,
  tests.fid('A'), tests.uid('ad')), 'CA-E7-13: a mesma chave vale para outro usuário');
select lives_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
  values (%L, %L, 'bill_overdue', 'transaction', gen_random_uuid(), 'bill_overdue:e7500000-0000-0000-0000-0000000000f5:2026-10-24')$$,
  tests.fid('A'), tests.uid('a')), 'CA-E7-13: chave com terceiro segmento (data) é aceita');
select throws_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, entity_id, data, dedupe_key)
  values (%L, %L, 'member_joined', 'family_member', gen_random_uuid(), jsonb_build_object('k', repeat('x', 5000)),
  'member_joined:e7500000-0000-0000-0000-0000000000f6')$$, tests.fid('A'), tests.uid('a')),
  '23514', null, 'CA-E7-13: data acima de 2048 bytes → 23514');
select throws_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, entity_id, data, dedupe_key)
  values (%L, %L, 'member_joined', 'family_member', gen_random_uuid(), '[]'::jsonb,
  'member_joined:e7500000-0000-0000-0000-0000000000f7')$$, tests.fid('A'), tests.uid('a')),
  '23514', null, 'CA-E7-13: data que não é objeto → 23514');
select throws_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
  values (%L, %L, 'member_joined', 'family_member', gen_random_uuid(), 'abc')$$, tests.fid('A'), tests.uid('a')),
  '23514', null, 'CA-E7-13: dedupe_key fora do formato → 23514');
select throws_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
  values (%L, %L, 'member_joined', 'family_member', gen_random_uuid(), 'MEMBER_JOINED:e7500000-0000-0000-0000-0000000000f8')$$,
  tests.fid('A'), tests.uid('a')), '23514', null, 'CA-E7-13: dedupe_key em maiúsculas → 23514');
select throws_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
  values (%L, %L, 'invite_received', 'family_member', gen_random_uuid(), 'member_joined:e7500000-0000-0000-0000-0000000000f9')$$,
  tests.fid('A'), tests.uid('a')), '23514', null, 'CA-E7-13: tipo fora da lista (invite_received não existe) → 23514');
select throws_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
  values (%L, %L, 'member_joined', 'invite', gen_random_uuid(), 'member_joined:e7500000-0000-0000-0000-0000000000fa')$$,
  tests.fid('A'), tests.uid('a')), '23514', null, 'CA-E7-13: entity_type fora da lista → 23514');
select throws_ok(format($$insert into public.notifications (family_id, user_id, type, entity_type, dedupe_key)
  values (%L, %L, 'member_joined', 'family_member', 'member_joined:e7500000-0000-0000-0000-0000000000fb')$$,
  tests.fid('A'), tests.uid('a')), '23502', null, 'CA-E7-13: entity_id é obrigatório');

select * from finish();
rollback;
