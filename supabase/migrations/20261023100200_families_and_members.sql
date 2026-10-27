-- Núcleo · Etapa 2 · families e family_members. Spec: docs/data-model.md §4.3 e §4.4.

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint families_name_check check (char_length(btrim(name)) between 1 and 80),
  base_currency char(3) not null default 'BRL'
    constraint families_base_currency_check check (base_currency = 'BRL'),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger families_set_updated_at
  before update on public.families
  for each row execute function private.set_updated_at();

alter table public.families enable row level security;
revoke all on public.families from anon, authenticated;
grant select on public.families to authenticated;
grant update (name) on public.families to authenticated;

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role text not null
    constraint family_members_role_check check (role in ('owner', 'admin', 'member')),
  status text not null default 'active'
    constraint family_members_status_check check (status in ('active', 'removed', 'left')),
  joined_at timestamptz not null default now(),
  ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_members_family_id_id_key unique (family_id, id),  -- alvo de FKs compostas
  constraint family_members_ended_at_check check ((status = 'active') = (ended_at is null))
);

-- Uma família ativa por usuário no MVP (ADR-0008); também serve às buscas por user_id + status ativo
-- (private.current_family_id / is_family_member / has_family_role).
create unique index family_members_one_active_family_per_user
  on public.family_members (user_id) where status = 'active';
-- Exatamente um owner ativo por família.
create unique index family_members_one_owner
  on public.family_members (family_id) where role = 'owner' and status = 'active';
-- Listagem de integrantes ativos e checagem de pertença por família.
create index family_members_family_active
  on public.family_members (family_id) where status = 'active';

create trigger family_members_set_updated_at
  before update on public.family_members
  for each row execute function private.set_updated_at();

alter table public.family_members enable row level security;
revoke all on public.family_members from anon, authenticated;
grant select on public.family_members to authenticated;  -- nenhuma escrita: papel só muda por RPC

-- DOWN (manual): drop table public.family_members; drop table public.families;
