-- CA-E9-17 a CA-E9-20 e a parte M4 de CA-E9-01 (ADR-0038, AB-128): delete_my_account().
--   * privilégios e estrutura (security definer, search_path vazio, execute só a authenticated, tabela private sem grant, sem PII);
--   * reautenticação provada no banco: private.require_recent_auth (amr de senha em até 5 min) e a RPC negando tudo o resto, sem mudar nada;
--   * admin e member saem (família permanece, dados que registraram intactos e legíveis, R1 inalterado, member.left com reason);
--   * owner com outro integrante → OWNER_MUST_TRANSFER sem nenhuma alteração; owner sozinho → a família inteira deixa de existir;
--   * auth.users neutralizado; segunda chamada com o mesmo token não tem efeito.
-- Identities/sessions/mfa_factors/one_time_tokens, reuso do e-mail e falha em auth.users: 655 (dependem do schema interno do GoTrue).
-- Completude do mapa de erase_family por pg_constraint e regressão: 660.
begin;

select no_plan();

select tests.setup_world();

-- senhas "de verdade" (não nulas) para provar que a exclusão as anula; o trigger de M2 gera password.changed, que é descartado
update auth.users set encrypted_password = '$2a$10$0123456789012345678901uPlaceholderHashForTestsOnly000000000'
  where id in (tests.uid('a'), tests.uid('ad'), tests.uid('m'), tests.uid('b'));
delete from public.security_events;
update public.profiles set avatar_url = 'https://img.test/avatar.png' where id in (tests.uid('a'), tests.uid('ad'), tests.uid('m'));

create function tests.amr1(p_method text, p_ts bigint) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('method', p_method, 'timestamp', p_ts)) $$;
create function tests.surv() returns jsonb language sql as $$
  select jsonb_build_object(
    'tx', (select count(*) from public.transactions), 'rec', (select count(*) from public.recurrences),
    'goals', (select count(*) from public.goals), 'contrib', (select count(*) from public.goal_contributions),
    'splits', (select count(*) from public.expense_splits), 'settle', (select count(*) from public.settlements),
    'acc', (select count(*) from public.accounts), 'cat', (select count(*) from public.categories),
    'bud', (select count(*) from public.budgets),
    'tx_by_ad', (select count(*) from public.transactions where created_by = tests.uid('ad')),
    'tx_by_m', (select count(*) from public.transactions where created_by = tests.uid('m')),
    'del_by_ad', (select count(*) from public.transactions where deleted_by = tests.uid('ad')),
    'splits_ad', (select count(*) from public.expense_splits s join public.family_members fm on fm.id = s.member_id where fm.user_id = tests.uid('ad')),
    'settle_by_m', (select count(*) from public.settlements where created_by = tests.uid('m'))) $$;
create function tests.snap() returns jsonb language sql as $$
  select jsonb_build_object(
    'bal', (select jsonb_agg(to_jsonb(b) order by to_jsonb(b)::text) from public.account_balances() b),
    'ps', (select to_jsonb(p) from public.period_summary(private.today() - 30, private.today()) p),
    'bp', (select to_jsonb(p) from public.pending_summary() p),
    'mb', (select jsonb_agg(to_jsonb(p) order by to_jsonb(p)::text) from public.member_balances() p)) $$;
grant execute on function tests.amr1(text, bigint), tests.surv(), tests.snap() to authenticated;

-- dados de verdade registrados por cada um (admin ad, member m, owner a) na família A, e por b na B (controle)
select tests.seed_family_data(tests.fid('A'), 'ad', 'a', 'ad');
select tests.seed_family_data(tests.fid('A'), 'm', 'a', 'm');
select tests.seed_family_data(tests.fid('A'), 'a', 'ad', 'a');
select tests.seed_family_data(tests.fid('B'), 'b', null, 'b');

select cmp_ok((select count(*)::int from tests.family_table_counts(tests.fid('A'))), '>=', 14,
  'cenário: o catálogo enxerga as 13 tabelas com family_id + families');
select is((select count(*)::int from tests.family_table_counts(tests.fid('A')) where n = 0), 0,
  'cenário: a família A tem linhas em TODAS as tabelas da família (nenhuma prova vazia)');
