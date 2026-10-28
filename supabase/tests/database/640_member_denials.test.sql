-- CA-E9-12 a CA-E9-15 (M3, ADR-0036, SEC-26): change_member_role, transfer_ownership e remove_family_member DEVOLVEM o código da negação
-- (FORBIDDEN, CANNOT_TARGET_SELF, NOT_FOUND) e gravam member.action_denied {operation, reason}; sem família → FORBIDDEN sem gravar;
-- teto de 20 eventos por ator por hora; INVALID_INPUT e NOT_AUTHENTICATED continuam exceção; sucesso devolve null.
-- NÃO coberto aqui (precisa de duas sessões): transferência x remoção concorrentes e a liberação dos FOR UPDATE depois da negação;
-- ver tests/integration (backend) e o relatório.
begin;

select no_plan();

select tests.setup_world();
select tests.create_user('x', 'Xavier Sem Familia');
insert into public.family_members (family_id, user_id, role) values
  (tests.fid('A'), tests.uid('c'), 'member'),
  (tests.fid('A'), tests.uid('d'), 'admin');
select set_config('tests.mem_a', (select id::text from public.family_members where user_id = tests.uid('a')), true);
select set_config('tests.mem_ad', (select id::text from public.family_members where user_id = tests.uid('ad')), true);
select set_config('tests.mem_m', (select id::text from public.family_members where user_id = tests.uid('m')), true);
select set_config('tests.mem_c', (select id::text from public.family_members where user_id = tests.uid('c')), true);
select set_config('tests.mem_b', (select id::text from public.family_members where user_id = tests.uid('b')), true);
delete from public.audit_events;

-- CA-E9-12 · as negações devolvem o código ------------------------------------------------------------------------------------------------
select tests.login_as('m');
select is((select public.change_member_role(current_setting('tests.mem_c')::uuid, 'admin')), 'FORBIDDEN', 'CA-E9-12: member alterando papel → devolve FORBIDDEN (não lança)');
select tests.login_as('a');
select is((select public.change_member_role(current_setting('tests.mem_a')::uuid, 'admin')), 'CANNOT_TARGET_SELF', 'CA-E9-12: owner em si mesmo → CANNOT_TARGET_SELF');
select is((select public.change_member_role(current_setting('tests.mem_b')::uuid, 'admin')), 'NOT_FOUND', 'CA-E9-12: alvo de outra família → NOT_FOUND');
select is((select public.change_member_role(gen_random_uuid(), 'admin')), 'NOT_FOUND', 'CA-E9-12: alvo inexistente → NOT_FOUND');
select tests.login_as('ad');
select is((select public.transfer_ownership(current_setting('tests.mem_a')::uuid)), 'FORBIDDEN', 'CA-E9-12: admin transferindo → FORBIDDEN');
select tests.login_as('a');
select is((select public.transfer_ownership(current_setting('tests.mem_a')::uuid)), 'CANNOT_TARGET_SELF', 'CA-E9-12: transferir para si → CANNOT_TARGET_SELF');
select is((select public.transfer_ownership(current_setting('tests.mem_b')::uuid)), 'NOT_FOUND', 'CA-E9-12: transferir a alvo de outra família → NOT_FOUND');
select tests.login_as('m');
select is((select public.remove_family_member(current_setting('tests.mem_c')::uuid)), 'FORBIDDEN', 'CA-E9-12: member removendo → FORBIDDEN');
select tests.login_as('ad');
select is((select public.remove_family_member(current_setting('tests.mem_a')::uuid)), 'FORBIDDEN', 'CA-E9-12: admin removendo o owner → FORBIDDEN');
select is((select public.remove_family_member(current_setting('tests.mem_ad')::uuid)), 'CANNOT_TARGET_SELF', 'CA-E9-12: admin removendo a si → CANNOT_TARGET_SELF');
select tests.login_as('a');
select is((select public.remove_family_member(current_setting('tests.mem_b')::uuid)), 'NOT_FOUND', 'CA-E9-12: remover alvo de outra família → NOT_FOUND');
select tests.logout();

