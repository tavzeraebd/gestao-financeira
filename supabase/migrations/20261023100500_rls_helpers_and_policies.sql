-- Núcleo · Etapa 2 · helpers de autorização (private) e policies.
-- Spec: docs/data-model.md §4.7; docs/permissions.md §3.
-- Helpers rodam como dono (bypass de RLS), o que evita recursão de policy em family_members.

create function private.is_family_member(p_family_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = p_family_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function private.has_family_role(p_family_id uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = p_family_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (p_roles)
  );
$$;

create function private.shares_family_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.family_members a
    join public.family_members b on b.family_id = a.family_id
    where a.user_id = (select auth.uid()) and a.status = 'active'
      and b.user_id = p_user_id and b.status = 'active'
  );
$$;

-- MVP: uma família ativa por usuário.
create function private.current_family_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.family_id
  from public.family_members m
  where m.user_id = (select auth.uid()) and m.status = 'active'
  limit 1;
$$;

revoke execute on function private.is_family_member(uuid) from public, anon;
revoke execute on function private.has_family_role(uuid, text[]) from public, anon;
revoke execute on function private.shares_family_with(uuid) from public, anon;
revoke execute on function private.current_family_id() from public, anon;
grant execute on function private.is_family_member(uuid) to authenticated;
grant execute on function private.has_family_role(uuid, text[]) to authenticated;
grant execute on function private.shares_family_with(uuid) to authenticated;
grant execute on function private.current_family_id() to authenticated;

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_family_with(id));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- families
create policy families_select on public.families
  for select to authenticated
  using (private.is_family_member(id));

create policy families_update_owner on public.families
  for update to authenticated
  using (private.has_family_role(id, array['owner']))
  with check (private.has_family_role(id, array['owner']));

-- family_members (somente leitura pela API)
create policy family_members_select on public.family_members
  for select to authenticated
  using (private.is_family_member(family_id));

-- family_invites (somente leitura pela API, só owner/admin)
create policy family_invites_select_managers on public.family_invites
  for select to authenticated
  using (private.has_family_role(family_id, array['owner', 'admin']));

-- audit_events (somente leitura pela API, só owner/admin)
create policy audit_events_select_managers on public.audit_events
  for select to authenticated
  using (private.has_family_role(family_id, array['owner', 'admin']));

-- DOWN (manual): drop das 7 policies acima e das 4 funções private.*.
