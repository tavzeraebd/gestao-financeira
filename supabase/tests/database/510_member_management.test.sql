-- CA-E7-02 (change_member_role), CA-E7-03 (transfer_ownership), CA-E7-04 (leave_family), CA-E7-05 (remove_family_member).
-- AB-110, AB-111, AB-112. A corrida entre duas sessões (AB-119, "transferência e remoção concorrentes do mesmo alvo") não cabe numa
-- sessão pgTAP: aqui ela é provada pela ordem sequencial (alvo já transferido/removido → NOT_FOUND/FORBIDDEN) e pelo desenho
-- (FOR UPDATE em ordem de id + releitura depois do lock); ver o relatório.
begin;

select no_plan();

select tests.setup_world();
select tests.create_user('x', 'Xavier Sem Familia');
create function tests.mem(p_key text) returns uuid language sql stable as $$
  select id from public.family_members where user_id = tests.uid(p_key)
  order by (status = 'active') desc, joined_at desc limit 1 $$;
grant execute on function tests.mem(text) to authenticated;

-- A: a = owner, ad = admin, m = member (setup_world) + c = member e d = admin (extras desta suíte). B: b = owner.
insert into public.family_members (family_id, user_id, role) values
  (tests.fid('A'), tests.uid('c'), 'member'),
  (tests.fid('A'), tests.uid('d'), 'admin');
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_ad', tests.mem('ad')::text, true);
select set_config('tests.mem_m', tests.mem('m')::text, true);
select set_config('tests.mem_c', tests.mem('c')::text, true);
select set_config('tests.mem_d', tests.mem('d')::text, true);
select set_config('tests.mem_b', tests.mem('b')::text, true);

-- CA-E7-02 · change_member_role -----------------------------------------------------------------------------------------------
select tests.login_as('a');
select lives_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'admin')$$, 'CA-E7-02: owner promove member a admin');
select is((select role from public.family_members where id = current_setting('tests.mem_m')::uuid), 'admin', 'CA-E7-02: papel gravado');
select lives_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'member')$$, 'CA-E7-02: owner rebaixa admin a member');
select is((select role from public.family_members where id = current_setting('tests.mem_m')::uuid), 'member', 'CA-E7-02: papel de volta');
select is((select count(*)::int from public.audit_events where action = 'member.role_changed'), 2, 'CA-E7-02: dois eventos member.role_changed');
select lives_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'member')$$, 'CA-E7-02: papel igual retorna sem erro');
select is((select count(*)::int from public.audit_events where action = 'member.role_changed'), 2, 'CA-E7-02: papel igual não gera evento');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'owner')$$, 'P0001', 'INVALID_INPUT',
  'CA-E7-02: p_role owner → INVALID_INPUT (AB-110)');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'x')$$, 'P0001', 'INVALID_INPUT',
  'CA-E7-02: p_role x → INVALID_INPUT');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, null)$$, 'P0001', 'INVALID_INPUT',
  'CA-E7-02: p_role nulo → INVALID_INPUT');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_a')::uuid, 'admin')$$, 'P0001', 'CANNOT_TARGET_SELF',
  'CA-E7-02: owner no próprio vínculo → CANNOT_TARGET_SELF');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_b')::uuid, 'admin')$$, 'P0001', 'NOT_FOUND',
  'CA-E7-02: alvo de outra família → NOT_FOUND');
select throws_ok($$select public.change_member_role(gen_random_uuid(), 'admin')$$, 'P0001', 'NOT_FOUND',
  'CA-E7-02: alvo inexistente → NOT_FOUND (mesma resposta)');
select throws_ok($$select public.change_member_role(null, 'admin')$$, 'P0001', 'NOT_FOUND', 'CA-E7-02: alvo nulo → NOT_FOUND');

select tests.login_as('ad');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'admin')$$, '42501', null,
  'CA-E7-02: admin chamando → 42501 (AB-110)');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_ad')::uuid, 'admin')$$, '42501', null,
  'CA-E7-02: admin no próprio vínculo → 42501');
select tests.login_as('m');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'admin')$$, '42501', null,
  'CA-E7-02: member no próprio vínculo (auto-promoção) → 42501 (AB-110)');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_c')::uuid, 'admin')$$, '42501', null,
  'CA-E7-02: member promovendo outro → 42501');
select tests.login_as('x');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'admin')$$, '42501', null,
  'CA-E7-02: usuário sem família → 42501');
select tests.login_as('b');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'admin')$$, 'P0001', 'NOT_FOUND',
  'CA-E7-02: owner de outra família mirando integrante de A → NOT_FOUND');
