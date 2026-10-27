-- Núcleo · Etapa 2 · audit_events (append-only) e private.log_audit. Spec: docs/data-model.md §4.6.

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  actor_user_id uuid null references public.profiles (id) on delete restrict,  -- null = sistema
  entity_type text not null
    constraint audit_events_entity_type_check check (entity_type ~ '^[a-z_]{1,40}$'),
  entity_id uuid null,
  action text not null
    constraint audit_events_action_check check (action ~ '^[a-z_]{1,40}\.[a-z_]{1,40}$'),
  metadata jsonb not null default '{}'::jsonb
    constraint audit_events_metadata_check check (
      jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096
    ),
  created_at timestamptz not null default now()
);

-- Leitura de auditoria por família, mais recentes primeiro.
create index audit_events_family_created_at on public.audit_events (family_id, created_at desc);

alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;  -- sem insert/update/delete pela API

create function private.log_audit(
  p_family_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_events (family_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (p_family_id, auth.uid(), p_entity_type, p_entity_id, p_action, coalesce(p_metadata, '{}'::jsonb));
$$;
revoke all on function private.log_audit(uuid, text, uuid, text, jsonb) from public, anon, authenticated;

-- DOWN (manual): drop function private.log_audit(uuid, text, uuid, text, jsonb); drop table public.audit_events;