select is((select (tests.surv() ->> 'tx_by_ad')::int), 7, 'cenário: o admin registrou 7 lançamentos (6 + estorno)');
select is((select (tests.surv() ->> 'del_by_ad')::int), 1, 'cenário: o admin excluiu 1 lançamento (deleted_by preenchido)');
select set_config('tests.hash_b', tests.family_hash(tests.fid('B')), true);

-- 1 · estrutura e privilégios (M4 de CA-E9-01) ---------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'), 'CA-E9-01: authenticated executa delete_my_account');
select ok(not has_function_privilege('anon', 'public.delete_my_account()', 'execute')
  and not has_function_privilege('public', 'public.delete_my_account()', 'execute'), 'CA-E9-17: anon e PUBLIC sem execute em delete_my_account');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ((n.nspname = 'public' and p.proname = 'delete_my_account')
        or (n.nspname = 'private' and p.proname in ('erase_family', 'require_recent_auth', 'account_erasure_auth_ready')))
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  4, 'CA-E9-01: as 4 funções novas são security definer com search_path vazio');
select ok(not has_function_privilege('authenticated', 'private.erase_family(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'private.require_recent_auth(interval)', 'execute')
  and not has_function_privilege('authenticated', 'private.account_erasure_auth_ready(name)', 'execute')
  and not has_function_privilege('anon', 'private.erase_family(uuid)', 'execute')
  and not has_function_privilege('anon', 'private.require_recent_auth(interval)', 'execute')
  and not has_function_privilege('anon', 'private.account_erasure_auth_ready(name)', 'execute'),
  'CA-E9-01: erase_family, require_recent_auth e account_erasure_auth_ready sem execute para authenticated/anon');
select is((select pronargs::int from pg_proc where oid = 'public.delete_my_account()'::regprocedure), 0,
  'CA-E9-01: delete_my_account não recebe parâmetro (só a conta de quem chama)');
select is((select pg_get_function_result('public.delete_my_account()'::regprocedure)), 'jsonb', 'delete_my_account devolve jsonb');
select ok(to_regclass('private.account_erasure_log') is not null and to_regclass('public.account_erasure_log') is null,
  'CA-E9-01: account_erasure_log existe em private e não em public');
select is((select count(*)::int from pg_class c
    where c.oid = 'private.account_erasure_log'::regclass
      and (has_table_privilege('authenticated', c.oid, 'select, insert, update, delete, truncate, references, trigger')
        or has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
        or has_any_column_privilege('authenticated', c.oid, 'select, insert, update, references')
        or has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))),
  0, 'CA-E9-01: authenticated e anon sem privilégio (tabela ou coluna) em account_erasure_log');
select ok((select relrowsecurity from pg_class where oid = 'private.account_erasure_log'::regclass), 'account_erasure_log com RLS ligada (sem policy)');
select is((select array_agg(column_name::text order by column_name) from information_schema.columns
    where table_schema = 'private' and table_name = 'account_erasure_log'),
  array['erased_at', 'family_erased', 'id', 'role', 'user_id'], 'CA-E9-20: account_erasure_log só tem id, user_id, erased_at, role, family_erased (sem PII)');

select tests.login_anon();
select throws_ok($$select public.delete_my_account()$$, '42501', null, 'CA-E9-17: anon não executa delete_my_account');
select tests.login_as('m');
select throws_ok($$select * from private.account_erasure_log$$, '42501', null, 'authenticated não lê account_erasure_log');
select throws_ok($$select private.erase_family(gen_random_uuid())$$, '42501', null, 'authenticated não chama erase_family');
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, '42501', null, 'authenticated não chama require_recent_auth');
select tests.logout();

