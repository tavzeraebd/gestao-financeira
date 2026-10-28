-- CA-E7-15, CA-E7-09: auditoria da Etapa 7 (family.updated, member.role_changed, member.removed, member.left,
-- family.ownership_transferred, invite.revoked com reason). Metadata sem nome, e-mail ou descrição; owner/admin leem, member lê 0.
begin;

select no_plan();

select tests.setup_world();
create function tests.mem(p_key text) returns uuid language sql stable as $$
  select id from public.family_members where user_id = tests.uid(p_key)
  order by (status = 'active') desc, joined_at desc limit 1 $$;
grant execute on function tests.mem(text) to authenticated;
insert into public.family_members (family_id, user_id, role) values (tests.fid('A'), tests.uid('c'), 'member');
insert into public.family_members (family_id, user_id, role) values (tests.fid('A'), tests.uid('d'), 'admin');
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_ad', tests.mem('ad')::text, true);
select set_config('tests.mem_m', tests.mem('m')::text, true);
select set_config('tests.mem_c', tests.mem('c')::text, true);
select set_config('tests.mem_d', tests.mem('d')::text, true);
select tests.stash_invite('dinv', 'd', 'member', 'segredo@test.local');
delete from public.audit_events;

-- CA-E7-09 · renomear a família ---------------------------------------------------------------------------------------------------------
select tests.login_as('a');
select is(tests.affected($$update public.families set name = 'SEGREDO-NOME' where id = tests.fid('A')$$), 1, 'CA-E7-09: owner renomeia');
select is((select metadata from public.audit_events where action = 'family.updated'), '{"fields": ["name"]}'::jsonb,
  'CA-E7-09: family.updated { "fields": ["name"] } sem o nome');
select is(tests.affected($$update public.families set name = 'SEGREDO-NOME' where id = tests.fid('A')$$), 1, 'CA-E7-09: mesmo nome atualiza a linha...');
select is((select count(*)::int from public.audit_events where action = 'family.updated'), 1, 'CA-E7-09: ...mas não grava novo evento');
select tests.login_as('ad');
select is(tests.affected($$update public.families set name = 'Hack' where id = tests.fid('A')$$), 0, 'CA-E7-09: admin → 0 linhas');
select tests.login_as('a');
select is((select count(*)::int from public.audit_events where action = 'family.updated'), 1, 'CA-E7-09: admin não gerou evento');

-- gestão de integrantes -------------------------------------------------------------------------------------------------------------------
select public.change_member_role(current_setting('tests.mem_m')::uuid, 'admin');
select public.remove_family_member(current_setting('tests.mem_d')::uuid);  -- d tinha um convite pendente
select public.transfer_ownership(current_setting('tests.mem_ad')::uuid);
select tests.login_as('c');
select public.leave_family();
select tests.login_as('ad');

select is((select metadata from public.audit_events where action = 'member.role_changed'),
  jsonb_build_object('member_id', current_setting('tests.mem_m'), 'from_role', 'member', 'to_role', 'admin'), 'CA-E7-15: member.role_changed');
select is((select entity_type || '/' || entity_id::text from public.audit_events where action = 'member.role_changed'),
  'family_member/' || current_setting('tests.mem_m'), 'CA-E7-15: entidade do evento = o vínculo');
select is((select metadata from public.audit_events where action = 'member.removed'),
  jsonb_build_object('member_id', current_setting('tests.mem_d'), 'from_role', 'admin', 'revoked_invites', 1), 'CA-E7-15: member.removed');
select is((select metadata from public.audit_events where action = 'member.left'),
  jsonb_build_object('member_id', current_setting('tests.mem_c'), 'from_role', 'member', 'revoked_invites', 0), 'CA-E7-15: member.left');
select is((select metadata from public.audit_events where action = 'family.ownership_transferred'),
  jsonb_build_object('member_id', current_setting('tests.mem_ad'), 'previous_owner_member_id', current_setting('tests.mem_a'), 'from_role', 'admin'),
  'CA-E7-15: family.ownership_transferred');
select is((select metadata from public.audit_events where action = 'invite.revoked'),
  jsonb_build_object('invite_id', tests.inv('dinv'), 'reason', 'member_ended'), 'CA-E7-15: invite.revoked com reason');
select is((select string_agg(distinct action, ',' order by action) from public.audit_events),
  'family.ownership_transferred,family.updated,invite.revoked,member.left,member.removed,member.role_changed',
  'catálogo de ações novas da Etapa 7');
select is((select count(*)::int from public.audit_events where metadata::text ~* '(SEGREDO|@test\.local|Ana|Beto|Carla|Fam[ií]lia)'), 0,
  'CA-E7-15: metadata sem nome, e-mail ou descrição');
select is((select count(*)::int from public.audit_events where metadata ?| array['name', 'email', 'display_name', 'description', 'notes', 'invited_email']), 0,
  'CA-E7-15: sem chaves de pessoa ou texto livre');
select is((select count(*)::int from public.audit_events where actor_user_id is null), 0, 'CA-E7-15: todo evento tem ator');
select is((select actor_user_id from public.audit_events where action = 'member.left'), tests.uid('c'), 'CA-E7-15: o ator de member.left é quem saiu');
select is((select actor_user_id from public.audit_events where action = 'family.ownership_transferred'), tests.uid('a'),
  'CA-E7-15: o ator da transferência é o owner anterior');
select is((select count(*)::int from public.audit_events), 6, 'CA-E7-15: o novo owner (ad) lê os 6 eventos');
select tests.login_as('m');
select is((select count(*)::int from public.audit_events), 6, 'CA-E7-15: m (agora admin) também lê');
select tests.logout();

-- member comum lê 0
update public.family_members set role = 'member' where id = current_setting('tests.mem_m')::uuid;
select tests.login_as('m');
select is((select count(*)::int from public.audit_events), 0, 'CA-E7-15: member lê 0 eventos');
select tests.login_as('b');
select is((select count(*)::int from public.audit_events), 0, 'CA-E7-15: outra família lê 0 eventos');
select tests.logout();

select * from finish();
rollback;
