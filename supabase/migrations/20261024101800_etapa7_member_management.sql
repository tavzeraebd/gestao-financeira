-- Núcleo · Etapa 7 · gestão de integrantes por RPC: change_member_role, transfer_ownership, remove_family_member, leave_family.
-- Contrato: docs/contracts/etapa-7.md §3.1; ADR-0030; AB-110..113 e AB-119. Erros: P0001 com mensagem = código; 42501 = FORBIDDEN.
-- family_members continua SEM grant de escrita: papel e vínculo só mudam por estas quatro RPCs (security definer).
--
-- Padrão comum (as três RPCs que miram um alvo):
--   1. NOT_AUTHENTICATED; família = private.current_family_id() (nula → FORBIDDEN);
--   2. o papel do chamador é lido do banco ANTES de buscar o alvo (decide FORBIDDEN sem revelar nada sobre o alvo);
--   3. os dois vínculos (chamador e alvo, só da família do chamador e ativos) são travados com FOR UPDATE em ordem de id
--      (contra deadlock); depois do lock o chamador e o alvo são LIDOS DE NOVO (o READ COMMITTED enxerga o que a transação
--      concorrente confirmou), então transferência e remoção concorrentes do mesmo alvo nunca deixam 0 ou 2 owners;
--   4. o alvo é buscado por id E família E status = 'active': inexistente, de outra família ou encerrado dão o mesmo NOT_FOUND.
-- Nenhuma RPC apaga ou altera lançamento, compromisso, série, meta, aporte, parcela, liquidação, orçamento ou notificação.

