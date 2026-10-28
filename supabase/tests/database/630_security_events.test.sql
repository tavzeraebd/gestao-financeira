-- CA-E9-09, CA-E9-10, CA-E9-11 (M2, ADR-0035): security_events (RLS própria, sem escrita pela API) e o trigger em auth.users que grava
-- 'password.changed' quando encrypted_password muda. A recuperação por e-mail e a troca logada só alteram essa coluna; o teste a atualiza
-- diretamente como dono do banco, que é o que o Auth faz.
begin;

select no_plan();

select tests.setup_world();

-- CA-E9-10 · trigger -----------------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.security_events), 0, 'CA-E9-10: criar usuários não gera evento (o hash nasce no INSERT)');
update auth.users set encrypted_password = 'hash-1' where id = tests.uid('a');
select is((select count(*)::int from public.security_events where user_id = tests.uid('a') and action = 'password.changed'), 1,
  'CA-E9-10: trocar encrypted_password grava exatamente 1 evento password.changed');
select is((select metadata from public.security_events where user_id = tests.uid('a')), '{}'::jsonb, 'CA-E9-10: metadata vazia por padrão');
update auth.users set encrypted_password = 'hash-1' where id = tests.uid('a');
select is((select count(*)::int from public.security_events where user_id = tests.uid('a')), 1, 'CA-E9-10: atualizar com o mesmo hash não grava');
update auth.users set raw_user_meta_data = '{"display_name": "Outro"}'::jsonb, updated_at = now() where id = tests.uid('a');
select is((select count(*)::int from public.security_events where user_id = tests.uid('a')), 1, 'CA-E9-10: atualizar sem tocar a coluna não grava');
update auth.users set encrypted_password = null where id = tests.uid('a');
select is((select count(*)::int from public.security_events where user_id = tests.uid('a')), 1, 'CA-E9-10: trocar para nulo não grava');
update auth.users set encrypted_password = 'hash-2' where id = tests.uid('a');
select is((select count(*)::int from public.security_events where user_id = tests.uid('a')), 2, 'CA-E9-10: nova troca (de nulo para valor) grava o 2º evento');
update auth.users set encrypted_password = 'hash-3' where id = tests.uid('a');
select is((select count(*)::int from public.security_events where user_id = tests.uid('a')), 3, 'CA-E9-10: e a seguinte, o 3º');
update auth.users set encrypted_password = 'hash-x' where id = tests.uid('m');
select is((select count(*)::int from public.security_events where user_id = tests.uid('m')), 1, 'CA-E9-10: o evento é do usuário que trocou');
select is((select count(*)::int from public.security_events where user_id = tests.uid('a')), 3, 'CA-E9-10: e não vaza para outro usuário');

-- CA-E9-09 · RLS -------------------------------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select is((select count(*)::int from public.security_events), 3, 'CA-E9-09: a lê só os próprios 3 eventos');
select tests.login_as('m');
select is((select count(*)::int from public.security_events), 1, 'CA-E9-09: m lê só o próprio');
select is((select count(*)::int from public.security_events where user_id = tests.uid('a')), 0,
  'CA-E9-09: outro integrante da mesma família lê 0 eventos de a');
select tests.login_as('b');
select is((select count(*)::int from public.security_events), 0, 'CA-E9-09: usuário de outra família lê 0');
select tests.login_as('a');
select throws_ok(format($$insert into public.security_events (user_id, action) values (%L, 'password.changed')$$, tests.uid('a')),
  '42501', null, 'CA-E9-09: insert pela API → 42501 (nem para si mesmo)');
select throws_ok($$update public.security_events set metadata = '{}'::jsonb$$, '42501', null, 'CA-E9-09: update → 42501');
select throws_ok($$delete from public.security_events$$, '42501', null, 'CA-E9-09: delete → 42501');
select tests.login_anon();
select throws_ok($$select * from public.security_events$$, '42501', null, 'CA-E9-09: anon sem acesso');
select tests.logout();

-- o trigger não é acionável pela API: a função não é executável por authenticated
select tests.login_as('a');
select throws_ok($$select private.log_password_changed()$$, '42501', null, 'CA-E9-09: authenticated não executa a função do trigger');
select tests.logout();

-- constraints
select throws_ok(format($$insert into public.security_events (user_id, action) values (%L, 'password.reset')$$, tests.uid('a')),
  '23514', null, 'CA-E9-09: action fora de password.changed → 23514');
select throws_ok(format($$insert into public.security_events (user_id, action, metadata) values (%L, 'password.changed', %L::jsonb)$$,
  tests.uid('a'), jsonb_build_object('k', repeat('x', 2000))::text), '23514', null, 'CA-E9-11: metadata acima de 1024 bytes → 23514');
select throws_ok(format($$insert into public.security_events (user_id, action, metadata) values (%L, 'password.changed', '[]'::jsonb)$$, tests.uid('a')),
  '23514', null, 'CA-E9-11: metadata que não é objeto → 23514');
select throws_ok($$insert into public.security_events (user_id, action) values (gen_random_uuid(), 'password.changed')$$,
  '23503', null, 'CA-E9-09: user_id inexistente → 23503 (FK para profiles)');

-- CA-E9-11 · usuário sem profile não quebra a troca de senha -----------------------------------------------------------------------------------
delete from public.profiles where id = tests.uid('c');
select lives_ok($$update auth.users set encrypted_password = 'hash-c' where id = tests.uid('c')$$,
  'CA-E9-11: trocar a senha de um usuário sem profile não falha');
select is((select count(*)::int from public.security_events where user_id = tests.uid('c')), 0, 'CA-E9-11: ...e o evento é omitido');
select is((select encrypted_password from auth.users where id = tests.uid('c')), 'hash-c', 'CA-E9-11: a troca em si foi gravada');

select * from finish();
rollback;