select is((select count(*)::int from public.audit_events where action = 'member.action_denied'), 11, 'CA-E9-12: 11 negações, 11 eventos member.action_denied');
select is((select count(*)::int from public.audit_events where action <> 'member.action_denied'), 0, 'CA-E9-12: nenhuma outra ação gravada pelas negações');
select is((select string_agg(distinct entity_type, ',') from public.audit_events), 'family_member', 'CA-E9-12: entity_type family_member');
select is((select count(*)::int from public.audit_events where metadata ->> 'operation' = 'change_role'), 4, 'CA-E9-12: 4 de change_role');
select is((select count(*)::int from public.audit_events where metadata ->> 'operation' = 'transfer_ownership'), 3, 'CA-E9-12: 3 de transfer_ownership');
select is((select count(*)::int from public.audit_events where metadata ->> 'operation' = 'remove'), 4, 'CA-E9-12: 4 de remove');
select is((select count(*)::int from public.audit_events where metadata ->> 'reason' = 'FORBIDDEN'), 4, 'CA-E9-12: 4 FORBIDDEN');
select is((select count(*)::int from public.audit_events where metadata ->> 'reason' = 'CANNOT_TARGET_SELF'), 3, 'CA-E9-12: 3 CANNOT_TARGET_SELF');
select is((select count(*)::int from public.audit_events where metadata ->> 'reason' = 'NOT_FOUND'), 4, 'CA-E9-12: 4 NOT_FOUND');
select is((select count(*)::int from public.audit_events
    where (select array_agg(k order by k) from jsonb_object_keys(metadata) k) = array['operation', 'reason']), 11,
  'CA-E9-12: metadata só tem operation e reason');
select is((select count(*)::int from public.audit_events where entity_id is null), 4,
  'CA-E9-12: entity_id nulo quando o alvo não é da família do chamador (alvo de B ou inexistente)');
select is((select entity_id from public.audit_events where metadata ->> 'operation' = 'change_role' and metadata ->> 'reason' = 'FORBIDDEN'),
  current_setting('tests.mem_c')::uuid, 'CA-E9-12: entity_id = o alvo quando ele é da família do chamador');
select is((select string_agg(actor_user_id::text, ',' order by actor_user_id::text) from public.audit_events where actor_user_id = tests.uid('m')),
  tests.uid('m')::text || ',' || tests.uid('m')::text, 'CA-E9-12: o ator é quem tentou (m: 2 tentativas)');
select is((select count(*)::int from public.audit_events where actor_user_id is null), 0, 'CA-E9-12: todo evento tem ator');
select is((select count(*)::int from public.audit_events
    where metadata ?| array['email', 'name', 'display_name', 'description', 'notes', 'invited_email', 'role', 'from_role', 'to_role', 'member_id']), 0,
  'CA-E9-15: metadata sem e-mail, nome, papel de terceiro ou id de integrante');
select is((select count(*)::int from public.audit_events where metadata::text ~* '(@test\.local|Ana|Beto|Carla|Fam[ií]lia)'), 0,
  'CA-E9-15: metadata sem nome nem e-mail');
select is((select string_agg(role, ',' order by role) from public.family_members where family_id = tests.fid('A') and status = 'active'),
  'admin,admin,member,member,owner', 'CA-E9-12: nenhuma negação alterou papéis nem vínculos');

-- CA-E9-13 · sem família, teto, exceções que continuam ---------------------------------------------------------------------------------------
select tests.login_as('x');
select is((select public.change_member_role(current_setting('tests.mem_m')::uuid, 'admin')), 'FORBIDDEN', 'CA-E9-13: sem família (change_member_role) → FORBIDDEN');
select is((select public.transfer_ownership(current_setting('tests.mem_m')::uuid)), 'FORBIDDEN', 'CA-E9-13: sem família (transfer_ownership) → FORBIDDEN');
select is((select public.remove_family_member(current_setting('tests.mem_m')::uuid)), 'FORBIDDEN', 'CA-E9-13: sem família (remove_family_member) → FORBIDDEN');
select tests.logout();
select is((select count(*)::int from public.audit_events), 11, 'CA-E9-13: chamador sem família não grava evento');