-- 2 · private.require_recent_auth lê auth.jwt() -> 'amr' (como dono; claims definidos direto) ---------------------------------------
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: sem JWT → REAUTH_REQUIRED (negado por segurança)');
select tests.set_claims('{"sub": "x"}'::jsonb);
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: JWT sem o claim amr → negado');
select tests.set_claims('{"amr": null}'::jsonb);
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: claim nulo → negado');
select tests.set_claims('{"amr": {"method": "password"}}'::jsonb);
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: objeto em vez de array → negado');
select tests.set_claims('{"amr": "password"}'::jsonb);
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: texto → negado');
select tests.set_claims('{"amr": []}'::jsonb);
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: array vazio → negado');
select tests.set_claims('{"amr": ["password"]}'::jsonb);
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: elemento que não é objeto → negado');
select tests.set_claims(jsonb_build_object('amr', tests.amr1('password', tests.epoch() - 60)));
select lives_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'amr: senha há 1 min → aceito');
select tests.set_claims(jsonb_build_object('amr', tests.amr1('password', tests.epoch() - 299)));
select lives_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'amr: senha há 299 s → aceito (dentro dos 5 min)');
select tests.set_claims(jsonb_build_object('amr', tests.amr1('password', tests.epoch() - 301)));
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: senha há 301 s → negado');
select tests.set_claims(jsonb_build_object('amr', tests.amr1('password', tests.epoch() + 30)));
select lives_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'amr: 30 s no futuro (deriva de relógio) → aceito');
select tests.set_claims(jsonb_build_object('amr', tests.amr1('password', tests.epoch() + 3600)));
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: 1 h no futuro → negado');
select tests.set_claims(jsonb_build_object('amr', tests.amr1('otp', tests.epoch())));
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: método otp (link por e-mail) fresco → negado');
select tests.set_claims(jsonb_build_object('amr', tests.amr1('oauth', tests.epoch())));
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: método oauth fresco → negado (sem identidade de senha)');
select tests.set_claims(jsonb_build_object('amr', tests.amr1('totp', tests.epoch())));
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: método totp fresco → negado');
select tests.set_claims(jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', tests.epoch()::text))));
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: timestamp em texto → negado');
select tests.set_claims(jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password'))));
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: sem timestamp → negado');
select tests.set_claims(jsonb_build_object('amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', null))));
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED', 'amr: timestamp nulo → negado');
select tests.set_claims(jsonb_build_object('amr',
  tests.amr1('otp', tests.epoch()) || tests.amr1('password', tests.epoch() - 900)));
select throws_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'P0001', 'REAUTH_REQUIRED',
  'amr: otp fresco + senha antiga → negado (o método certo precisa estar fresco)');
select tests.set_claims(jsonb_build_object('amr',
  tests.amr1('otp', tests.epoch() - 900) || tests.amr1('password', tests.epoch() - 10)));
select lives_ok($$select private.require_recent_auth(interval '5 minutes')$$, 'amr: com várias entradas, basta uma de senha fresca');
select throws_ok($$select private.require_recent_auth(interval '0 seconds')$$, 'P0001', 'REAUTH_REQUIRED', 'prazo zero → negado');
select throws_ok($$select private.require_recent_auth(null::interval)$$, 'P0001', 'REAUTH_REQUIRED', 'prazo nulo → negado');
select tests.logout();

-- 3 · a RPC: sem sessão, sem prova de senha → nada muda ---------------------------------------------------------------------------------
select tests.login_no_sub();
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'NOT_AUTHENTICATED', 'CA-E9-17: sem auth.uid() → NOT_AUTHENTICATED');
select tests.logout();

select set_config('tests.h0', tests.world_hash(), true);
select tests.login_as('m');
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'REAUTH_REQUIRED', 'CA-E9-17: JWT sem amr → REAUTH_REQUIRED');
select tests.login_amr('m', 301);
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'REAUTH_REQUIRED', 'CA-E9-17: senha há mais de 5 min → REAUTH_REQUIRED');
select tests.login_amr('m', 0, 'otp');
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'REAUTH_REQUIRED', 'CA-E9-17: amr de link por e-mail → REAUTH_REQUIRED');
select tests.login_claims('m', null);
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'REAUTH_REQUIRED', 'CA-E9-17: amr nulo → REAUTH_REQUIRED');
select tests.login_claims('m', '[]'::jsonb);
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'REAUTH_REQUIRED', 'CA-E9-17: amr vazio → REAUTH_REQUIRED');
select tests.login_claims('m', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', tests.epoch()::text)));
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'REAUTH_REQUIRED', 'CA-E9-17: timestamp em texto → REAUTH_REQUIRED');
select tests.login_amr('m', -3600);
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'REAUTH_REQUIRED', 'CA-E9-17: timestamp no futuro → REAUTH_REQUIRED');
select tests.logout();
select is(tests.world_hash(), current_setting('tests.h0'),
  'CA-E9-17: todas as negações de reautenticação deixaram o mundo idêntico (perfil, vínculos, auth.users, log, tudo)');

