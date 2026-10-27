-- Núcleo · Etapa 2 · RPCs públicas de família e convite. Spec: docs/data-model.md §4.8; docs/permissions.md §5.
-- Erros: P0001 com mensagem = código; 42501 = FORBIDDEN. Mensagens sem dados.
-- Nas funções com `returns table`, os nomes das colunas de saída coincidem com colunas das tabelas:
-- `#variable_conflict use_column` resolve a ambiguidade a favor das colunas.

-- create_family -------------------------------------------------------------------------------
create function public.create_family(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_family_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) not between 1 and 80 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.family_members m where m.user_id = v_uid and m.status = 'active') then
    raise exception 'ALREADY_IN_FAMILY' using errcode = 'P0001';
  end if;

  insert into public.families (name, created_by) values (v_name, v_uid) returning id into v_family_id;
  insert into public.family_members (family_id, user_id, role) values (v_family_id, v_uid, 'owner');

  perform private.log_audit(v_family_id, 'family', v_family_id, 'family.created', '{}'::jsonb);
  return v_family_id;
exception
  when unique_violation then  -- corrida de duplo clique no índice de família ativa
    raise exception 'ALREADY_IN_FAMILY' using errcode = 'P0001';
end;
$$;

-- create_family_invite ------------------------------------------------------------------------
create function public.create_family_invite(p_role text default 'member', p_email text default null)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_family_id uuid;
  v_caller_role text;
  v_email text;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
  v_pending integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  v_family_id := private.current_family_id();
  if v_family_id is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select m.role into v_caller_role
  from public.family_members m
  where m.family_id = v_family_id and m.user_id = v_uid and m.status = 'active';

  if p_role = 'member' and v_caller_role not in ('owner', 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_role = 'admin' and v_caller_role <> 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  if v_email is not null and (char_length(v_email) not between 3 and 254 or position('@' in v_email) = 0) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- serializa a contagem de pendentes por família (evita estourar o limite em corrida)
  perform 1 from public.families f where f.id = v_family_id for update;

  select count(*) into v_pending
  from public.family_invites i
  where i.family_id = v_family_id
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now();
  if v_pending >= 20 then
    raise exception 'INVITE_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + interval '7 days';

  insert into public.family_invites (family_id, role, token_hash, invited_email, created_by, expires_at)
  values (v_family_id, p_role, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_email, v_uid, v_expires)
  returning id into v_id;

  perform private.log_audit(
    v_family_id, 'family_invite', v_id, 'invite.created',
    jsonb_build_object('role', p_role, 'has_email_binding', v_email is not null, 'expires_at', v_expires)
  );

  return query select v_id, v_token, v_expires;  -- token em claro: devolvido uma única vez
end;
$$;

-- get_invite_preview --------------------------------------------------------------------------
create function public.get_invite_preview(p_token text)
returns table (family_name text, role text, expires_at timestamptz, status text, email_bound boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
  end if;

  return query
    select f.name,
           i.role,
           i.expires_at,
           case
             when i.revoked_at is not null then 'revoked'
             when i.accepted_at is not null then 'accepted'
             when i.expires_at <= now() then 'expired'
             else 'pending'
           end,
           i.invited_email is not null
    from public.family_invites i
    join public.families f on f.id = i.family_id
    where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');

  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

-- accept_family_invite ------------------------------------------------------------------------
create function public.accept_family_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_invite public.family_invites%rowtype;
  v_member_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.family_invites i
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  for update;

  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'INVITE_REVOKED' using errcode = 'P0001';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'INVITE_ALREADY_USED' using errcode = 'P0001';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'INVITE_EXPIRED' using errcode = 'P0001';
  end if;
  if v_invite.invited_email is not null
     and v_invite.invited_email is distinct from lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) then
    raise exception 'INVITE_EMAIL_MISMATCH' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.family_members m where m.user_id = v_uid and m.status = 'active') then
    raise exception 'ALREADY_IN_FAMILY' using errcode = 'P0001';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (v_invite.family_id, v_uid, v_invite.role)
  returning id into v_member_id;

  update public.family_invites
  set accepted_at = now(), accepted_by = v_uid
  where id = v_invite.id;

  perform private.log_audit(
    v_invite.family_id, 'family_member', v_member_id, 'member.joined',
    jsonb_build_object('member_id', v_member_id, 'role', v_invite.role, 'invite_id', v_invite.id)
  );

  return v_invite.family_id;
exception
  when unique_violation then  -- corrida em duas abas: índice de família ativa
    raise exception 'ALREADY_IN_FAMILY' using errcode = 'P0001';
end;
$$;

-- revoke_family_invite ------------------------------------------------------------------------
create function public.revoke_family_invite(p_invite_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_family_id uuid;
  v_caller_role text;
  v_invite public.family_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  v_family_id := private.current_family_id();
  if v_family_id is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select m.role into v_caller_role
  from public.family_members m
  where m.family_id = v_family_id and m.user_id = v_uid and m.status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner', 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- convite inexistente ou de outra família: mesma resposta (não revela existência)
  select * into v_invite
  from public.family_invites i
  where i.id = p_invite_id and i.family_id = v_family_id
  for update;

  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_caller_role = 'admin' and v_invite.role <> 'member' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'INVITE_ALREADY_USED' using errcode = 'P0001';
  end if;
  if v_invite.revoked_at is not null then
    return;  -- idempotente: sem erro e sem novo evento
  end if;

  update public.family_invites
  set revoked_at = now(), revoked_by = v_uid
  where id = v_invite.id;

  perform private.log_audit(
    v_family_id, 'family_invite', v_invite.id, 'invite.revoked',
    jsonb_build_object('invite_id', v_invite.id)
  );
end;
$$;

-- Grants: Postgres concede EXECUTE a PUBLIC por padrão; só authenticated chama as RPCs.
revoke execute on function public.create_family(text) from public, anon;
revoke execute on function public.create_family_invite(text, text) from public, anon;
revoke execute on function public.get_invite_preview(text) from public, anon;
revoke execute on function public.accept_family_invite(text) from public, anon;
revoke execute on function public.revoke_family_invite(uuid) from public, anon;
grant execute on function public.create_family(text) to authenticated;
grant execute on function public.create_family_invite(text, text) to authenticated;
grant execute on function public.get_invite_preview(text) to authenticated;
grant execute on function public.accept_family_invite(text) to authenticated;
grant execute on function public.revoke_family_invite(uuid) to authenticated;

-- DOWN (manual): drop das 5 funções public.* acima.
