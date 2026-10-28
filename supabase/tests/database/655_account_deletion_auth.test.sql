-- CA-E9-22 (ADR-0038 §6, AB-128): a parte de delete_my_account() que escreve em auth.* — identities, sessions, mfa_factors e
-- one_time_tokens do usuário apagados; e-mail antigo livre para novo cadastro; falha em auth.users desfaz TUDO (nada de estado parcial);
-- a pré-checagem de privilégios (ACCOUNT_ERASURE_UNAVAILABLE) é função testável.
-- Isolado do 650 porque semeia tabelas internas do GoTrue (o schema muda entre versões): se uma coluna mudar, só este arquivo cai e
-- o 650 (regra de negócio) continua dizendo a verdade.
begin;

select no_plan();

select tests.setup_world();
select tests.create_user('x', 'Xavier Sem Familia');

-- x tem senha (gera 1 password.changed pelo trigger de M2); c é o controle
update auth.users set encrypted_password = '$2a$10$0123456789012345678901uPlaceholderHashForTestsOnly000000000' where id = tests.uid('x');
insert into auth.identities (provider_id, user_id, identity_data, provider)
  select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email'
  from auth.users u where u.id in (tests.uid('x'), tests.uid('c'));
insert into auth.sessions (id, user_id)
  select gen_random_uuid(), u.id from auth.users u where u.id in (tests.uid('x'), tests.uid('c'));
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  select gen_random_uuid(), u.id, 'teste', 'totp'::auth.factor_type, 'unverified'::auth.factor_status, now(), now()
  from auth.users u where u.id in (tests.uid('x'), tests.uid('c'));
do $$
begin
  if to_regclass('auth.one_time_tokens') is not null then
    insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to)
      select gen_random_uuid(), u.id, 'recovery_token'::auth.one_time_token_type, md5(u.id::text), u.email
      from auth.users u where u.id in (tests.uid('x'), tests.uid('c'));
    perform set_config('tests.ott', 'yes', true);
  end if;
exception when others then
  raise notice 'one_time_tokens nao semeado (%): a verificacao correspondente sera pulada', sqlerrm;
end
$$;

select is((select count(*)::int from public.security_events where user_id = tests.uid('x')), 1, 'cenário: x tem 1 security_event (password.changed)');
select is((select count(*)::int from auth.identities where user_id = tests.uid('x')), 1, 'cenário: x tem 1 identity');
select is((select count(*)::int from auth.sessions where user_id = tests.uid('x')), 1, 'cenário: x tem 1 sessão');
select is((select count(*)::int from auth.mfa_factors where user_id = tests.uid('x')), 1, 'cenário: x tem 1 fator de MFA');

-- pré-checagem de privilégios (falha segura e explícita) -------------------------------------------------------------------------------
select is(private.account_erasure_auth_ready(current_user), true, 'o papel que roda as migrations escreve em auth.* (se falhar: Plano B do ADR-0038, docs/log-execucao.md)');
select is(private.account_erasure_auth_ready('authenticated'), false, 'authenticated não escreveria em auth.* → função devolve false');
select is(private.account_erasure_auth_ready('anon'), false, 'anon não escreveria em auth.* → função devolve false');

-- falha em auth.users desfaz tudo ---------------------------------------------------------------------------------------------------
create function tests.fail_auth_update() returns trigger language plpgsql as $$
begin
  raise exception 'AUTH_STEP_FAILED' using errcode = 'P0001';
end;
$$;
create trigger zz_fail_auth_update before update on auth.users
  for each row when (new.deleted_at is not null and old.deleted_at is null) execute function tests.fail_auth_update();

select set_config('tests.h0', tests.world_hash(), true);
select tests.login_amr('x');
select throws_ok($$select public.delete_my_account()$$, 'P0001', 'AUTH_STEP_FAILED',
  'CA-E9-22: erro na escrita em auth.users SOBE (não é engolido) e aborta a exclusão');