-- 4 · owner com outro integrante ativo → OWNER_MUST_TRANSFER, nada muda ---------------------------------------------------------------
select tests.login_amr('a');
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'OWNER_MUST_TRANSFER', 'CA-E9-19: owner com outros ativos → OWNER_MUST_TRANSFER');
select tests.logout();
select is(tests.world_hash(), current_setting('tests.h0'), 'CA-E9-19: nenhuma alteração (nem perfil, nem auth, nem log, nem família)');

-- 5 · admin sai: a família permanece e o que ele registrou continua legível ------------------------------------------------------------
select set_config('tests.s0', tests.surv()::text, true);
select tests.login_as('a');
select set_config('tests.snap0', tests.snap()::text, true);
select tests.logout();

select tests.login_amr('ad');
select is((select public.delete_my_account()), '{"family_erased": false}'::jsonb, 'CA-E9-18: admin exclui a conta; a família não é apagada');
select tests.logout();

select is((select status from public.family_members where user_id = tests.uid('ad')), 'left', 'CA-E9-18: vínculo do admin virou left');
select ok((select ended_at is not null from public.family_members where user_id = tests.uid('ad')), 'CA-E9-18: com ended_at');
select is((select count(*)::int from public.family_members where family_id = tests.fid('A') and status = 'active'), 2, 'CA-E9-18: a e m continuam ativos');
select is((select display_name from public.profiles where id = tests.uid('ad')), 'Conta excluída', 'CA-E9-18: display_name anonimizado');
select ok((select avatar_url is null from public.profiles where id = tests.uid('ad')), 'CA-E9-18: avatar_url nulo');
select is((select display_name from public.profiles where id = tests.uid('a')), 'Ana Dona', 'CA-E9-18: o perfil do owner não foi tocado');
select is((select display_name from public.profiles where id = tests.uid('m')), 'Carla Membro', 'CA-E9-18: o perfil do member não foi tocado');
select ok((select avatar_url is not null from public.profiles where id = tests.uid('m')), 'CA-E9-18: avatar do member preservado');
select is((select count(*)::int from public.notifications where user_id = tests.uid('ad')), 0, 'CA-E9-18: notificações do admin apagadas');
select is((select count(*)::int from public.notifications where user_id = tests.uid('a')), 3, 'CA-E9-18: notificações do owner intactas (3)');
select is((select count(*)::int from public.notifications where user_id = tests.uid('m')), 1, 'CA-E9-18: notificação do member intacta');
select is((select count(*)::int from public.security_events where user_id = tests.uid('ad')), 0, 'CA-E9-18: security_events do admin apagados');
select is((select count(*)::int from public.security_events where user_id in (tests.uid('a'), tests.uid('m'))), 2, 'CA-E9-18: security_events dos outros intactos');
select is((select count(*)::int from private.notification_refresh_state where user_id = tests.uid('ad')), 0, 'CA-E9-18: estado de refresh do admin apagado');
select is((select count(*)::int from private.notification_refresh_state where user_id in (tests.uid('a'), tests.uid('m'))), 2, 'CA-E9-18: estado de refresh dos outros intacto');
select is((select count(*)::int from public.family_invites where created_by = tests.uid('ad') and invited_email is not null), 0,
  'CA-E9-18: invited_email nulo em todos os convites criados pelo admin');
select is((select count(*)::int from public.family_invites where accepted_by = tests.uid('ad') and invited_email is not null), 0,
  'CA-E9-18: invited_email nulo nos convites que o admin aceitou (e-mail dele)');
select is((select count(*)::int from public.family_invites where id = md5('sd-i1-ad')::uuid and revoked_at is not null and revoked_by = tests.uid('ad')), 1,
  'CA-E9-18: convite pendente do admin foi revogado');
select is((select count(*)::int from public.family_invites where id = md5('sd-i1-a')::uuid and revoked_at is null and invited_email = 'a-convidado@test.local'), 1,
  'CA-E9-18: convite pendente do owner intacto (e-mail preservado)');
