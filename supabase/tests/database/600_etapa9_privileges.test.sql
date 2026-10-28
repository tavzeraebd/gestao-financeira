-- CA-E9-01 (M1, M2, M3; M4 fica para a tarefa T-09): objetos novos da Etapa 9 sem grant a anon/authenticated onde não devem ter,
-- funções security definer com search_path vazio, EXECUTE só a authenticated nas RPCs, retorno text das três RPCs de integrantes,
-- refresh_notifications sem parâmetros, seed de volume_limits, triggers e índices esperados.
begin;

select no_plan();

select tests.setup_world();

-- tabelas private: sem nenhum privilégio para anon/authenticated e fora de public --------------------------------------------------------
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname in ('volume_limits', 'notification_refresh_state') and c.relkind = 'r'),
  2, 'CA-E9-01: volume_limits e notification_refresh_state existem em private');
select ok(to_regclass('public.volume_limits') is null and to_regclass('public.notification_refresh_state') is null,
  'CA-E9-01: nenhuma das duas está no schema exposto (public)');
select is((select count(*)::int from pg_class c
    where c.oid in ('private.volume_limits'::regclass, 'private.notification_refresh_state'::regclass)
      and (has_table_privilege('authenticated', c.oid, 'select, insert, update, delete, truncate, references, trigger')
        or has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
        or has_any_column_privilege('authenticated', c.oid, 'select, insert, update, references')
        or has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))),
  0, 'CA-E9-01: authenticated e anon sem privilégio (tabela ou coluna) nas duas tabelas private');
select is((select jsonb_object_agg(kind, jsonb_build_array(max_active, max_per_hour)) from private.volume_limits),
  '{"transactions": [100000, 500], "goal_contributions_goal": [10000, 0], "goal_contributions_family": [50000, 500],
    "settlements": [20000, 200], "notifications_user": [500, 0]}'::jsonb,
  'CA-E9-01: seed de volume_limits conforme o ADR-0033');

-- security_events -------------------------------------------------------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.security_events'::regclass), 'CA-E9-01: security_events tem RLS');
select is((select array_agg(polname::text order by polname) from pg_policy where polrelid = 'public.security_events'::regclass),
  array['security_events_select_own'], 'CA-E9-01: só a policy de select do próprio usuário');
select ok(has_table_privilege('authenticated', 'public.security_events', 'select'), 'CA-E9-01: authenticated lê security_events');
select ok(not has_table_privilege('authenticated', 'public.security_events', 'insert')
  and not has_table_privilege('authenticated', 'public.security_events', 'update')
  and not has_table_privilege('authenticated', 'public.security_events', 'delete')
  and not has_table_privilege('authenticated', 'public.security_events', 'truncate')
  and not has_any_column_privilege('authenticated', 'public.security_events', 'insert')
  and not has_any_column_privilege('authenticated', 'public.security_events', 'update'),
  'CA-E9-01: sem nenhum grant de escrita em security_events (tabela ou coluna)');
select ok(not has_table_privilege('anon', 'public.security_events', 'select, insert, update, delete, truncate, references, trigger')
  and not has_any_column_privilege('anon', 'public.security_events', 'select, insert, update, references'),
  'CA-E9-01: anon sem privilégio em security_events');

-- funções ------------------------------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ((n.nspname = 'public' and p.proname in ('change_member_role', 'transfer_ownership', 'remove_family_member', 'refresh_notifications'))
        or (n.nspname = 'private' and p.proname in ('enforce_volume_limit', 'log_member_denial', 'log_password_changed',
              'transactions_volume_check', 'goal_contributions_volume_check', 'settlements_volume_check')))
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  10, 'CA-E9-01: as 10 funções novas/recriadas são security definer com search_path vazio');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ((n.nspname = 'public' and p.proname in ('change_member_role', 'transfer_ownership', 'remove_family_member', 'refresh_notifications'))
        or (n.nspname = 'private' and p.proname in ('enforce_volume_limit', 'log_member_denial', 'log_password_changed',
              'transactions_volume_check', 'goal_contributions_volume_check', 'settlements_volume_check')))
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))),
  0, 'CA-E9-01: anon e PUBLIC sem EXECUTE em nenhuma delas');
select ok(has_function_privilege('authenticated', 'public.change_member_role(uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.transfer_ownership(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.remove_family_member(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.refresh_notifications()', 'execute'),
  'CA-E9-01: authenticated executa as quatro RPCs públicas');
