-- CA-E2-05, CA-E2-06: create_family.
begin;

select plan(21);

select tests.setup_world();

-- CA-E2-06: autenticação e validação ---------------------------------------------------------------
select tests.login_anon();
select throws_ok($$select public.create_family('X')$$, '42501', null, 'CA-E2-06: anon não executa create_family');

select tests.login_no_sub();
select throws_ok($$select public.create_family('X')$$, 'P0001', 'NOT_AUTHENTICATED',
  'CA-E2-06: authenticated sem sub -> NOT_AUTHENTICATED');

select tests.login_as('c');
select throws_ok($$select public.create_family('')$$, 'P0001', 'INVALID_INPUT', 'CA-E2-06: nome vazio -> INVALID_INPUT');
select throws_ok($$select public.create_family('    ')$$, 'P0001', 'INVALID_INPUT', 'nome só com espaços -> INVALID_INPUT');
select throws_ok($$select public.create_family(null)$$, 'P0001', 'INVALID_INPUT', 'nome nulo -> INVALID_INPUT');
select throws_ok($$select public.create_family(repeat('x', 81))$$, 'P0001', 'INVALID_INPUT',
  'CA-E2-06: nome com 81 caracteres -> INVALID_INPUT');

-- CA-E2-05: criação ----------------------------------------------------------------------------------
select lives_ok($$select set_config('tests.fam_c', public.create_family('  Família do Caio  ')::text, true)$$,
  'CA-E2-05: create_family conclui');
select is((select count(*)::int from public.families where id = current_setting('tests.fam_c')::uuid), 1,
  'CA-E2-05: criador enxerga a família criada');
select is((select name from public.families where id = current_setting('tests.fam_c')::uuid), 'Família do Caio',
  'CA-E2-05: nome gravado sem espaços nas pontas');
select is((select created_by from public.families where id = current_setting('tests.fam_c')::uuid), tests.uid('c'),
  'CA-E2-05: created_by = usuário autenticado');
select is((select role || '/' || status from public.family_members where family_id = current_setting('tests.fam_c')::uuid),
  'owner/active', 'CA-E2-05: vínculo owner ativo criado');
select is((select count(*)::int from public.audit_events
            where family_id = current_setting('tests.fam_c')::uuid and action = 'family.created'
              and actor_user_id = tests.uid('c') and metadata = '{}'::jsonb),
  1, 'CA-E2-05: evento family.created auditado pelo criador');

-- segunda chamada: ALREADY_IN_FAMILY e nada novo persiste
select throws_ok($$select public.create_family('Outra')$$, 'P0001', 'ALREADY_IN_FAMILY',
  'CA-E2-05: segunda chamada -> ALREADY_IN_FAMILY');
select tests.logout();
select is((select count(*)::int from public.families where created_by = tests.uid('c')), 1,
  'CA-E2-05: segunda chamada não criou família');
select is((select count(*)::int from public.family_members where user_id = tests.uid('c')), 1,
  'CA-E2-05: segunda chamada não criou vínculo');
select is((select count(*)::int from public.audit_events where actor_user_id = tests.uid('c')), 1,
  'CA-E2-05: segunda chamada não gerou auditoria');

-- quem já está em família (owner / member)
select tests.login_as('a');
select throws_ok($$select public.create_family('Segunda')$$, 'P0001', 'ALREADY_IN_FAMILY',
  'owner de outra família -> ALREADY_IN_FAMILY');
select tests.login_as('m');
select throws_ok($$select public.create_family('Segunda')$$, 'P0001', 'ALREADY_IN_FAMILY',
  'member de outra família -> ALREADY_IN_FAMILY');
select tests.logout();

-- vínculo encerrado libera nova família; limite de 80 caracteres aceito
update public.family_members set status = 'left', ended_at = now() where user_id = tests.uid('m');
select tests.login_as('m');
select lives_ok($$select public.create_family(repeat('y', 80))$$,
  'usuário com vínculo encerrado cria nova família; nome de 80 caracteres é aceito');
select tests.logout();
select is((select count(*)::int from public.family_members where user_id = tests.uid('m') and status = 'active' and role = 'owner'), 1,
  'novo vínculo owner ativo do ex-integrante');
select is((select count(*)::int from public.family_members where user_id = tests.uid('m')), 2,
  'histórico preservado: vínculo antigo + novo');

select * from finish();
rollback;