select is((select count(*)::int from public.family_invites where id = md5('sd-i1-m')::uuid and revoked_at is null and invited_email = 'm-convidado@test.local'), 1,
  'CA-E9-18: convite pendente do member intacto (e-mail preservado)');
select is((select count(*)::int from public.audit_events where action = 'member.left'), 1, 'CA-E9-18: um member.left');
select is((select metadata ->> 'reason' from public.audit_events where action = 'member.left'), 'account_deleted', 'CA-E9-18: member.left com reason account_deleted');
select is((select metadata ->> 'from_role' from public.audit_events where action = 'member.left'), 'admin', 'CA-E9-18: member.left registra o papel que ele tinha');
select is((select metadata ->> 'revoked_invites' from public.audit_events where action = 'member.left'), '1', 'CA-E9-18: member.left registra 1 convite revogado');
select is((select actor_user_id from public.audit_events where action = 'member.left'), tests.uid('ad'), 'CA-E9-18: o ator é o próprio titular');
select is((select array_agg(k order by k) from public.audit_events e, jsonb_object_keys(e.metadata) k where e.action = 'member.left'),
  array['from_role', 'member_id', 'reason', 'revoked_invites'], 'CA-E9-20: metadata do member.left só tem papel, id do vínculo, motivo e contagem (sem PII)');
select is((select count(*)::int from public.audit_events where action = 'invite.revoked' and metadata ->> 'reason' = 'member_ended'
    and entity_id = md5('sd-i1-ad')::uuid), 1, 'CA-E9-18: invite.revoked do convite pendente');
select is((select count(*)::int from public.audit_events where metadata::text ~ '(@|test\.local|Beto Admin|Ana Dona|Carla Membro|Conta exclu)'), 0,
  'CA-E9-20: nenhuma auditoria da família contém e-mail ou nome');
select is((select count(*)::int from private.account_erasure_log), 1, 'CA-E9-20: account_erasure_log com 1 linha');
select is((select count(*)::int from private.account_erasure_log where user_id = tests.uid('ad') and role = 'admin' and not family_erased), 1,
  'CA-E9-20: a linha é do admin, family_erased = false');
select is((select count(*)::int from private.account_erasure_log l where to_jsonb(l)::text ~ '(@|test\.local|Beto Admin|Ana Dona|Carla Membro)'), 0,
  'CA-E9-20: account_erasure_log sem e-mail nem nome');
select is((select email from auth.users where id = tests.uid('ad')), 'conta-excluida+' || tests.uid('ad')::text || '@excluida.invalid',
  'CA-E9-22: e-mail trocado por valor inerte derivado do id');
select ok((select encrypted_password is null from auth.users where id = tests.uid('ad')), 'CA-E9-22: senha anulada');
select ok((select banned_until > now() + interval '100 years' from auth.users where id = tests.uid('ad')), 'CA-E9-22: banido por prazo praticamente infinito');
select ok((select deleted_at is not null from auth.users where id = tests.uid('ad')), 'CA-E9-22: deleted_at preenchido');
select is((select raw_user_meta_data from auth.users where id = tests.uid('ad')), '{}'::jsonb, 'CA-E9-22: metadados do usuário vazios');
select is((select email from auth.users where id = tests.uid('m')), 'm@test.local', 'CA-E9-22: o e-mail de quem não excluiu não foi tocado');
select ok((select encrypted_password is not null and deleted_at is null and banned_until is null from auth.users where id = tests.uid('m')),
  'CA-E9-22: senha, deleted_at e banned_until de quem não excluiu intactos');
select is(tests.surv(), current_setting('tests.s0')::jsonb,
  'CA-E9-18: lançamentos, séries, metas, aportes, parcelas, acertos, contas, categorias e orçamentos iguais; autoria e exclusões do admin preservadas');
select tests.login_as('a');
select is(tests.snap(), current_setting('tests.snap0')::jsonb, 'CA-E9-18: R1 — saldos, totais, pendentes e saldos entre integrantes iguais depois da saída');
select is((select count(*)::int from public.transactions where created_by = tests.uid('ad')), 7, 'CA-E9-18: quem fica lê os 7 lançamentos do ex-integrante');
select is((select count(*)::int from public.expense_splits s join public.family_members fm on fm.id = s.member_id where fm.user_id = tests.uid('ad')), 2,
  'CA-E9-18: parcelas do ex-integrante legíveis (2: uma de ad e uma de ad como par em a)');
