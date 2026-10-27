-- CA-E2-04 (trigger de cadastro), CA-E2-21 (update só do próprio perfil),
-- parte de profiles de CA-E2-07 (isolamento) e CA-E2-08 (co-integrantes).
begin;

select plan(23);

select tests.setup_world();

-- CA-E2-04 ---------------------------------------------------------------------------------------
select is((select display_name from public.profiles where id = tests.uid('a')), 'Ana Dona',
  'CA-E2-04: profile criado com display_name do metadata');

select tests.create_user('longo', repeat('x', 100));
select is((select char_length(display_name) from public.profiles where id = tests.uid('longo')), 80,
  'CA-E2-04: display_name cortado em 80');

select tests.create_user('semnome');
select is((select display_name from public.profiles where id = tests.uid('semnome')), 'semnome',
  'CA-E2-04: sem display_name usa a parte local do e-mail');

select tests.create_user('branco', '    ');
select is((select display_name from public.profiles where id = tests.uid('branco')), 'branco',
  'CA-E2-04: display_name só com espaços usa a parte local do e-mail');

select tests.create_user('aparado', '   Maria   ');
select is((select display_name from public.profiles where id = tests.uid('aparado')), 'Maria',
  'CA-E2-04: display_name é aparado (trim)');

select is((select count(*)::int from public.profiles p join auth.users u on u.id = p.id), (select count(*)::int from auth.users),
  'CA-E2-04: todo usuário do Auth tem profile');

-- CA-E2-08 / CA-E2-07 (profiles) -----------------------------------------------------------------
select tests.login_as('a');
select is((select count(*)::int from public.profiles), 3,
  'CA-E2-08: owner vê o próprio perfil e o dos 2 co-integrantes (e nenhum de fora)');
select is((select count(*)::int from public.profiles where id in (tests.uid('b'), tests.uid('c'))), 0,
  'CA-E2-07: owner não vê perfil de outra família nem de usuário sem família');

select tests.login_as('m');
select is((select count(*)::int from public.profiles where id in (tests.uid('a'), tests.uid('ad'), tests.uid('m'))), 3,
  'CA-E2-08: member vê o perfil dos co-integrantes');

select tests.login_as('b');
select is((select count(*)::int from public.profiles where id in (tests.uid('a'), tests.uid('ad'), tests.uid('m'))), 0,
  'CA-E2-07: usuário B lê 0 perfis dos integrantes de A');

select tests.login_as('c');
select is((select count(*)::int from public.profiles), 1,
  'CA-E2-07: usuário sem família vê só o próprio perfil');

select tests.login_anon();
select throws_ok($$select count(*) from public.profiles$$, '42501', null, 'anon não lê profiles');

-- CA-E2-21 ---------------------------------------------------------------------------------------
select tests.login_as('a');
select lives_ok($$update public.profiles set display_name = 'Ana Nova' where id = tests.uid('a')$$,
  'CA-E2-21: usuário atualiza o próprio display_name');
select is((select display_name from public.profiles where id = tests.uid('a')), 'Ana Nova',
  'CA-E2-21: display_name próprio foi alterado');
select throws_ok($$update public.profiles set avatar_url = 'https://exemplo.com/a.png' where id = tests.uid('a')$$,
  '42501', null, 'SEC-7: authenticated não atualiza avatar_url (sem grant de coluna)');
select throws_ok($$update public.profiles set avatar_url = null where id = tests.uid('a')$$,
  '42501', null, 'SEC-7: nem para limpar o avatar_url');
select throws_ok($$update public.profiles set display_name = '   ' where id = tests.uid('a')$$,
  '23514', null, 'display_name vazio é rejeitado');
select is(
  tests.affected($$update public.profiles set display_name = 'Invasão' where id = tests.uid('ad')$$),
  0, 'CA-E2-21: update de perfil alheio afeta 0 linhas');
select throws_ok($$update public.profiles set id = tests.uid('zzz') where id = tests.uid('a')$$,
  '42501', null, 'CA-E2-21: não altera o id (sem grant de coluna)');
select throws_ok($$update public.profiles set created_at = now() where id = tests.uid('a')$$,
  '42501', null, 'colunas fora do grant (created_at) não são atualizáveis');
select throws_ok($$insert into public.profiles (id, display_name) values (tests.uid('zzz'), 'X')$$,
  '42501', null, 'sem insert em profiles pela API');
select throws_ok($$delete from public.profiles where id = tests.uid('a')$$,
  '42501', null, 'sem delete em profiles pela API');

select tests.logout();
select is((select display_name from public.profiles where id = tests.uid('ad')), 'Beto Admin',
  'perfil alheio permanece inalterado');

select * from finish();
rollback;
