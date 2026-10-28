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

-- Etapa 9 (M1): refresh_notifications tem intervalo mínimo de 30 s por usuário, e dentro de uma transação de teste now() não
-- avança. Este helper zera a janela do usuário (como dono do banco) e volta a personificá-lo, para os testes que precisam de
-- uma segunda geração na mesma transação (530, 550, 620). Não existe em produção.
create or replace function tests.reset_refresh_gate(p_key text) returns void
language plpgsql as $$
begin
  perform tests.logout();
  delete from private.notification_refresh_state where user_id = tests.uid(p_key);
  perform tests.login_as(p_key);
end;
$$;

-- Etapa 9 (M4, exclusão de conta) ----------------------------------------------------------------------------------------------
-- Segundos desde a época do now() da transação (o mesmo relógio que private.require_recent_auth usa).
create or replace function tests.epoch() returns bigint
language sql stable as $$ select floor(extract(epoch from now()))::bigint $$;

-- Define os claims do JWT SEM trocar de papel (para testar funções private como dono do banco).
create or replace function tests.set_claims(p_claims jsonb) returns void
language sql as $$ select set_config('request.jwt.claims', coalesce(p_claims, '{}'::jsonb)::text, true) $$;

-- Personifica um usuário autenticado com o claim `amr` informado (o que o GoTrue coloca no JWT depois de signInWithPassword:
-- [{"method":"password","timestamp":<epoch>}]). p_amr nulo = claim "amr" JSON null.
create or replace function tests.login_claims(p_key text, p_amr jsonb) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', tests.uid(p_key), 'role', 'authenticated', 'email', p_key || '@test.local', 'amr', p_amr)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Usuário com reautenticação por senha de p_age_seconds atrás (0 = agora).
create or replace function tests.login_amr(p_key text, p_age_seconds integer default 0, p_method text default 'password') returns void
language plpgsql as $$
begin
  perform tests.login_claims(p_key,
    jsonb_build_array(jsonb_build_object('method', p_method, 'timestamp', tests.epoch() - p_age_seconds)));
end;
$$;

-- Contagem de linhas de uma família em TODAS as tabelas de public/private que têm a coluna family_id, mais a própria families.
-- Descoberta por catálogo: tabela nova com family_id aparece sozinha (e reprova a prova de exclusão se ficar com linhas).
create or replace function tests.family_table_counts(p_fid uuid) returns table (tbl text, n bigint)
language plpgsql as $$
declare
  r record;
begin
  for r in
    select c.table_schema as sch, c.table_name as nm
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.column_name = 'family_id' and c.table_schema in ('public', 'private')
    order by c.table_schema, c.table_name
  loop
    execute format('select count(*) from %I.%I where family_id = $1', r.sch, r.nm) into n using p_fid;
    tbl := r.sch::text || '.' || r.nm::text;
    return next;
  end loop;
  select count(*) into n from public.families f where f.id = p_fid;
  tbl := 'public.families';
  return next;
end;
$$;

-- Impressão digital do conteúdo de uma família (todas as tabelas com family_id + families): "a outra família permanece idêntica".
create or replace function tests.family_hash(p_fid uuid) returns text
language plpgsql as $$
declare
  r record;
  v text := '';
  s text;
begin
  for r in
    select c.table_schema as sch, c.table_name as nm
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
    where c.column_name = 'family_id' and c.table_schema in ('public', 'private')
    order by c.table_schema, c.table_name
  loop
    execute format('select coalesce(string_agg(to_jsonb(t)::text, '','' order by to_jsonb(t)::text), '''') from %I.%I t where t.family_id = $1',
      r.sch, r.nm) into s using p_fid;
    v := v || r.nm::text || ':' || md5(s) || ';';
  end loop;
  select coalesce(string_agg(to_jsonb(f)::text, ',' order by to_jsonb(f)::text), '') into s from public.families f where f.id = p_fid;
  return md5(v || 'families:' || md5(s));
end;
$$;

-- Impressão digital do "mundo": todo o conteúdo de public + as duas tabelas private da exclusão/notificação + o que a exclusão
-- toca em auth.users. Igual antes e depois = a operação não mudou nada.
create or replace function tests.world_hash() returns text
language plpgsql as $$
declare
  r record;
  v text := '';
  s text;
begin
  for r in
    select n.nspname as sch, c.relname as nm
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and (n.nspname = 'public' or (n.nspname = 'private' and c.relname in ('notification_refresh_state', 'account_erasure_log')))
    order by n.nspname, c.relname
  loop
    execute format('select coalesce(string_agg(to_jsonb(t)::text, '','' order by to_jsonb(t)::text), '''') from %I.%I t', r.sch, r.nm) into s;
    v := v || r.nm::text || ':' || md5(s) || ';';
  end loop;
  select coalesce(string_agg(
    jsonb_build_array(u.id, u.email, u.encrypted_password, u.banned_until, u.deleted_at, u.raw_user_meta_data)::text, ',' order by u.id), '')
  into s from auth.users u;
  return md5(v || 'auth:' || md5(s));