select tests.logout();
select tests.login_as('ad');
select is((select count(*)::int from public.transactions) + (select count(*)::int from public.goals) + (select count(*)::int from public.family_members), 0,
  'CA-E9-18: o ex-integrante lê 0 linhas da família');
select tests.logout();
select is(tests.family_hash(tests.fid('B')), current_setting('tests.hash_b'), 'CA-E9-18: a família B continua idêntica');

-- segunda chamada com o mesmo token (CA-E9-22): sem efeito
select set_config('tests.h1', tests.world_hash(), true);
select tests.login_amr('ad');
select throws_ok($$select public.delete_my_account()$$, '42501', 'FORBIDDEN', 'CA-E9-22: segunda chamada com o mesmo token → FORBIDDEN');
select tests.logout();
select is(tests.world_hash(), current_setting('tests.h1'), 'CA-E9-22: a segunda chamada não mudou nada');

-- 6 · member sai (mesmas garantias) -----------------------------------------------------------------------------------------------
select set_config('tests.s1', tests.surv()::text, true);
select tests.login_as('a');
select set_config('tests.snap1', tests.snap()::text, true);
select tests.logout();
select tests.login_amr('m', 299);
select is((select public.delete_my_account()), '{"family_erased": false}'::jsonb, 'CA-E9-18: member exclui a conta (senha há 299 s)');
select tests.logout();
select is((select status from public.family_members where user_id = tests.uid('m')), 'left', 'CA-E9-18: vínculo do member virou left');
select is((select display_name from public.profiles where id = tests.uid('m')), 'Conta excluída', 'CA-E9-18: perfil do member anonimizado');
select ok((select avatar_url is null from public.profiles where id = tests.uid('m')), 'CA-E9-18: avatar do member removido');
select is((select count(*)::int from public.notifications where user_id = tests.uid('m')), 0, 'CA-E9-18: notificações do member apagadas');
select is((select count(*)::int from public.security_events where user_id = tests.uid('m')), 0, 'CA-E9-18: security_events do member apagados');
select is((select count(*)::int from public.family_invites where created_by = tests.uid('m') and invited_email is not null), 0, 'CA-E9-18: invited_email nulo nos convites do member');
select is((select count(*)::int from public.family_invites where id = md5('sd-i1-m')::uuid and revoked_at is not null and revoked_by = tests.uid('m')), 1,
  'CA-E9-18: convite pendente do member revogado');
select is((select metadata ->> 'reason' || '/' || (metadata ->> 'from_role') from public.audit_events where action = 'member.left' and actor_user_id = tests.uid('m')),
  'account_deleted/member', 'CA-E9-18: member.left do member com reason e papel');
select is((select count(*)::int from private.account_erasure_log where user_id = tests.uid('m') and role = 'member' and not family_erased), 1,
  'CA-E9-20: log do member');
select is(tests.surv(), current_setting('tests.s1')::jsonb, 'CA-E9-18: dados do member intactos (contagens e autoria)');
select tests.login_as('a');
select is(tests.snap(), current_setting('tests.snap1')::jsonb, 'CA-E9-18: R1 inalterado depois da saída do member');
select is((select count(*)::int from public.transactions where created_by = tests.uid('m')), 7, 'CA-E9-18: quem fica lê os 7 lançamentos do ex-member');
select tests.logout();

-- 7 · usuário sem família: exclui, role nulo ---------------------------------------------------------------------------------------------
select tests.login_amr('c', 299);
select is((select public.delete_my_account()), '{"family_erased": false}'::jsonb, 'CA-E9-17: usuário sem família exclui a conta');
select tests.logout();
select is((select display_name from public.profiles where id = tests.uid('c')), 'Conta excluída', 'sem família: perfil anonimizado');
select is((select count(*)::int from private.account_erasure_log where user_id = tests.uid('c') and role is null and not family_erased), 1, 'sem família: log com role nulo');
select ok((select deleted_at is not null from auth.users where id = tests.uid('c')), 'sem família: auth.users neutralizado');
select is((select count(*)::int from public.audit_events where action = 'member.left'), 2, 'sem família: nenhum member.left novo');