select tests.logout();
select is(tests.world_hash(), current_setting('tests.h0'), 'CA-E9-22: nada mudou (perfil, notificações, eventos, log e auth.users iguais)');
select is((select count(*)::int from auth.identities where user_id = tests.uid('x')), 1, 'CA-E9-22: identities intactas depois da falha');
select is((select count(*)::int from auth.sessions where user_id = tests.uid('x')), 1, 'CA-E9-22: sessões intactas depois da falha');
select is((select count(*)::int from public.security_events where user_id = tests.uid('x')), 1, 'CA-E9-22: security_events intactos depois da falha');
drop trigger zz_fail_auth_update on auth.users;

-- caminho feliz ---------------------------------------------------------------------------------------------------------------------
select tests.login_amr('x');
select is((select public.delete_my_account()), '{"family_erased": false}'::jsonb, 'CA-E9-22: x exclui a conta');
select tests.logout();

select ok((select deleted_at is not null and encrypted_password is null and banned_until > now() + interval '100 years'
    and raw_user_meta_data = '{}'::jsonb and email = 'conta-excluida+' || id::text || '@excluida.invalid'
    from auth.users where id = tests.uid('x')), 'CA-E9-22: auth.users de x neutralizado');
select is((select count(*)::int from auth.identities where user_id = tests.uid('x')), 0, 'CA-E9-22: identities de x apagadas');
select is((select count(*)::int from auth.sessions where user_id = tests.uid('x')), 0, 'CA-E9-22: sessões de x apagadas');
select is((select count(*)::int from auth.mfa_factors where user_id = tests.uid('x')), 0, 'CA-E9-22: fatores de MFA de x apagados');
select case when current_setting('tests.ott', true) = 'yes'
  then is((select count(*)::int from auth.one_time_tokens where user_id = tests.uid('x')), 0, 'CA-E9-22: tokens de uso único de x apagados')
  else skip('auth.one_time_tokens ausente ou não semeada neste GoTrue', 1) end;
select is((select count(*)::int from public.security_events where user_id = tests.uid('x')), 0,
  'CA-E9-22: security_events de x apagados (a anulação da senha não gera password.changed)');

select is((select count(*)::int from auth.identities where user_id = tests.uid('c')), 1, 'CA-E9-22: identities de c (controle) intactas');
select is((select count(*)::int from auth.sessions where user_id = tests.uid('c')), 1, 'CA-E9-22: sessões de c intactas');
select is((select count(*)::int from auth.mfa_factors where user_id = tests.uid('c')), 1, 'CA-E9-22: MFA de c intacto');
select ok((select deleted_at is null and email = 'c@test.local' from auth.users where id = tests.uid('c')), 'CA-E9-22: auth.users de c intacto');

-- o e-mail antigo fica livre (conta nova, sem vínculo) -----------------------------------------------------------------------------------
select lives_ok($$insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), 'authenticated', 'authenticated', 'x@test.local', '{}'::jsonb, now(), now())$$,
  'CA-E9-22: o e-mail antigo cadastra uma conta nova sem erro');
select is((select count(*)::int from auth.users where email = 'x@test.local'), 1, 'CA-E9-22: existe 1 conta ativa com o e-mail antigo');
select is((select count(*)::int from public.profiles p join auth.users u on u.id = p.id where u.email = 'x@test.local' and p.display_name = 'x'), 1,
  'CA-E9-22: a conta nova tem perfil próprio, sem herdar nada da excluída');
select is((select display_name from public.profiles where id = tests.uid('x')), 'Conta excluída', 'CA-E9-22: o perfil antigo continua anonimizado');

-- segunda chamada com o mesmo token
select set_config('tests.h1', tests.world_hash(), true);
select tests.login_amr('x');
select throws_ok($$select public.delete_my_account()$$, '42501', 'FORBIDDEN', 'CA-E9-22: segunda chamada com o mesmo token → FORBIDDEN');
select tests.logout();
select is(tests.world_hash(), current_setting('tests.h1'), 'CA-E9-22: sem efeito');
select is((select count(*)::int from private.account_erasure_log where user_id = tests.uid('x')), 1, 'CA-E9-22: uma única linha de prova por usuário');

select * from finish();
rollback;
