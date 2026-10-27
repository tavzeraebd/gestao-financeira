-- CA-E2-17, CA-E2-18: accept_family_invite.
begin;

select plan(21);

select tests.setup_world();
select tests.create_user('e');
select tests.create_user('f');

select tests.stash_invite('adm', 'a', 'admin');
select tests.stash_invite('mem', 'ad', 'member');
select tests.stash_invite('exp', 'a', 'member');
select tests.stash_invite('rev', 'a', 'member');
select tests.stash_invite('mail', 'a', 'member', 'Outra@Test.Local');
select tests.stash_invite('bound', 'a', 'member', 'f@test.local');
select tests.stash_invite('fam', 'a', 'member');

-- autenticação ------------------------------------------------------------------------------------------
select tests.login_anon();
select throws_ok(format($$select public.accept_family_invite(%L)$$, tests.tok('mem')), '42501', null, 'anon não aceita convite');
select tests.login_no_sub();
select throws_ok(format($$select public.accept_family_invite(%L)$$, tests.tok('mem')), 'P0001', 'NOT_AUTHENTICATED',
  'sem sub -> NOT_AUTHENTICATED');
select tests.logout();

-- CA-E2-17: aceite válido ---------------------------------------------------------------------------------
select tests.login_as('c');
select is(public.accept_family_invite(tests.tok('adm')), tests.fid('A'), 'CA-E2-17: aceite devolve o family_id');
select tests.logout();
select is((select role || '/' || status from public.family_members where family_id = tests.fid('A') and user_id = tests.uid('c')),
  'admin/active', 'CA-E2-17: vínculo criado com o papel do convite (admin)');
select ok((select accepted_at is not null and accepted_by = tests.uid('c') from public.family_invites where id = tests.inv('adm')),
  'CA-E2-17: accepted_at/accepted_by preenchidos');
select is((select count(*)::int from public.audit_events where family_id = tests.fid('A') and action = 'member.joined'
            and actor_user_id = tests.uid('c') and metadata ->> 'role' = 'admin'
            and metadata ->> 'invite_id' = tests.inv('adm')::text),
  1, 'CA-E2-17: member.joined auditado');
select tests.login_as('d');
select is(public.accept_family_invite(tests.tok('mem')), tests.fid('A'), 'aceite de convite member');
select tests.logout();
select is((select role from public.family_members where family_id = tests.fid('A') and user_id = tests.uid('d')), 'member',
  'CA-E2-17: vínculo com papel member');
select tests.login_as('c');
select is((select count(*)::int from public.family_members where family_id = tests.fid('A')), 5,
  'após o aceite, o novo integrante enxerga todos os vínculos da família');
select tests.logout();

-- e-mail vinculado: aceite com o e-mail certo (comparação sem diferença de caixa)
select tests.login_as('f');
select is(public.accept_family_invite(tests.tok('bound')), tests.fid('A'), 'convite vinculado a e-mail é aceito pelo dono do e-mail');
select tests.logout();

-- CA-E2-18: falhas, e nada persiste --------------------------------------------------------------------------
update public.family_invites set created_at = now() - interval '8 days', expires_at = now() - interval '1 second'
  where id = tests.inv('exp');
select tests.login_as('a');
select public.revoke_family_invite(tests.inv('rev'));

select tests.login_as('e');
select throws_ok(format($$select public.accept_family_invite(%L)$$, tests.tok('mem')), 'P0001', 'INVITE_ALREADY_USED',
  'CA-E2-18: aceite repetido -> INVITE_ALREADY_USED');
select throws_ok(format($$select public.accept_family_invite(%L)$$, tests.tok('exp')), 'P0001', 'INVITE_EXPIRED',
  'CA-E2-18: convite expirado -> INVITE_EXPIRED');
select throws_ok(format($$select public.accept_family_invite(%L)$$, tests.tok('rev')), 'P0001', 'INVITE_REVOKED',
  'CA-E2-18: convite revogado -> INVITE_REVOKED');
select throws_ok(format($$select public.accept_family_invite(%L)$$, tests.tok('mail')), 'P0001', 'INVITE_EMAIL_MISMATCH',
  'CA-E2-18: e-mail diferente do vinculado -> INVITE_EMAIL_MISMATCH');
select throws_ok(format($$select public.accept_family_invite(%L)$$, encode(extensions.gen_random_bytes(32), 'hex')),
  'P0001', 'INVITE_NOT_FOUND', 'token desconhecido -> INVITE_NOT_FOUND');
select throws_ok($$select public.accept_family_invite('xyz')$$, 'P0001', 'INVITE_NOT_FOUND', 'token malformado -> INVITE_NOT_FOUND');
select throws_ok($$select public.accept_family_invite(null)$$, 'P0001', 'INVITE_NOT_FOUND', 'token nulo -> INVITE_NOT_FOUND');

select tests.login_as('b');
select throws_ok(format($$select public.accept_family_invite(%L)$$, tests.tok('fam')), 'P0001', 'ALREADY_IN_FAMILY',
  'CA-E2-18: usuário já em família -> ALREADY_IN_FAMILY');
select tests.logout();

-- nada persistiu nas falhas
select is((select count(*)::int from public.family_members where user_id in (tests.uid('e'), tests.uid('b')) and family_id = tests.fid('A')), 0,
  'CA-E2-18: nenhum vínculo criado pelas tentativas que falharam');
select is((select count(*)::int from public.family_invites where accepted_at is not null), 3,
  'CA-E2-18: só os 3 aceites válidos marcaram accepted_at');
select is((select count(*)::int from public.audit_events where action = 'member.joined'), 3,
  'CA-E2-18: só os 3 aceites válidos geraram member.joined');

select * from finish();
rollback;