-- Revoga os convites pendentes (não aceitos, não revogados, não expirados) criados por um usuário numa família e audita cada um
-- (invite.revoked com reason = member_ended). Devolve quantos revogou. Só as RPCs desta migration a chamam.
create function private.revoke_member_invites(p_family_id uuid, p_user_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_id uuid;
begin
  with revoked as (
    update public.family_invites i
    set revoked_at = now(), revoked_by = auth.uid()
    where i.family_id = p_family_id
      and i.created_by = p_user_id
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > now()
    returning i.id
  )
  select array_agg(r.id order by r.id) into v_ids from revoked r;

  if v_ids is null then
    return 0;
  end if;
  foreach v_id in array v_ids loop
    perform private.log_audit(
      p_family_id, 'family_invite', v_id, 'invite.revoked',
      jsonb_build_object('invite_id', v_id, 'reason', 'member_ended')
    );
  end loop;
  return cardinality(v_ids);
end;
$$;
revoke execute on function private.revoke_member_invites(uuid, uuid) from public, anon, authenticated;

-- change_member_role ----------------------------------------------------------------------------------------------------
-- Só owner. Alvo ativo da família, diferente do chamador (o único owner é o próprio chamador, então "mudar o owner" cai em
-- CANNOT_TARGET_SELF). Papel igual: retorna sem escrever e sem evento. Owner só nasce por transfer_ownership.
create function public.change_member_role(p_member_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_role text;
  v_caller public.family_members;
  v_target public.family_members;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select m.role into v_role
  from public.family_members m
  where m.family_id = v_family and m.user_id = v_uid and m.status = 'active';
  if v_role is distinct from 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- trava chamador e alvo (só desta família, só ativos) em ordem de id
  perform 1
  from public.family_members m
  where m.family_id = v_family and m.status = 'active' and (m.user_id = v_uid or m.id = p_member_id)
  order by m.id
  for update;

  select * into v_caller from public.family_members m
  where m.family_id = v_family and m.user_id = v_uid and m.status = 'active';
  if v_caller.id is null or v_caller.role <> 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_target from public.family_members m
  where m.id = p_member_id and m.family_id = v_family and m.status = 'active';
  if v_target.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_target.id = v_caller.id then
    raise exception 'CANNOT_TARGET_SELF' using errcode = 'P0001';
  end if;

  if v_target.role = p_role then
    return;  -- sem efeito: nenhum update, nenhum evento
  end if;

  update public.family_members set role = p_role where id = v_target.id;

  perform private.log_audit(
    v_family, 'family_member', v_target.id, 'member.role_changed',
    jsonb_build_object('member_id', v_target.id, 'from_role', v_target.role, 'to_role', p_role)
  );
end;
$$;

-- transfer_ownership ----------------------------------------------------------------------------------------------------
-- Só owner. Troca atômica: o chamador vira admin ANTES de o alvo virar owner, para o índice family_members_one_owner nunca
-- ver dois owners ativos. Depois: exatamente um owner ativo (o alvo) e o anterior é admin.
create function public.transfer_ownership(p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_role text;
  v_caller public.family_members;
  v_target public.family_members;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select m.role into v_role
  from public.family_members m
  where m.family_id = v_family and m.user_id = v_uid and m.status = 'active';
  if v_role is distinct from 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform 1
  from public.family_members m
  where m.family_id = v_family and m.status = 'active' and (m.user_id = v_uid or m.id = p_member_id)
  order by m.id
  for update;

  select * into v_caller from public.family_members m
  where m.family_id = v_family and m.user_id = v_uid and m.status = 'active';
  if v_caller.id is null or v_caller.role <> 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_target from public.family_members m
  where m.id = p_member_id and m.family_id = v_family and m.status = 'active';
  if v_target.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_target.id = v_caller.id then
    raise exception 'CANNOT_TARGET_SELF' using errcode = 'P0001';
  end if;

  update public.family_members set role = 'admin' where id = v_caller.id;
  update public.family_members set role = 'owner' where id = v_target.id;

  perform private.log_audit(
    v_family, 'family', v_family, 'family.ownership_transferred',
    jsonb_build_object(
      'member_id', v_target.id, 'previous_owner_member_id', v_caller.id, 'from_role', v_target.role
    )
  );
end;
$$;

-- remove_family_member --------------------------------------------------------------------------------------------------
-- Owner remove admin e member; admin remove member; member não remove; ninguém remove o owner nem a si mesmo.
-- Encerra o vínculo (status = 'removed', ended_at = now()) e revoga os convites pendentes que o alvo criou nesta família.
-- Nada é apagado nem reatribuído (ADR-0030 §2).
create function public.remove_family_member(p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_role text;
  v_caller public.family_members;
  v_target public.family_members;
  v_revoked integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select m.role into v_role
  from public.family_members m
  where m.family_id = v_family and m.user_id = v_uid and m.status = 'active';
  if v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  perform 1
  from public.family_members m
  where m.family_id = v_family and m.status = 'active' and (m.user_id = v_uid or m.id = p_member_id)
  order by m.id
  for update;

  select * into v_caller from public.family_members m
  where m.family_id = v_family and m.user_id = v_uid and m.status = 'active';
  if v_caller.id is null or v_caller.role not in ('owner', 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_target from public.family_members m
  where m.id = p_member_id and m.family_id = v_family and m.status = 'active';
  if v_target.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_target.id = v_caller.id then
    raise exception 'CANNOT_TARGET_SELF' using errcode = 'P0001';
  end if;
  if v_target.role = 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_caller.role = 'admin' and v_target.role = 'admin' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.family_members set status = 'removed', ended_at = now() where id = v_target.id;
  v_revoked := private.revoke_member_invites(v_family, v_target.user_id);

  perform private.log_audit(
    v_family, 'family_member', v_target.id, 'member.removed',
    jsonb_build_object('member_id', v_target.id, 'from_role', v_target.role, 'revoked_invites', v_revoked)
  );
end;
$$;

-- leave_family ----------------------------------------------------------------------------------------------------------
-- Admin e member saem; o owner precisa transferir a propriedade antes (OWNER_MUST_TRANSFER). Sem parâmetros: só o próprio
-- vínculo. Depois de sair o usuário não lê mais nada da família e pode criar outra (a linha encerrada sai do índice
-- family_members_one_active_family_per_user).
create function public.leave_family() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_caller public.family_members;
  v_revoked integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- o FOR UPDATE espera uma transferência concorrente: o papel lido abaixo já é o confirmado por ela
  select * into v_caller from public.family_members m
  where m.family_id = v_family and m.user_id = v_uid and m.status = 'active'
  for update;
  if v_caller.id is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_caller.role = 'owner' then
    raise exception 'OWNER_MUST_TRANSFER' using errcode = 'P0001';
  end if;

  update public.family_members set status = 'left', ended_at = now() where id = v_caller.id;
  v_revoked := private.revoke_member_invites(v_family, v_uid);

  perform private.log_audit(
    v_family, 'family_member', v_caller.id, 'member.left',
    jsonb_build_object('member_id', v_caller.id, 'from_role', v_caller.role, 'revoked_invites', v_revoked)
  );
end;
$$;

revoke execute on function public.change_member_role(uuid, text) from public, anon;
revoke execute on function public.transfer_ownership(uuid) from public, anon;
revoke execute on function public.remove_family_member(uuid) from public, anon;
revoke execute on function public.leave_family() from public, anon;
grant execute on function public.change_member_role(uuid, text) to authenticated;
grant execute on function public.transfer_ownership(uuid) to authenticated;
grant execute on function public.remove_family_member(uuid) to authenticated;
grant execute on function public.leave_family() to authenticated;

-- DOWN (manual): drop function public.leave_family(); drop function public.remove_family_member(uuid);
--   drop function public.transfer_ownership(uuid); drop function public.change_member_role(uuid, text);
--   drop function private.revoke_member_invites(uuid, uuid).
--   Os papéis, vínculos e revogações já feitos por elas NÃO são desfeitos pelo DOWN (dados de negócio).
-- Efeito em dados existentes: nenhum (funções novas; nenhuma linha é lida ou escrita pela migration). Lock: DDL de função, breve.