select tests.logout();
select is((select role from public.family_members where id = current_setting('tests.mem_m')::uuid), 'member',
  'CA-E7-02: nenhuma tentativa negada alterou o papel de m');

-- grants: a API não escreve em family_members de jeito nenhum
select tests.login_as('a');
select throws_ok($$update public.family_members set role = 'owner' where id = current_setting('tests.mem_ad')::uuid$$, '42501', null,
  'CA-E7-02: update direto de papel continua negado (owner)');
select tests.login_as('m');
select throws_ok($$update public.family_members set role = 'owner' where user_id = tests.uid('m')$$, '42501', null,
  'CA-E7-02: update direto de papel continua negado (member)');
select tests.logout();

-- CA-E7-05 · remove_family_member ------------------------------------------------------------------------------------------------
select tests.login_as('m');
select throws_ok($$select public.remove_family_member(current_setting('tests.mem_c')::uuid)$$, '42501', null,
  'CA-E7-05: member removendo → 42501');
select tests.login_as('x');
select throws_ok($$select public.remove_family_member(current_setting('tests.mem_c')::uuid)$$, '42501', null,
  'CA-E7-05: usuário sem família → 42501');
select tests.login_as('ad');
select throws_ok($$select public.remove_family_member(current_setting('tests.mem_d')::uuid)$$, '42501', null,
  'CA-E7-05: admin removendo admin → 42501');
select throws_ok($$select public.remove_family_member(current_setting('tests.mem_a')::uuid)$$, '42501', null,
  'CA-E7-05: admin removendo o owner → 42501 (AB-111)');
select throws_ok($$select public.remove_family_member(current_setting('tests.mem_ad')::uuid)$$, 'P0001', 'CANNOT_TARGET_SELF',
  'CA-E7-05: admin removendo a si → CANNOT_TARGET_SELF');
select throws_ok($$select public.remove_family_member(current_setting('tests.mem_b')::uuid)$$, 'P0001', 'NOT_FOUND',
  'CA-E7-05: alvo de outra família → NOT_FOUND');
select lives_ok($$select public.remove_family_member(current_setting('tests.mem_c')::uuid)$$, 'CA-E7-05: admin remove member');
select tests.login_as('a');
select throws_ok($$select public.remove_family_member(current_setting('tests.mem_c')::uuid)$$, 'P0001', 'NOT_FOUND',
  'CA-E7-05: segunda remoção do mesmo alvo → NOT_FOUND');
select throws_ok($$select public.remove_family_member(current_setting('tests.mem_a')::uuid)$$, 'P0001', 'CANNOT_TARGET_SELF',
  'CA-E7-05: owner removendo a si → CANNOT_TARGET_SELF (AB-111)');
select throws_ok($$select public.remove_family_member(gen_random_uuid())$$, 'P0001', 'NOT_FOUND', 'CA-E7-05: alvo inexistente → NOT_FOUND');
select throws_ok($$select public.remove_family_member(current_setting('tests.mem_b')::uuid)$$, 'P0001', 'NOT_FOUND',
  'CA-E7-05: owner mirando integrante de outra família → NOT_FOUND');
select lives_ok($$select public.remove_family_member(current_setting('tests.mem_d')::uuid)$$, 'CA-E7-05: owner remove admin');
select tests.login_as('b');
select throws_ok($$select public.remove_family_member(current_setting('tests.mem_m')::uuid)$$, 'P0001', 'NOT_FOUND',
  'CA-E7-05: owner de B removendo integrante de A → NOT_FOUND (AB-112)');
select tests.logout();

select is((select count(*)::int from public.family_members
            where id in (current_setting('tests.mem_c')::uuid, current_setting('tests.mem_d')::uuid)
              and status = 'removed' and ended_at is not null), 2, 'CA-E7-05: c e d com status removed e ended_at');
select is((select count(*)::int from public.family_members where family_id = tests.fid('A') and status = 'active'), 3,
  'CA-E7-05: a, ad e m seguem ativos');
select is((select count(*)::int from public.family_members where family_id = tests.fid('A') and role = 'owner' and status = 'active'), 1,
  'CA-E7-05: um owner ativo');
select tests.login_as('c');
select is((select count(*)::int from public.families) + (select count(*)::int from public.family_members), 0,
  'CA-E7-05: removido lê 0 linhas de família e de vínculos');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'admin')$$, '42501', null,
  'CA-E7-05: removido não executa RPCs de gestão (sem família → 42501)');
select tests.logout();