end;
$$;

-- Pares (tabela.coluna) com FK de coluna única para public.profiles que NENHUMA linha usa para p_user. Vazio = o cenário de teste
-- exercita todos os caminhos de FK `restrict` que poderiam bloquear a exclusão.
create or replace function tests.fk_paths_uncovered(p_user uuid) returns setof text
language plpgsql as $$
declare
  r record;
  v_n bigint;
begin
  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and array_length(c.conkey, 1) = 1
      and c.confrelid = 'public.profiles'::regclass
      and c.connamespace in ('public'::regnamespace, 'private'::regnamespace)
    order by 1, 2
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using p_user;
    if v_n = 0 then
      return next r.tbl || '.' || r.col;
    end if;
  end loop;
end;
$$;

-- Dados "reais" de uma família, TODOS registrados por p_actor (e com p_peer como contraparte quando informado), cobrindo cada
-- tabela com family_id e cada FK `restrict` para profiles (created_by, deleted_by, accepted_by, revoked_by, user_id, actor_user_id):
-- contas, categorias (com subcategoria), lançamentos (pago, receita, transferência, pendente, excluído logicamente, estorno, de série),
-- série, orçamento, meta, aportes (um excluído), parcelas, acertos (um excluído; só com p_peer), convites (pendente com e-mail,
-- aceito, revogado), notificação do ator (e do par), evento de segurança e estado de refresh. Roda como dono; as escritas que
-- dependem de auth.uid() (estorno, exclusões lógicas, aportes, acertos) personificam p_actor. p_tag torna os ids e nomes únicos.
create or replace function tests.seed_family_data(p_fid uuid, p_actor text, p_peer text, p_tag text) returns void
language plpgsql as $$
declare
  v_u uuid := tests.uid(p_actor);
  v_peer uuid := case when p_peer is null then null else tests.uid(p_peer) end;
  v_m uuid;
  v_pm uuid;
  v_acc1 uuid := md5('sd-acc1-' || p_tag)::uuid;
  v_acc2 uuid := md5('sd-acc2-' || p_tag)::uuid;
  v_cat1 uuid := md5('sd-cat1-' || p_tag)::uuid;
  v_cat2 uuid := md5('sd-cat2-' || p_tag)::uuid;
  v_cat3 uuid := md5('sd-cat3-' || p_tag)::uuid;
  v_t1 uuid := md5('sd-t1-' || p_tag)::uuid;
  v_t2 uuid := md5('sd-t2-' || p_tag)::uuid;
  v_t3 uuid := md5('sd-t3-' || p_tag)::uuid;
  v_t4 uuid := md5('sd-t4-' || p_tag)::uuid;
  v_t5 uuid := md5('sd-t5-' || p_tag)::uuid;
  v_t6 uuid := md5('sd-t6-' || p_tag)::uuid;
  v_rec uuid := md5('sd-rec-' || p_tag)::uuid;
  v_goal uuid := md5('sd-goal-' || p_tag)::uuid;