-- teto: 22 negações do mesmo ator na hora → todas negam, só 20 gravam
select tests.login_as('c');
select is((select count(*)::int from generate_series(1, 22) g where public.remove_family_member(gen_random_uuid()) = 'FORBIDDEN'), 22,
  'CA-E9-13: as 22 tentativas de c são negadas');
select tests.logout();
select is((select count(*)::int from public.audit_events where actor_user_id = tests.uid('c')), 20,
  'CA-E9-13: acima de 20 negações por ator na hora a RPC ainda nega, mas não grava o 21º nem o 22º');
select is((select count(*)::int from public.audit_events), 31, 'CA-E9-13: o teto é por ator (os 11 eventos dos outros seguem lá)');

select tests.login_as('a');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, 'owner')$$, 'P0001', 'INVALID_INPUT',
  'CA-E9-13: INVALID_INPUT continua exceção');
select throws_ok($$select public.change_member_role(current_setting('tests.mem_m')::uuid, null)$$, 'P0001', 'INVALID_INPUT',
  'CA-E9-13: INVALID_INPUT (papel nulo) continua exceção');
select tests.logout();
select is((select count(*)::int from public.audit_events), 31, 'CA-E9-13: INVALID_INPUT não grava evento de negação');

-- CA-E9-15 · quem lê ------------------------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select is((select count(*)::int from public.audit_events where action = 'member.action_denied'), 31, 'CA-E9-15: owner lê os eventos de negação');
select tests.login_as('ad');
select is((select count(*)::int from public.audit_events where action = 'member.action_denied'), 31, 'CA-E9-15: admin lê os eventos de negação');
select tests.login_as('m');
select is((select count(*)::int from public.audit_events), 0, 'CA-E9-15: member lê 0');
select tests.login_as('b');
select is((select count(*)::int from public.audit_events), 0, 'CA-E9-15: outra família lê 0');
select tests.login_anon();
select throws_ok($$select * from public.audit_events$$, '42501', null, 'CA-E9-15: anon sem acesso');
select tests.logout();

-- CA-E9-14 · caminho de sucesso inalterado (agora null) ------------------------------------------------------------------------------------
select tests.login_as('a');
select is((select public.change_member_role(current_setting('tests.mem_m')::uuid, 'admin')), null::text, 'CA-E9-14: promover devolve null');
select is((select role from public.family_members where id = current_setting('tests.mem_m')::uuid), 'admin', 'CA-E9-14: papel gravado');
select is((select public.change_member_role(current_setting('tests.mem_m')::uuid, 'admin')), null::text, 'CA-E9-14: papel igual devolve null, sem evento');
select is((select public.remove_family_member(current_setting('tests.mem_c')::uuid)), null::text, 'CA-E9-14: remover devolve null');
select is((select public.transfer_ownership(current_setting('tests.mem_ad')::uuid)), null::text, 'CA-E9-14: transferir devolve null');
select is((select public.transfer_ownership(current_setting('tests.mem_ad')::uuid)), 'FORBIDDEN',
  'CA-E9-14: o antigo owner, agora admin, é negado na segunda transferência (sem 0 nem 2 owners)');
select tests.logout();
select is((select count(*)::int from public.family_members where family_id = tests.fid('A') and role = 'owner' and status = 'active'), 1,
  'CA-E9-14: exatamente um owner ativo');
select is((select count(*)::int from public.audit_events where action in ('member.role_changed', 'member.removed', 'family.ownership_transferred')), 3,
  'CA-E9-14: sucessos geram os mesmos 3 eventos de antes (papel igual não gera)');
select is((select count(*)::int from public.audit_events where action = 'member.action_denied'), 32,
  'CA-E9-14: só a negação da segunda transferência acrescentou evento (32)');

select * from finish();
rollback;
