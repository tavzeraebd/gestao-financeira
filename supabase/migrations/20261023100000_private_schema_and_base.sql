-- Núcleo · Etapa 2 · base: schema private, pgcrypto e trigger genérico de updated_at.
-- Spec: docs/data-model.md §1 e §4.1.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;  -- necessário para as policies avaliarem os helpers

create extension if not exists pgcrypto with schema extensions;

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function private.set_updated_at() from public, anon, authenticated;

-- DOWN (manual): drop function private.set_updated_at(); drop schema private;