begin
  select m.id into v_m from public.family_members m
  where m.family_id = p_fid and m.user_id = v_u order by (m.status = 'active') desc, m.joined_at desc limit 1;
  if v_peer is not null then
    select m.id into v_pm from public.family_members m
    where m.family_id = p_fid and m.user_id = v_peer order by (m.status = 'active') desc, m.joined_at desc limit 1;
  end if;

  insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
    (v_acc1, p_fid, 'Corrente ' || p_tag, 'checking', 1000, '2020-01-01', v_u),
    (v_acc2, p_fid, 'Poupança ' || p_tag, 'savings', 0, '2020-01-01', v_u);
  insert into public.categories (id, family_id, name, type, color, icon, created_by) values
    (v_cat1, p_fid, 'Mercado ' || p_tag, 'expense', 'chart-1', 'utensils', v_u),
    (v_cat2, p_fid, 'Salário ' || p_tag, 'income', 'chart-2', 'briefcase', v_u);
  insert into public.categories (id, family_id, name, type, color, icon, parent_id, created_by) values
    (v_cat3, p_fid, 'Feira ' || p_tag, 'expense', 'chart-1', 'utensils', v_cat1, v_u);

  insert into public.transactions (id, family_id, type, account_id, destination_account_id, category_id, assigned_member_id,
                                   description, amount, transaction_date, status, created_by) values
    (v_t1, p_fid, 'income', v_acc1, null, v_cat2, null, 'Receita ' || p_tag, 500, private.today() - 10, 'paid', v_u),
    (v_t2, p_fid, 'expense', v_acc1, null, v_cat1, v_m, 'Despesa ' || p_tag, 100, private.today() - 9, 'paid', v_u),
    (v_t3, p_fid, 'transfer', v_acc1, v_acc2, null, null, 'Transferência ' || p_tag, 50, private.today() - 8, 'paid', v_u),
    (v_t4, p_fid, 'expense', v_acc1, null, v_cat3, v_m, 'Pendente ' || p_tag, 40, private.today() + 5, 'pending', v_u),
    (v_t5, p_fid, 'expense', v_acc1, null, v_cat1, null, 'Para excluir ' || p_tag, 20, private.today() - 7, 'paid', v_u);

  insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by)
    values (v_rec, p_fid, 'expense', v_acc1, v_cat1, 'Série ' || p_tag, 30, 'monthly', private.today() + 400, v_u);
  insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status,
                                   recurrence_id, occurrence_date, created_by)
    values (v_t6, p_fid, 'expense', v_acc1, v_cat1, 'Da série ' || p_tag, 30, private.today() + 130, 'pending', v_rec,
            private.today() + 130, v_u);
  insert into public.budgets (family_id, category_id, amount_limit, start_month, created_by)
    values (p_fid, v_cat1, 500, '2025-01-01', v_u);
  insert into public.goals (id, family_id, name, target_amount, created_by)
    values (v_goal, p_fid, 'Meta ' || p_tag, 5000, v_u);

  if v_pm is not null then
    insert into public.expense_splits (family_id, transaction_id, member_id, amount, created_by) values
      (p_fid, v_t2, v_m, 50, v_u), (p_fid, v_t2, v_pm, 50, v_u);
  else
    insert into public.expense_splits (family_id, transaction_id, member_id, amount, created_by) values
      (p_fid, v_t2, v_m, 100, v_u);
  end if;

  -- convites: pendente com e-mail (criado por p_actor), aceito por p_actor (e-mail dele, criado pelo par) e revogado por p_actor
  insert into public.family_invites (id, family_id, role, token_hash, invited_email, created_by, expires_at) values
    (md5('sd-i1-' || p_tag)::uuid, p_fid, 'member', md5('i1a' || p_tag) || md5('i1b' || p_tag),
     p_actor || '-convidado@test.local', v_u, now() + interval '7 days');
  insert into public.family_invites (id, family_id, role, token_hash, invited_email, created_by, expires_at, created_at,
                                     accepted_at, accepted_by) values
    (md5('sd-i2-' || p_tag)::uuid, p_fid, 'member', md5('i2a' || p_tag) || md5('i2b' || p_tag),
     p_actor || '@test.local', coalesce(v_peer, v_u), now() + interval '7 days', now() - interval '1 day', now(), v_u);
  insert into public.family_invites (id, family_id, role, token_hash, invited_email, created_by, expires_at, revoked_at, revoked_by) values
    (md5('sd-i3-' || p_tag)::uuid, p_fid, 'member', md5('i3a' || p_tag) || md5('i3b' || p_tag),
     p_actor || '-revogado@test.local', v_u, now() + interval '7 days', now(), v_u);

  insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
    values (p_fid, v_u, 'financial_event', 'transaction', v_t2, 'financial_event:' || v_t2::text);
  if v_peer is not null then
    insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
      values (p_fid, v_peer, 'financial_event', 'transaction', v_t2, 'financial_event:' || v_t2::text);
  end if;
  insert into public.security_events (user_id, action) values (v_u, 'password.changed');
  insert into private.notification_refresh_state (user_id, last_run_at) values (v_u, now()) on conflict (user_id) do nothing;

  -- escritas que dependem de auth.uid(): estorno, exclusões lógicas (deleted_by), aportes e acertos
  perform tests.login_as(p_actor);
  insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, reversal_of_id)
    values (p_fid, 'expense', v_acc1, v_cat1, 'Estorno ' || p_tag, 30, private.today() - 5, v_t2);
  update public.transactions set deleted_at = now() where id = v_t5;
  insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date, notes) values
    (p_fid, v_goal, v_m, 'deposit', 200, private.today() - 2, 'seed-keep-' || p_tag),
    (p_fid, v_goal, v_m, 'deposit', 50, private.today() - 2, 'seed-del-' || p_tag);
  update public.goal_contributions set deleted_at = now() where goal_id = v_goal and notes = 'seed-del-' || p_tag;
  if v_pm is not null then
    insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, notes) values
      (p_fid, v_m, v_pm, 10, private.today() - 1, 'seed-keep-' || p_tag),
      (p_fid, v_m, v_pm, 5, private.today() - 1, 'seed-del-' || p_tag);
    update public.settlements set deleted_at = now() where family_id = p_fid and notes = 'seed-del-' || p_tag;
  end if;
  perform tests.logout();
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select plan(3);
select has_schema('tests', 'schema de helpers de teste existe');
select has_function('tests', 'setup_world', 'helper setup_world existe');
select has_extension('pgcrypto', 'pgcrypto instalado (geração do token de convite)');
select * from finish();

commit;
