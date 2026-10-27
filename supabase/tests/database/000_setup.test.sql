-- Helpers de teste (schema `tests`). Vivem só no banco local de teste; nunca em migration (ADR-0009).
-- Este arquivo confirma (sem rollback) para que os demais arquivos usem os helpers.
-- `supabase db reset` recria o banco do zero e remove tudo isto.

begin;

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Identificadores determinísticos por chave ('a', 'b', ...).
create or replace function tests.uid(p_key text) returns uuid
language sql immutable as $$ select md5('nucleo-test-user-' || p_key)::uuid $$;

create or replace function tests.fid(p_key text) returns uuid
language sql immutable as $$ select md5('nucleo-test-family-' || p_key)::uuid $$;

-- Cria usuário no Auth (o trigger cria o profile). E-mail = <chave>@test.local.
create or replace function tests.create_user(p_key text, p_display_name text default null) returns uuid
language plpgsql as $$
declare
  v_id uuid := tests.uid(p_key);
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_id, 'authenticated', 'authenticated', p_key || '@test.local',
    case when p_display_name is null then '{}'::jsonb else jsonb_build_object('display_name', p_display_name) end,
    now(), now()
  );
  return v_id;
end;
$$;

-- Personifica um usuário autenticado (equivalente a set local role + request.jwt.claims).
create or replace function tests.login_as(p_key text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.uid(p_key), 'role', 'authenticated', 'email', p_key || '@test.local')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.login_no_sub() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.login_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

create or replace function tests.logout() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Cenário base (executar como postgres):
--   usuários: a, ad, m, b, c, d
--   família A: a = owner, ad = admin, m = member ; família B: b = owner ; c e d sem família.
create or replace function tests.setup_world() returns void
language plpgsql as $$
begin
  perform tests.create_user('a', 'Ana Dona');
  perform tests.create_user('ad', 'Beto Admin');
  perform tests.create_user('m', 'Carla Membro');
  perform tests.create_user('b', 'Bruno Outro');
  perform tests.create_user('c', 'Caio Sem Familia');
  perform tests.create_user('d', 'Dani Sem Familia');

  insert into public.families (id, name, created_by) values
    (tests.fid('A'), 'Família A', tests.uid('a')),
    (tests.fid('B'), 'Família B', tests.uid('b'));
  insert into public.family_members (family_id, user_id, role) values
    (tests.fid('A'), tests.uid('a'), 'owner'),
    (tests.fid('A'), tests.uid('ad'), 'admin'),
    (tests.fid('A'), tests.uid('m'), 'member'),
    (tests.fid('B'), tests.uid('b'), 'owner');
end;
$$;

-- Cria um convite como <p_user_key> e guarda token/id em GUCs locais da transação (nome lógico p_name).
create or replace function tests.stash_invite(p_name text, p_user_key text, p_role text, p_email text default null)
returns void
language plpgsql as $$
declare
  v_id uuid;
  v_token text;
begin
  perform tests.login_as(p_user_key);
  select r.invite_id, r.token into v_id, v_token from public.create_family_invite(p_role, p_email) r;
  perform tests.logout();
  perform set_config('tests.tok_' || p_name, v_token, true);
  perform set_config('tests.inv_' || p_name, v_id::text, true);
end;
$$;

create or replace function tests.tok(p_name text) returns text
language sql stable as $$ select current_setting('tests.tok_' || p_name) $$;

create or replace function tests.inv(p_name text) returns uuid
language sql stable as $$ select current_setting('tests.inv_' || p_name)::uuid $$;

-- Executa um DML como o papel atual e devolve o nº de linhas afetadas (RLS que filtra = 0, sem erro).
create or replace function tests.affected(p_sql text) returns integer
language plpgsql as $$
declare
  v_n integer;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select plan(3);
select has_schema('tests', 'schema de helpers de teste existe');
select has_function('tests', 'setup_world', 'helper setup_world existe');
select has_extension('pgcrypto', 'pgcrypto instalado (geração do token de convite)');
select * from finish();

commit;