-- 8 · owner sozinho (ad e m já saíram): a família inteira deixa de existir -------------------------------------------------------------
select is((select count(*)::int from public.family_members where family_id = tests.fid('A') and status = 'active'), 1, 'CA-E9-20: só o owner está ativo');
select is((select count(*)::int from tests.family_table_counts(tests.fid('A')) where n = 0), 0, 'CA-E9-20: antes, todas as tabelas da família têm linhas');
select is_empty($$select * from tests.fk_paths_uncovered(tests.uid('a'))$$,
  'CA-E9-21: o owner tem linha em TODA FK restrict para profiles (nenhum caminho de bloqueio ficou sem exercício)');

select tests.login_amr('a');
select is((select public.delete_my_account()), '{"family_erased": true}'::jsonb, 'CA-E9-20: owner sozinho exclui a conta e a família');
select tests.logout();

select is((select count(*)::int from tests.family_table_counts(tests.fid('A')) where n > 0), 0,
  'CA-E9-20: a família A não tem NENHUMA linha em nenhuma tabela (contas, categorias, lançamentos, séries, orçamentos, metas, aportes, parcelas, acertos, notificações, convites, vínculos, auditoria, família)');
select is((select count(*)::int from public.families where id = tests.fid('A')), 0, 'CA-E9-20: a família não existe mais');
select is(tests.family_hash(tests.fid('B')), current_setting('tests.hash_b'), 'CA-E9-20: a família B permanece idêntica');
select is((select count(*)::int from private.account_erasure_log where user_id = tests.uid('a') and role = 'owner' and family_erased), 1,
  'CA-E9-20: account_erasure_log ganha a linha do owner com family_erased = true');
select is((select count(*)::int from private.account_erasure_log), 4, 'CA-E9-20: 4 linhas no total (ad, m, c, a)');
select is((select count(*)::int from private.account_erasure_log l where to_jsonb(l)::text ~ '(@|test\.local|Beto Admin|Ana Dona|Carla Membro|Caio Sem Familia)'), 0,
  'CA-E9-20: account_erasure_log sem e-mail nem nome depois das 4 exclusões');
select is((select display_name from public.profiles where id = tests.uid('a')), 'Conta excluída', 'CA-E9-20: perfil do owner anonimizado (permanece)');
select is((select count(*)::int from public.profiles where display_name = 'Conta excluída'), 4, 'CA-E9-20: 4 perfis anonimizados; b e d intactos');
select is((select display_name from public.profiles where id = tests.uid('b')), 'Bruno Outro', 'CA-E9-20: perfil da outra família intacto');
select is((select count(*)::int from public.security_events where user_id in (tests.uid('a'), tests.uid('ad'), tests.uid('m'))), 0, 'CA-E9-20: security_events de todos apagados');
select is((select count(*)::int from public.notifications where user_id in (tests.uid('a'), tests.uid('ad'), tests.uid('m'))), 0, 'CA-E9-20: notificações de todos apagadas');
select ok((select deleted_at is not null and encrypted_password is null and email like 'conta-excluida+%@excluida.invalid'
    from auth.users where id = tests.uid('a')), 'CA-E9-22: auth.users do owner neutralizado');
select is((select email from auth.users where id = tests.uid('b')), 'b@test.local', 'CA-E9-22: auth.users de outra família intacto');
select is((select count(*)::int from auth.users where deleted_at is not null), 4, 'CA-E9-22: exatamente 4 contas neutralizadas');
select is((select count(*)::int from public.profiles p join auth.users u on u.id = p.id), 6, 'FK profiles → auth.users íntegra: os 6 perfis continuam com o usuário do Auth');

-- B continua funcionando para o dono dela
select tests.login_as('b');
select cmp_ok((select count(*)::int from public.accounts), '>', 0, 'a família B ainda lê as próprias contas');
select tests.logout();

-- segunda chamada do owner: sem efeito
select set_config('tests.h2', tests.world_hash(), true);
select tests.login_amr('a');
select throws_ok($$select public.delete_my_account()$$, '42501', 'FORBIDDEN', 'CA-E9-22: owner excluído chamando de novo → FORBIDDEN');
select tests.logout();
select is(tests.world_hash(), current_setting('tests.h2'), 'CA-E9-22: sem efeito');

select * from finish();
rollback;
