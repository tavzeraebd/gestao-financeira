-- CA-E2-19: revoke_family_invite.
begin;

select plan(18);

select tests.setup_world();

select tests.stash_invite('m1', 'a', 'member');
select tests.stash_invite('m2', 'a', 'member');
select tests.stash_invite('m3', 'a', 'member');
select tests.stash_invite('a1', 'a', 'admin');
select tests.stash_invite('a2', 'a', 'admin');
select tests.stash_invite('bm', 'b', 'member');
select tests.stash_invite('used', 'a', 'member');

select tests.login_as('c');
select public.accept_family_invite(tests.tok('used'));

-- autenticação ------------------------------------------------------------------------------------------
select tests.login_anon();
select throws_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('m1')), '42501', null, 'anon não revoga');
select tests.login_no_sub();
select throws_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('m1')), 'P0001', 'NOT_AUTHENTICATED',
  'sem sub -> NOT_AUTHENTICATED');

-- member e usuário sem família ------------------------------------------------------------------------------
select tests.login_as('m');
select throws_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('m1')), '42501', null,
  'CA-E2-19: member -> FORBIDDEN');
select tests.login_as('d');
select throws_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('m1')), '42501', null,
  'usuário sem família -> FORBIDDEN');

-- admin ---------------------------------------------------------------------------------------------------
select tests.login_as('ad');
select lives_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('m1')), 'CA-E2-19: admin revoga convite member');
select throws_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('a1')), '42501', null,
  'CA-E2-19: admin revogando convite admin -> FORBIDDEN');

-- owner ---------------------------------------------------------------------------------------------------
select tests.login_as('a');
select lives_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('m2')), 'CA-E2-19: owner revoga convite member');
select lives_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('a1')), 'CA-E2-19: owner revoga convite admin');

-- outra família / inexistente / já usado --------------------------------------------------------------------
select throws_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('bm')), 'P0001', 'INVITE_NOT_FOUND',
  'CA-E2-19: convite de outra família -> INVITE_NOT_FOUND');
select throws_ok($$select public.revoke_family_invite(gen_random_uuid())$$, 'P0001', 'INVITE_NOT_FOUND',
  'convite inexistente -> INVITE_NOT_FOUND');
select throws_ok($$select public.revoke_family_invite(null)$$, 'P0001', 'INVITE_NOT_FOUND', 'id nulo -> INVITE_NOT_FOUND');
select throws_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('used')), 'P0001', 'INVITE_ALREADY_USED',
  'convite já aceito -> INVITE_ALREADY_USED');

-- idempotência -------------------------------------------------------------------------------------------------
select lives_ok(format($$select public.revoke_family_invite(%L)$$, tests.inv('m2')),
  'CA-E2-19: revogar duas vezes é idempotente (sem erro)');
select tests.logout();

-- estado e auditoria ---------------------------------------------------------------------------------------------
select is((select count(*)::int from public.family_invites
            where id in (tests.inv('m1'), tests.inv('m2'), tests.inv('a1')) and revoked_at is not null and revoked_by is not null), 3,
  'convites revogados têm revoked_at/revoked_by');
select ok((select revoked_by = tests.uid('ad') from public.family_invites where id = tests.inv('m1')), 'revoked_by = quem revogou');
select is((select count(*)::int from public.family_invites where id in (tests.inv('m3'), tests.inv('a2'), tests.inv('bm')) and revoked_at is not null), 0,
  'convites não alvo continuam ativos');
select is((select count(*)::int from public.audit_events where action = 'invite.revoked' and entity_id = tests.inv('m2')), 1,
  'CA-E2-19: segunda revogação não gera novo evento');
select is((select count(*)::int from public.audit_events where action = 'invite.revoked'), 3,
  'um evento invite.revoked por revogação efetiva');

select * from finish();
rollback;
