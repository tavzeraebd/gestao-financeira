-- CA-E2-13, CA-E2-14, CA-E2-15, CA-E2-16 e a parte de family_invites de CA-E2-07:
-- create_family_invite e get_invite_preview.
begin;

select plan(44);

select tests.setup_world();

-- CA-E2-13: quem pode criar -----------------------------------------------------------------------
select tests.login_anon();
select throws_ok($$select * from public.create_family_invite('member', null)$$, '42501', null, 'anon não cria convite');
select tests.login_no_sub();
select throws_ok($$select * from public.create_family_invite('member', null)$$, 'P0001', 'NOT_AUTHENTICATED',
  'sem sub -> NOT_AUTHENTICATED');
select tests.login_as('c');
select throws_ok($$select * from public.create_family_invite('member', null)$$, '42501', null,
  'usuário sem família -> FORBIDDEN');

select tests.login_as('a');
select lives_ok($$select * from public.create_family_invite('member', null)$$, 'CA-E2-13: owner cria convite member');
select lives_ok($$select * from public.create_family_invite('admin', null)$$, 'CA-E2-13: owner cria convite admin');
select lives_ok($$select * from public.create_family_invite()$$, 'papel padrão é member');
select throws_ok($$select * from public.create_family_invite('owner', null)$$, 'P0001', 'INVALID_INPUT',
  'convite nunca cria owner');
select throws_ok($$select * from public.create_family_invite(null, null)$$, 'P0001', 'INVALID_INPUT', 'papel nulo -> INVALID_INPUT');
select throws_ok($$select * from public.create_family_invite('member', 'sem-arroba')$$, 'P0001', 'INVALID_INPUT',
  'e-mail sem @ -> INVALID_INPUT');

select tests.login_as('ad');
select lives_ok($$select * from public.create_family_invite('member', null)$$, 'CA-E2-13: admin cria convite member');
select throws_ok($$select * from public.create_family_invite('admin', null)$$, '42501', null,
  'CA-E2-13: admin com papel admin -> FORBIDDEN');

select tests.login_as('m');
select throws_ok($$select * from public.create_family_invite('member', null)$$, '42501', null,
  'CA-E2-13: member -> FORBIDDEN');
select throws_ok($$select * from public.create_family_invite('admin', null)$$, '42501', null,
  'CA-E2-13: member (papel admin) -> FORBIDDEN');
select tests.logout();

-- CA-E2-14: hash do token ------------------------------------------------------------------------------
select tests.stash_invite('h', 'a', 'member', '  Hash@Test.LOCAL ');
select matches(tests.tok('h'), '^[0-9a-f]{64}$', 'CA-E2-14: token devolvido tem 64 hex');
select is((select token_hash from public.family_invites where id = tests.inv('h')),
  encode(sha256(convert_to(tests.tok('h'), 'UTF8')), 'hex'), 'CA-E2-14: token_hash = sha256(token)');
select is((select count(*)::int from public.family_invites i where i::text like '%' || tests.tok('h') || '%'), 0,
  'CA-E2-14: token em claro não aparece em nenhuma coluna');
select is((select invited_email from public.family_invites where id = tests.inv('h')), 'hash@test.local',
  'e-mail do convite normalizado (trim + minúsculas)');
select is((select expires_at - created_at from public.family_invites where id = tests.inv('h')), interval '7 days',
  'validade de 7 dias');
select tests.login_as('a');
select throws_ok($$select token_hash from public.family_invites$$, '42501', null,
  'CA-E2-14: select token_hash por authenticated -> 42501');
select throws_ok($$select * from public.family_invites$$, '42501', null, 'CA-E2-14: select * -> 42501');
select lives_ok($$select id, family_id, role, invited_email, created_by, expires_at, accepted_at, accepted_by, revoked_at, revoked_by, created_at from public.family_invites$$,
  'colunas do grant são legíveis pelo owner');
select throws_ok($$insert into public.family_invites (family_id, token_hash, created_by, expires_at) values (tests.fid('A'), repeat('a', 64), tests.uid('a'), now() + interval '1 day')$$,
  '42501', null, 'sem insert direto em family_invites');
select throws_ok($$update public.family_invites set role = 'admin'$$, '42501', null, 'sem update direto em family_invites');
select throws_ok($$delete from public.family_invites$$, '42501', null, 'sem delete direto em family_invites');

