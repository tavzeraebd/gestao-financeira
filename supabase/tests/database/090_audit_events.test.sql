-- CA-E2-20 e a parte de audit_events de CA-E2-07: leitura só por owner/admin, append-only,
-- metadata sem dados pessoais nem token.
begin;

select plan(18);

select tests.setup_world();

-- gera os eventos da Etapa 2 pelas RPCs: family.created (família do d), invite.created, member.joined, invite.revoked
select tests.login_as('d');
select public.create_family('Família do Dani');
select tests.logout();
select tests.stash_invite('x', 'a', 'member', 'c@test.local');
select tests.stash_invite('y', 'ad', 'member');
select tests.login_as('c');
select public.accept_family_invite(tests.tok('x'));
select tests.login_as('a');
select public.revoke_family_invite(tests.inv('y'));
select tests.logout();

-- leitura ---------------------------------------------------------------------------------------------------
select tests.login_as('a');
select is((select count(*)::int from public.audit_events where family_id = tests.fid('A')), 4,
  'CA-E2-20: owner lê os 4 eventos da família A (2 invite.created, member.joined, invite.revoked)');
select is((select count(*)::int from public.audit_events where family_id <> tests.fid('A')), 0,
  'CA-E2-07: owner de A não lê eventos de outras famílias');
select tests.login_as('ad');
select is((select count(*)::int from public.audit_events where family_id = tests.fid('A')), 4, 'CA-E2-20: admin lê os eventos');
select tests.login_as('m');
select is((select count(*)::int from public.audit_events), 0, 'CA-E2-20: member lê 0 eventos');
select tests.login_as('b');
select is((select count(*)::int from public.audit_events), 0, 'CA-E2-07: B lê 0 eventos de A');
select tests.login_as('c');
select is((select count(*)::int from public.audit_events where family_id = tests.fid('A')), 0,
  'CA-E2-07: C (agora member de A) não lê eventos');
select tests.login_anon();
select throws_ok($$select count(*) from public.audit_events$$, '42501', null, 'anon não lê audit_events');

-- append-only ------------------------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok($$insert into public.audit_events (family_id, entity_type, action) values (tests.fid('A'), 'x', 'a.b')$$,
  '42501', null, 'CA-E2-20: ninguém insere via API (owner)');
select throws_ok($$update public.audit_events set action = 'a.b'$$, '42501', null, 'CA-E2-20: ninguém atualiza via API (owner)');
select throws_ok($$delete from public.audit_events$$, '42501', null, 'CA-E2-20: ninguém apaga via API (owner)');
select tests.login_as('ad');
select throws_ok($$delete from public.audit_events$$, '42501', null, 'CA-E2-20: admin não apaga');
select throws_ok($$select private.log_audit(tests.fid('A'), 'x', null, 'a.b')$$, '42501', null,
  'log_audit não é executável por authenticated');
select tests.logout();

-- conteúdo dos eventos ----------------------------------------------------------------------------------------------
select is((select string_agg(distinct action, ',' order by action) from public.audit_events),
  'family.created,invite.created,invite.revoked,member.joined', 'catálogo de ações da Etapa 2');
select is((select count(*)::int from public.audit_events
            where metadata ?| array['email', 'token', 'name', 'display_name', 'invited_email']), 0,
  'CA-E2-20: metadata sem chaves email/token/name/display_name');
select is((select count(*)::int from public.audit_events
            where metadata::text ~* '(@test\.local|Dani|Caio|Fam[ií]lia)'
               or metadata::text like '%' || tests.tok('x') || '%'
               or metadata::text like '%' || tests.tok('y') || '%'), 0,
  'CA-E2-20: metadata sem valores de e-mail, nome ou token');
select is((select metadata ->> 'has_email_binding' from public.audit_events
            where action = 'invite.created' and entity_id = tests.inv('x')), 'true',
  'invite.created registra só has_email_binding (booleano)');
select is((select actor_user_id from public.audit_events where action = 'member.joined'), tests.uid('c'),
  'member.joined tem o ator correto');
select is((select count(*)::int from public.audit_events where actor_user_id is null), 0,
  'todo evento da Etapa 2 tem ator');

select * from finish();
rollback;