select ok(not has_function_privilege('authenticated', 'private.enforce_volume_limit(text,uuid,uuid,uuid,boolean)', 'execute')
  and not has_function_privilege('authenticated', 'private.log_member_denial(uuid,text,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'private.log_password_changed()', 'execute')
  and not has_function_privilege('authenticated', 'private.transactions_volume_check()', 'execute')
  and not has_function_privilege('authenticated', 'private.goal_contributions_volume_check()', 'execute')
  and not has_function_privilege('authenticated', 'private.settlements_volume_check()', 'execute'),
  'CA-E9-01: authenticated sem EXECUTE nas funções internas');
select is((select pronargs::int from pg_proc where oid = 'public.refresh_notifications()'::regprocedure), 0,
  'CA-E9-01: refresh_notifications continua sem parâmetros');
select is((select pg_get_function_result('public.refresh_notifications()'::regprocedure)), 'integer',
  'CA-E9-01: refresh_notifications continua devolvendo integer');
select is((select array_agg(pg_get_function_result(p.oid) order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in ('change_member_role', 'transfer_ownership', 'remove_family_member')),
  array['text', 'text', 'text'], 'CA-E9-01: as três RPCs de integrantes devolvem text (ADR-0036)');
select is((select pg_get_function_result('public.leave_family()'::regprocedure)), 'void', 'CA-E9-01: leave_family não mudou (void)');

-- triggers e índices -------------------------------------------------------------------------------------------------------------------
select is((select array_agg(tgname::text order by tgname) from pg_trigger
    where tgname in ('transactions_volume_bi', 'goal_contributions_volume_bi', 'settlements_volume_bi') and not tgisinternal),
  array['goal_contributions_volume_bi', 'settlements_volume_bi', 'transactions_volume_bi'], 'CA-E9-01: os três triggers de volume existem');
select is((select count(*)::int from pg_trigger
    where tgname in ('transactions_volume_bi', 'goal_contributions_volume_bi', 'settlements_volume_bi')
      and (tgtype & 1) = 1 and (tgtype & 2) = 2 and (tgtype & 4) = 4),
  3, 'CA-E9-01: os três são BEFORE INSERT FOR EACH ROW');
select is((select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where t.tgname = 'on_auth_user_password_changed' and n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal),
  1, 'CA-E9-01: o trigger de troca de senha existe em auth.users');
select is((select count(*)::int from pg_indexes where schemaname = 'public'
    and indexname in ('transactions_created_by_created_at_idx', 'goal_contributions_created_by_created_at_idx',
                      'settlements_created_by_created_at_idx', 'security_events_user_created_idx')),
  4, 'CA-E9-01: os quatro índices novos existem');
select ok((select indexdef like '%recurrence_id IS NULL%' from pg_indexes where indexname = 'transactions_created_by_created_at_idx'),
  'CA-E9-01: o índice de frequência de transactions é parcial (recurrence_id is null)');

-- acesso -------------------------------------------------------------------------------------------------------------------------------------
select tests.login_anon();
select throws_ok($$select * from public.security_events$$, '42501', null, 'CA-E9-01: anon não lê security_events');
select throws_ok($$select public.change_member_role(gen_random_uuid(), 'admin')$$, '42501', null, 'CA-E9-01: anon não executa change_member_role');
select throws_ok($$select public.transfer_ownership(gen_random_uuid())$$, '42501', null, 'CA-E9-01: anon não executa transfer_ownership');
select throws_ok($$select public.remove_family_member(gen_random_uuid())$$, '42501', null, 'CA-E9-01: anon não executa remove_family_member');
select throws_ok($$select public.refresh_notifications()$$, '42501', null, 'CA-E9-01: anon não executa refresh_notifications');
select tests.logout();

select tests.login_no_sub();
select throws_ok($$select public.change_member_role(gen_random_uuid(), 'admin')$$, 'P0001', 'NOT_AUTHENTICATED', 'sem sub: change_member_role segue lançando');
select throws_ok($$select public.transfer_ownership(gen_random_uuid())$$, 'P0001', 'NOT_AUTHENTICATED', 'sem sub: transfer_ownership segue lançando');
select throws_ok($$select public.remove_family_member(gen_random_uuid())$$, 'P0001', 'NOT_AUTHENTICATED', 'sem sub: remove_family_member segue lançando');
select tests.logout();

select tests.login_as('a');
select throws_ok($$select * from private.volume_limits$$, '42501', null, 'CA-E9-01: authenticated não lê private.volume_limits');
select throws_ok($$update private.volume_limits set max_active = 1000000$$, '42501', null, 'CA-E9-01: authenticated não altera private.volume_limits');
select throws_ok($$select * from private.notification_refresh_state$$, '42501', null, 'CA-E9-01: authenticated não lê private.notification_refresh_state');
select throws_ok($$select private.enforce_volume_limit('transactions', gen_random_uuid(), null, null, true)$$, '42501', null,
  'CA-E9-01: authenticated não chama enforce_volume_limit diretamente');
select tests.logout();

select * from finish();
rollback;
