-- Núcleo · Etapa 9 · M3 · trilha de tentativas NEGADAS nas RPCs de integrantes: change_member_role, transfer_ownership,
-- remove_family_member passam a DEVOLVER text em vez de lançar nas três negações.
-- Contrato: docs/contracts/etapa-9.md §3.1 (M3); ADR-0036; fecha SEC-26; AB-124. Origem do corpo: 20261024101800_etapa7_member_management.sql.
--
-- Retorno: null = a operação aconteceu (ou era um no-op legítimo, como papel igual); 'FORBIDDEN' | 'CANNOT_TARGET_SELF' | 'NOT_FOUND'
-- = negada, e a tentativa fica em audit_events como member.action_denied. Continuam EXCEÇÃO: NOT_AUTHENTICATED, INVALID_INPUT e
-- qualquer erro inesperado (ADR-0036 §1). leave_family() e refresh_notifications() NÃO mudam aqui.
--
-- Como a negação é gravada sem desfazer a transação: o corpo original (idêntico ao da Etapa 7, com os mesmos raise) vira um bloco
-- interno `begin ... exception`. O tratador reconhece APENAS os três códigos (pelo texto da exceção, sqlstate 42501 ou P0001);
-- qualquer outra exceção é relançada com `raise`. Ao capturar, a subtransação do bloco já foi desfeita, então os FOR UPDATE de
-- chamador/alvo são liberados (uma segunda sessão não fica bloqueada atrás de uma negação). O evento é gravado FORA da
-- subtransação desfeita, no tratador, e a função retorna o código.
--
-- Garantias do evento (private.log_member_denial):
--   * entity_type 'family_member'; entity_id = o uuid do alvo SÓ se ele pertence à família do chamador (qualquer status), senão
--     nulo — não confirma a existência de integrante de outra família;
--   * metadata {"operation": "change_role"|"transfer_ownership"|"remove", "reason": "<código>"}: sem nome, e-mail, papel de
--     terceiro ou texto livre;
--   * chamador sem família ativa: retorna 'FORBIDDEN' SEM gravar (audit_events.family_id é obrigatório);
--   * teto de 20 eventos de negação por ator por hora (família do chamador); acima disso a RPC ainda nega, mas não grava.
-- Concorrência (AB-119): ordem de lock, releitura depois do lock e demais invariantes são os da Etapa 7, intocados.