-- visibilidade (CA-E2-07)
select cmp_ok((select count(*)::int from public.family_invites), '>=', 5, 'owner lê os convites da família');
select tests.login_as('ad');
select cmp_ok((select count(*)::int from public.family_invites), '>=', 5, 'admin lê os convites da família');
select tests.login_as('m');
select is((select count(*)::int from public.family_invites), 0, 'member lê 0 convites');
select tests.login_as('b');
select is((select count(*)::int from public.family_invites), 0, 'CA-E2-07: B lê 0 convites de A');
select tests.login_as('c');
select is((select count(*)::int from public.family_invites), 0, 'CA-E2-07: C lê 0 convites de A');
select tests.logout();

-- CA-E2-16: prévia ------------------------------------------------------------------------------------
select tests.login_anon();
select throws_ok(format($$select * from public.get_invite_preview(%L)$$, tests.tok('h')), '42501', null,
  'CA-E2-16: anon -> 42501');
select tests.login_no_sub();
select throws_ok(format($$select * from public.get_invite_preview(%L)$$, tests.tok('h')), 'P0001', 'NOT_AUTHENTICATED',
  'CA-E2-16: sem sub -> NOT_AUTHENTICATED');
select tests.login_as('c');
select results_eq(format($$select family_name, role, status, email_bound from public.get_invite_preview(%L)$$, tests.tok('h')),
  $$values ('Família A'::text, 'member'::text, 'pending'::text, true)$$,
  'CA-E2-16: prévia traz nome da família, papel, status pending e se há e-mail vinculado');
select throws_ok(format($$select * from public.get_invite_preview(%L)$$, encode(extensions.gen_random_bytes(32), 'hex')),
  'P0001', 'INVITE_NOT_FOUND', 'CA-E2-16: token aleatório -> INVITE_NOT_FOUND');
select throws_ok($$select * from public.get_invite_preview('abc')$$, 'P0001', 'INVITE_NOT_FOUND',
  'token malformado -> INVITE_NOT_FOUND');
select throws_ok($$select * from public.get_invite_preview(null)$$, 'P0001', 'INVITE_NOT_FOUND',
  'token nulo -> INVITE_NOT_FOUND');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'get_invite_preview' and p.pronargs = 1
              and pg_get_function_result(p.oid) = 'TABLE(family_name text, role text, expires_at timestamp with time zone, status text, email_bound boolean)'),
  1, 'prévia não expõe e-mail nem quem convidou (assinatura de retorno)');
select tests.logout();

-- prévia reflete o estado: expired / revoked / accepted
select tests.stash_invite('exp', 'a', 'member');
select tests.stash_invite('rev', 'a', 'member');
select tests.stash_invite('acc', 'a', 'member');
update public.family_invites set created_at = now() - interval '8 days', expires_at = now() - interval '1 second'
  where id = tests.inv('exp');
select tests.login_as('a');
select public.revoke_family_invite(tests.inv('rev'));
select tests.login_as('c');
select public.accept_family_invite(tests.tok('acc'));
select is((select status from public.get_invite_preview(tests.tok('exp'))), 'expired', 'prévia: expired');
select is((select status from public.get_invite_preview(tests.tok('rev'))), 'revoked', 'prévia: revoked');
select is((select status from public.get_invite_preview(tests.tok('acc'))), 'accepted', 'prévia: accepted');
select tests.logout();

-- CA-E2-15: limite de 20 pendentes ---------------------------------------------------------------------
-- pendentes atuais em A: não contam expirado, revogado nem aceito.
select tests.login_as('a');
select is((select count(*)::int from public.family_invites
            where accepted_at is null and revoked_at is null and expires_at > now()), 5,
  'pendentes antes do teste de limite (expirado/revogado/aceito não contam)');
select lives_ok($$select count(*) from (select public.create_family_invite('member', null) from generate_series(1, 15)) s$$,
  'CA-E2-15: chega a 20 pendentes');
select throws_ok($$select * from public.create_family_invite('member', null)$$, 'P0001', 'INVITE_LIMIT_REACHED',
  'CA-E2-15: 21º convite pendente -> INVITE_LIMIT_REACHED');
select public.revoke_family_invite(tests.inv('h'));
select lives_ok($$select * from public.create_family_invite('member', null)$$,
  'revogar libera uma vaga do limite');
select tests.login_as('b');
select lives_ok($$select * from public.create_family_invite('member', null)$$, 'limite é por família (B não é afetada)');
select tests.logout();

select * from finish();
rollback;
