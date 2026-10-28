-- CA-E2-01, CA-E2-02, CA-E2-03, CA-E2-22 (parte estrutural): postura de segurança do schema.
begin;

select plan(14);

-- CA-E2-01
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0, 'CA-E2-01: nenhuma tabela de public sem RLS');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')),
  15, 'CA-E2-01: public tem exatamente as 15 tabelas (5 da Etapa 2 + accounts, categories, transactions da Etapa 3 + recurrences, budgets da Etapa 5 + goals, goal_contributions, expense_splits, settlements da Etapa 6 + notifications da Etapa 7)');

-- CA-E2-02
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and has_any_column_privilege('anon', c.oid, 'select, insert, update, references')),
  0, 'CA-E2-02: anon sem privilégio de coluna em nenhuma relação de public');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
        or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete')
        or has_table_privilege('anon', c.oid, 'truncate') or has_table_privilege('anon', c.oid, 'references')
        or has_table_privilege('anon', c.oid, 'trigger'))),
  0, 'CA-E2-02: anon sem privilégio de tabela em public');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')),
  0, 'CA-E2-02: anon sem EXECUTE em funções de public e private');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and has_function_privilege('public', p.oid, 'execute')),
  0, 'CA-E2-02: PUBLIC sem EXECUTE em funções de public e private');
select ok(not has_schema_privilege('anon', 'private', 'usage'), 'CA-E2-02: anon sem USAGE no schema private');
select ok(has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated tem USAGE em private (as policies avaliam os helpers)');

-- CA-E2-03
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0, 'CA-E2-03: toda função security definer tem search_path vazio');
select cmp_ok(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef),
  '>=', 11, 'CA-E2-03: o teste enxerga as funções security definer (5 RPCs + 4 helpers + handle_new_user + log_audit)');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and not coalesce(p.proconfig @> array['search_path=""'], false)),
  0, 'toda função de public/private (inclusive set_updated_at) fixa search_path');

-- CA-E2-22 (parte estrutural): helpers não estão no schema exposto pela API (public)
select hasnt_function('public', 'is_family_member', 'helper is_family_member não está em public');
select hasnt_function('public', 'has_family_role', 'helper has_family_role não está em public');
select hasnt_function('public', 'log_audit', 'log_audit não está em public');

select * from finish();
rollback;
