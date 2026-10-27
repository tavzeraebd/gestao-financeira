-- Núcleo · Etapa 2 · profiles + trigger de cadastro. Spec: docs/data-model.md §4.2.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    constraint profiles_display_name_check check (char_length(btrim(display_name)) between 1 and 80),
  avatar_url text null
    constraint profiles_avatar_url_check check (
      avatar_url is null or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://')
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

-- raw_user_meta_data é controlado pelo usuário: só display_name é lido, com trim e corte em 80.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  v_name := left(
    btrim(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Usuário'
    )),
    80
  );
  insert into public.profiles (id, display_name) values (new.id, v_name);
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- DOWN (manual): drop trigger on_auth_user_created on auth.users; drop function private.handle_new_user();
--                drop table public.profiles;
-- Efeito em dados existentes: usuários do Auth anteriores à migration não ganham profile (banco novo: nenhum).
