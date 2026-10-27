-- CA-E2-07 (families/family_members), CA-E2-08, CA-E2-09, CA-E2-10, CA-E2-11, CA-E2-12.
begin;

select plan(29);

select tests.setup_world();

-- CA-E2-08: integrante lê a própria família e todos os vínculos ---------------------------------
select tests.login_as('m');
select is((select count(*)::int from public.families), 1, 'CA-E2-08: member vê só a própria família');
select is((select id from public.families), tests.fid('A'), 'CA-E2-08: a família visível é a A');
select is((select count(*)::int from public.family_members where family_id = tests.fid('A')), 3,
  'CA-E2-08: member vê os 3 vínculos da família');
select is((select count(*)::int from public.family_members), 3, 'CA-E2-08: member não vê vínculos de fora');

-- CA-E2-07: isolamento ----------------------------------------------------------------------------
select tests.login_as('b');
select is((select count(*)::int from public.families where id = tests.fid('A')), 0,
  'CA-E2-07: B lê 0 linhas da família A');
select is((select count(*)::int from public.family_members where family_id = tests.fid('A')), 0,
  'CA-E2-07: B lê 0 vínculos da família A');
select is((select count(*)::int from public.families), 1, 'CA-E2-07: B vê só a própria família');

select tests.login_as('c');
select is((select count(*)::int from public.families), 0, 'CA-E2-07: C (sem família) lê 0 famílias');
select is((select count(*)::int from public.family_members), 0, 'CA-E2-07: C lê 0 vínculos');

select tests.login_anon();
select throws_ok($$select count(*) from public.families$$, '42501', null, 'anon não lê families');
select throws_ok($$select count(*) from public.family_members$$, '42501', null, 'anon não lê family_members');

-- CA-E2-10: nenhuma escrita direta em family_members ----------------------------------------------
select tests.login_as('ad');
select throws_ok($$insert into public.family_members (family_id, user_id, role) values (tests.fid('A'), tests.uid('c'), 'member')$$,
  '42501', null, 'CA-E2-10: admin não insere vínculo');
select throws_ok($$update public.family_members set role = 'owner' where user_id = tests.uid('ad')$$,
  '42501', null, 'CA-E2-10: admin não se auto-promove');
select throws_ok($$delete from public.family_members where user_id = tests.uid('m')$$,
  '42501', null, 'CA-E2-10: admin não apaga vínculo');

select tests.login_as('a');
select throws_ok($$update public.family_members set role = 'member' where user_id = tests.uid('ad')$$,
  '42501', null, 'CA-E2-10: nem o owner altera papel direto (só RPC)');

select tests.login_as('m');
select throws_ok($$update public.family_members set role = 'owner' where user_id = tests.uid('m')$$,
  '42501', null, 'CA-E2-10: member não se auto-promove');

select tests.logout();
select is((select role from public.family_members where user_id = tests.uid('m')), 'member',
  'CA-E2-10: papel do member continua igual');
select is((select role from public.family_members where user_id = tests.uid('ad')), 'admin',
  'CA-E2-10: papel do admin continua igual');

-- CA-E2-11: renomear família -----------------------------------------------------------------------
select tests.login_as('m');
select is(tests.affected($$update public.families set name = 'Hack' where id = tests.fid('A')$$), 0,
  'CA-E2-11: member não renomeia (0 linhas)');
select tests.login_as('ad');
select is(tests.affected($$update public.families set name = 'Hack' where id = tests.fid('A')$$), 0,
  'CA-E2-11: admin não renomeia (0 linhas)');
select tests.login_as('b');
select is(tests.affected($$update public.families set name = 'Hack' where id = tests.fid('A')$$), 0,
  'CA-E2-11: dono de outra família não renomeia a A');
select tests.login_as('a');
select is(tests.affected($$update public.families set name = 'Família A Nova' where id = tests.fid('A')$$), 1,
  'CA-E2-11: owner renomeia');
select throws_ok($$update public.families set created_by = tests.uid('c') where id = tests.fid('A')$$,
  '42501', null, 'CA-E2-11: owner só atualiza a coluna name');
select throws_ok($$delete from public.families where id = tests.fid('A')$$,
  '42501', null, 'CA-E2-11: ninguém apaga família (owner)');
select throws_ok($$insert into public.families (name, created_by) values ('Nova', tests.uid('a'))$$,
  '42501', null, 'sem insert direto em families (só create_family)');
select tests.logout();
select is((select name from public.families where id = tests.fid('A')), 'Família A Nova', 'CA-E2-11: nome final da família A');

-- CA-E2-09: vínculo removido perde leitura imediatamente --------------------------------------------
update public.family_members set status = 'removed', ended_at = now() where user_id = tests.uid('m');
select tests.login_as('m');
select is((select count(*)::int from public.families) + (select count(*)::int from public.family_members)
        + (select count(*)::int from public.profiles where id <> tests.uid('m')), 0,
  'CA-E2-09: vínculo removido perde leitura de família, vínculos e perfis dos antigos colegas');
select tests.logout();

-- CA-E2-12: invariantes por índice/constraint --------------------------------------------------------
select throws_ok($$insert into public.family_members (family_id, user_id, role) values (tests.fid('A'), tests.uid('c'), 'owner')$$,
  '23505', null, 'CA-E2-12: segundo owner ativo na mesma família viola índice único');
select throws_ok($$insert into public.family_members (family_id, user_id, role) values (tests.fid('B'), tests.uid('a'), 'member')$$,
  '23505', null, 'ADR-0008: segunda família ativa para o mesmo usuário viola índice único');

select * from finish();
rollback;