-- Trilha ----------------------------------------------------------------------------------------------------------------------
create function private.log_member_denial(
  p_family_id uuid, p_operation text, p_member_id uuid, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_recent integer;
  v_entity uuid;
begin
  if v_uid is null or p_family_id is null then
    return;
  end if;

  -- anti-poluição: contagem limitada a 20 (índice audit_events_family_created_at)
  select count(*)::integer into v_recent from (
    select 1 from public.audit_events e
    where e.family_id = p_family_id and e.actor_user_id = v_uid
      and e.action = 'member.action_denied' and e.created_at > now() - interval '1 hour'
    limit 20) s;
  if v_recent >= 20 then
    return;
  end if;

  select m.id into v_entity
  from public.family_members m
  where m.id = p_member_id and m.family_id = p_family_id;

  perform private.log_audit(
    p_family_id, 'family_member', v_entity, 'member.action_denied',
    jsonb_build_object('operation', p_operation, 'reason', p_reason)
  );
end;
$$;
revoke execute on function private.log_member_denial(uuid, text, uuid, text) from public, anon, authenticated;

-- Mudança de tipo de retorno exige DROP + CREATE (create or replace não permite). Mesma transação: não existe instante sem a função.
drop function public.change_member_role(uuid, text);
drop function public.transfer_ownership(uuid);
drop function public.remove_family_member(uuid);

-- change_member_role ----------------------------------------------------------------------------------------------------
create function public.change_member_role(p_member_id uuid, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_role text;
  v_caller public.family_members;
  v_target public.family_members;
  v_code text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    return 'FORBIDDEN';  -- sem família ativa: nega sem gravar
  end if;

  begin
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
      return null;  -- sem efeito: nenhum update, nenhum evento
    end if;

    update public.family_members set role = p_role where id = v_target.id;

    perform private.log_audit(
      v_family, 'family_member', v_target.id, 'member.role_changed',
      jsonb_build_object('member_id', v_target.id, 'from_role', v_target.role, 'to_role', p_role)
    );
    return null;
  exception when sqlstate '42501' or sqlstate 'P0001' then
    get stacked diagnostics v_code = message_text;
    if v_code is null or v_code not in ('FORBIDDEN', 'CANNOT_TARGET_SELF', 'NOT_FOUND') then
      raise;  -- INVALID_INPUT e qualquer outro erro continuam exceção
    end if;
    perform private.log_member_denial(v_family, 'change_role', p_member_id, v_code);
    return v_code;
  end;
end;
$$;

-- transfer_ownership ----------------------------------------------------------------------------------------------------
create function public.transfer_ownership(p_member_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_role text;
  v_caller public.family_members;
  v_target public.family_members;
  v_code text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    return 'FORBIDDEN';
  end if;

  begin
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

    -- troca atômica: o chamador vira admin ANTES de o alvo virar owner (family_members_one_owner nunca vê dois owners)
    update public.family_members set role = 'admin' where id = v_caller.id;
    update public.family_members set role = 'owner' where id = v_target.id;

    perform private.log_audit(
      v_family, 'family', v_family, 'family.ownership_transferred',
      jsonb_build_object(
        'member_id', v_target.id, 'previous_owner_member_id', v_caller.id, 'from_role', v_target.role
      )
    );
    return null;
  exception when sqlstate '42501' or sqlstate 'P0001' then
    get stacked diagnostics v_code = message_text;
    if v_code is null or v_code not in ('FORBIDDEN', 'CANNOT_TARGET_SELF', 'NOT_FOUND') then
      raise;
    end if;
    perform private.log_member_denial(v_family, 'transfer_ownership', p_member_id, v_code);
    return v_code;
  end;
end;
$$;

-- remove_family_member --------------------------------------------------------------------------------------------------
create function public.remove_family_member(p_member_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_role text;
  v_caller public.family_members;
  v_target public.family_members;
  v_revoked integer;
  v_code text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    return 'FORBIDDEN';
  end if;

  begin
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
    return null;
  exception when sqlstate '42501' or sqlstate 'P0001' then
    get stacked diagnostics v_code = message_text;
    if v_code is null or v_code not in ('FORBIDDEN', 'CANNOT_TARGET_SELF', 'NOT_FOUND') then
      raise;
    end if;
    perform private.log_member_denial(v_family, 'remove', p_member_id, v_code);
    return v_code;
  end;
end;
$$;

revoke execute on function public.change_member_role(uuid, text) from public, anon;
revoke execute on function public.transfer_ownership(uuid) from public, anon;
revoke execute on function public.remove_family_member(uuid) from public, anon;
grant execute on function public.change_member_role(uuid, text) to authenticated;
grant execute on function public.transfer_ownership(uuid) to authenticated;
grant execute on function public.remove_family_member(uuid) to authenticated;

-- DOWN (manual): drop function public.remove_family_member(uuid); drop function public.transfer_ownership(uuid);
--   drop function public.change_member_role(uuid, text); depois recriar as três com o corpo de 20261024101800_etapa7_member_management.sql
--   (retorno void) e repetir revoke/grant; drop function private.log_member_denial(uuid, text, uuid, text).
--   Os eventos member.action_denied já gravados em audit_events permanecem (tabela append-only). Fazer o DOWN exige o app anterior
--   (o repositório atual tolera os dois retornos, mas o antigo ignora o texto devolvido).
-- Efeito em dados existentes: nenhum (nenhuma linha lida ou escrita pela migration). O contrato com o cliente da API muda de
--   "exceção" para "texto" nas três negações.
-- ORDEM DE DEPLOY (corrige o contrato §6): o app NOVO (family/repository.ts que converte o texto em AppError) deve subir ANTES
--   ou JUNTO desta migration. O app ANTIGO ignora o `data` devolvido: com M3 aplicada, uma negação seria tratada como SUCESSO na
--   interface (nada é alterado no banco, mas o usuário vê "feito"). O app novo com a RPC antiga é seguro (null/undefined = ok).
-- Lock: DROP/CREATE FUNCTION são DDL breves. Sem lock em linhas de dados na migration.
