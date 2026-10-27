-- Núcleo · Etapa 2 · family_invites. Spec: docs/data-model.md §4.5; ADR-0007 (só o hash do token).

create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  role text not null default 'member'
    constraint family_invites_role_check check (role in ('admin', 'member')),  -- convite nunca cria owner
  token_hash text not null
    constraint family_invites_token_hash_key unique
    constraint family_invites_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_email text null
    constraint family_invites_invited_email_check check (
      invited_email is null
      or (invited_email = lower(btrim(invited_email)) and char_length(invited_email) between 3 and 254)
    ),
  created_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  accepted_by uuid null references public.profiles (id) on delete restrict,
  revoked_at timestamptz null,
  revoked_by uuid null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint family_invites_expires_after_created check (expires_at > created_at),
  constraint family_invites_accepted_pair check ((accepted_at is null) = (accepted_by is null)),
  constraint family_invites_revoked_pair check ((revoked_at is null) = (revoked_by is null)),
  constraint family_invites_not_accepted_and_revoked check (accepted_at is null or revoked_at is null)
);

-- Listagem de convites da família e contagem de pendentes (limite de 20).
create index family_invites_family_created_at on public.family_invites (family_id, created_at desc);

alter table public.family_invites enable row level security;
revoke all on public.family_invites from anon, authenticated;
-- select por coluna: token_hash fica fora do grant (select * falha; repositories listam colunas).
grant select (id, family_id, role, invited_email, created_by, expires_at, accepted_at, accepted_by,
              revoked_at, revoked_by, created_at)
  on public.family_invites to authenticated;

-- DOWN (manual): drop table public.family_invites;