-- CA-E7-04 · leave_family ---------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select throws_ok($$select public.leave_family()$$, 'P0001', 'OWNER_MUST_TRANSFER', 'CA-E7-04: owner sai → OWNER_MUST_TRANSFER (AB-111)');
select tests.login_as('x');
select throws_ok($$select public.leave_family()$$, '42501', null, 'CA-E7-04: sem família → 42501');
select tests.login_as('m');
select lives_ok($$select public.leave_family()$$, 'CA-E7-04: member sai');
select is((select count(*)::int from public.family_members) + (select count(*)::int from public.families), 0,
  'CA-E7-04: depois de sair o usuário lê 0 linhas da família');
select throws_ok($$select public.leave_family()$$, '42501', null, 'CA-E7-04: sair duas vezes → 42501 (já sem vínculo ativo)');
select lives_ok($$select public.create_family('Nova do M')$$, 'CA-E7-04: depois de sair, o usuário pode criar outra família');
select is((select count(*)::int from public.families), 1, 'CA-E7-04: m enxerga só a família nova');
select tests.logout();
select ok((select status = 'left' and ended_at is not null from public.family_members where id = current_setting('tests.mem_m')::uuid),
  'CA-E7-04: vínculo antigo com status left e ended_at');

-- CA-E7-03 · transfer_ownership ------------------------------------------------------------------------------------------------------
select tests.login_as('ad');
select throws_ok($$select public.transfer_ownership(current_setting('tests.mem_a')::uuid)$$, '42501', null,
  'CA-E7-03: admin transferindo → 42501 (AB-111)');
select tests.login_as('a');
select throws_ok($$select public.transfer_ownership(current_setting('tests.mem_a')::uuid)$$, 'P0001', 'CANNOT_TARGET_SELF',
  'CA-E7-03: alvo = chamador → CANNOT_TARGET_SELF');
select throws_ok($$select public.transfer_ownership(gen_random_uuid())$$, 'P0001', 'NOT_FOUND', 'CA-E7-03: alvo inexistente → NOT_FOUND');
select throws_ok($$select public.transfer_ownership(current_setting('tests.mem_b')::uuid)$$, 'P0001', 'NOT_FOUND',
  'CA-E7-03: alvo de outra família → NOT_FOUND (AB-112)');
select throws_ok($$select public.transfer_ownership(current_setting('tests.mem_m')::uuid)$$, 'P0001', 'NOT_FOUND',
  'CA-E7-03: alvo que saiu (left) → NOT_FOUND');
select throws_ok($$select public.transfer_ownership(current_setting('tests.mem_c')::uuid)$$, 'P0001', 'NOT_FOUND',
  'CA-E7-03: alvo removido → NOT_FOUND');
select is((select role from public.family_members where id = current_setting('tests.mem_a')::uuid), 'owner',
  'CA-E7-03: tentativas negadas não mexeram no owner');
select lives_ok($$select public.transfer_ownership(current_setting('tests.mem_ad')::uuid)$$, 'CA-E7-03: owner transfere para o admin');
select tests.logout();
select is((select count(*)::int from public.family_members where family_id = tests.fid('A') and role = 'owner' and status = 'active'), 1,
  'CA-E7-03: exatamente um owner ativo');
select is((select role from public.family_members where id = current_setting('tests.mem_ad')::uuid), 'owner', 'CA-E7-03: o alvo é o owner');
select is((select role from public.family_members where id = current_setting('tests.mem_a')::uuid), 'admin', 'CA-E7-03: o anterior é admin');
select tests.login_as('ad');
select is(tests.affected($$update public.families set name = 'Renomeada pelo novo owner' where id = tests.fid('A')$$), 1,
  'CA-E7-03: o novo owner renomeia a família');
select tests.login_as('a');
select is(tests.affected($$update public.families set name = 'Renomeada pelo antigo owner' where id = tests.fid('A')$$), 0,
  'CA-E7-03: o antigo owner (agora admin) não renomeia');
select throws_ok($$select public.transfer_ownership(current_setting('tests.mem_ad')::uuid)$$, '42501', null,
  'CA-E7-03: o antigo owner não transfere mais');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_ad')::uuid, 'member')$$, '42501', null,
  'CA-E7-03: o antigo owner não altera mais papéis');
select tests.login_as('ad');
select lives_ok($$select public.change_member_role(current_setting('tests.mem_a')::uuid, 'member')$$,
  'CA-E7-03: o novo owner altera o papel do antigo');
select tests.logout();
select is((select count(*)::int from public.family_members where family_id = tests.fid('A') and role = 'owner' and status = 'active'), 1,
  'CA-E7-03: continua exatamente um owner ativo');

select * from finish();
rollback;
