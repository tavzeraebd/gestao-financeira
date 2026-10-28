-- CA-E9-21 e CA-E9-23 (M4, ADR-0038, AB-128): completude do mapa de private.erase_family sobre pg_constraint e regressão da Etapa 9.
--   * toda tabela com FK para public.families (direta ou por tabela da família) tem `delete from public.<tabela>` em erase_family; tabela
--     nova sem entrada REPROVA (o teste prova isso com tabelas temporárias na própria transação);
--   * nenhuma FK `restrict` bloqueia: o cenário tem linhas em TODAS as tabelas e em TODAS as colunas de FK para profiles; a exclusão
--     (saída de member e família inteira) acontece, nada fica para trás (varredura por catálogo, não por lista) e profiles/auth.users
--     NUNCA são apagados (as FKs de created_by/deleted_by/accepted_by/revoked_by/actor_user_id/user_id continuam íntegras);
--   * R1 e os totais não mudam com a saída de um integrante; a outra família não muda com a exclusão da primeira; com os limites de
--     volume e frequência nos valores de PRODUÇÃO (M1 ativo durante todo o arquivo);
--   * o commit simulado (set constraints all immediate) não acusa o trigger deferido de parcelas depois da exclusão.
begin;

select no_plan();

select tests.setup_world();

create function tests.snap() returns jsonb language sql as $$
  select jsonb_build_object(
    'bal', (select jsonb_agg(to_jsonb(b) order by to_jsonb(b)::text) from public.account_balances() b),
    'ps', (select to_jsonb(p) from public.period_summary(private.today() - 30, private.today()) p),
    'bp', (select to_jsonb(p) from public.pending_summary() p),
    'mb', (select jsonb_agg(to_jsonb(p) order by to_jsonb(p)::text) from public.member_balances() p),
    'gs', (select jsonb_agg(to_jsonb(g) order by to_jsonb(g)::text) from public.goal_summary(private.today() - 89, private.today()) g)) $$;
create function tests.commit_check() returns void language plpgsql as $$
begin set constraints all immediate; set constraints all deferred; end $$;
-- tabelas da família conforme o catálogo: FK para families, direta ou por tabela da família (fecho transitivo)
create function tests.erase_family_tables() returns setof text language sql as $$
  with recursive fam as (
    select c.conrelid as relid from pg_constraint c where c.contype = 'f' and c.confrelid = 'public.families'::regclass
    union
    select c.conrelid from pg_constraint c join fam f on c.confrelid = f.relid where c.contype = 'f'
  )
  select n.nspname || '.' || r.relname
  from fam f join pg_class r on r.oid = f.relid join pg_namespace n on n.oid = r.relnamespace
$$;
-- tabelas da família SEM `delete from <tabela> where` no corpo de erase_family
create function tests.erase_map_missing() returns setof text language sql as $$
  select t from tests.erase_family_tables() t
  where (select p.prosrc from pg_proc p where p.oid = 'private.erase_family(uuid)'::regprocedure)
        !~* ('delete\s+from\s+' || replace(t, '.', '\.') || '\s+where')
$$;
grant execute on function tests.snap(), tests.commit_check() to authenticated;

-- m e a registram dados em todas as tabelas; b (família B) é o controle
select tests.seed_family_data(tests.fid('A'), 'm', 'a', 'm');
select tests.seed_family_data(tests.fid('A'), 'a', 'ad', 'a');
select tests.seed_family_data(tests.fid('B'), 'b', null, 'b');

-- 1 · M1 ativo com os valores de produção durante todo o arquivo -----------------------------------------------------------------------
select is((select jsonb_object_agg(kind, jsonb_build_array(max_active, max_per_hour)) from private.volume_limits),
  '{"transactions": [100000, 500], "goal_contributions_goal": [10000, 0], "goal_contributions_family": [50000, 500],
    "settlements": [20000, 200], "notifications_user": [500, 0]}'::jsonb,
  'CA-E9-23: volume_limits com os valores de produção (nada baixado neste arquivo)');
select is((select count(*)::int from pg_trigger where tgname in ('transactions_volume_bi', 'goal_contributions_volume_bi', 'settlements_volume_bi')
    and not tgisinternal), 3, 'CA-E9-23: os triggers de volume estão ativos');
select is((select count(*)::int from public.transactions where created_by in (tests.uid('a'), tests.uid('m'))), 14,
  'CA-E9-23: os 14 lançamentos do cenário passaram pelos triggers de volume com os limites de produção');

-- 2 · completude do mapa de erase_family (CA-E9-21) --------------------------------------------------------------------------------------
select is((select array_agg(t order by t) from tests.erase_family_tables() t),
  array['public.accounts', 'public.audit_events', 'public.budgets', 'public.categories', 'public.expense_splits', 'public.family_invites',
        'public.family_members', 'public.goal_contributions', 'public.goals', 'public.notifications', 'public.recurrences',
        'public.settlements', 'public.transactions'],
  'CA-E9-21: o catálogo (pg_constraint, fecho a partir de families) lista exatamente as 13 tabelas da família; tabela nova reprova aqui');
select is_empty($$select * from tests.erase_map_missing()$$,
  'CA-E9-21: toda tabela da família tem `delete from <tabela> where` em private.erase_family');
select ok((select p.prosrc ~* 'delete\s+from\s+public\.families\s+where' from pg_proc p where p.oid = 'private.erase_family(uuid)'::regprocedure),
  'CA-E9-21: erase_family apaga a própria families');
select ok((select strpos(p.prosrc, 'delete from public.audit_events') > strpos(p.prosrc, 'delete from public.categories')
          and strpos(p.prosrc, 'delete from public.family_members') > strpos(p.prosrc, 'delete from public.audit_events')
          and strpos(p.prosrc, 'delete from public.families') > strpos(p.prosrc, 'delete from public.family_members')
          from pg_proc p where p.oid = 'private.erase_family(uuid)'::regprocedure),
  'CA-E9-21: audit_events é apagada depois de categories (trigger de auditoria) e antes dos vínculos; families por último');
select ok((select p.prosrc !~* 'delete\s+from\s+(public\.profiles|auth\.users)' from pg_proc p where p.oid = 'private.erase_family(uuid)'::regprocedure)
      and (select p.prosrc !~* 'delete\s+from\s+(public\.profiles|auth\.users)' from pg_proc p where p.oid = 'public.delete_my_account()'::regprocedure),
  'AB-128: nem delete_my_account nem erase_family apagam profiles ou auth.users (as FKs restrict de created_by etc. nunca são testadas por DELETE)');
select cmp_ok((select count(*)::int from pg_constraint c
    where c.contype = 'f' and array_length(c.conkey, 1) = 1 and c.confrelid = 'public.profiles'::regclass
      and c.connamespace in ('public'::regnamespace, 'private'::regnamespace)), '>=', 21,
  'CA-E9-21: o catálogo enxerga as 21 FKs de coluna única para profiles (a varredura abaixo não é vazia)');
select is_empty($$select * from tests.fk_paths_uncovered(tests.uid('a'))$$,
  'CA-E9-21: o cenário tem linha do owner em TODA FK para profiles (nenhum caminho de bloqueio ficou sem exercício)');
select is_empty($$select * from tests.fk_paths_uncovered(tests.uid('m'))
    where fk_paths_uncovered <> 'families.created_by'$$,
  'CA-E9-21: o member também tem linha em toda FK para profiles (exceto families.created_by, que é só do owner)');
select is((select count(*)::int from tests.family_table_counts(tests.fid('A')) where n = 0), 0, 'CA-E9-20: antes, todas as tabelas da família A têm linhas');

-- 3 · regressão com a saída de um member (R1, totais e família B) ----------------------------------------------------------------------------
select tests.login_as('a');
select set_config('tests.snap_a0', tests.snap()::text, true);
select tests.login_as('b');
select set_config('tests.snap_b0', tests.snap()::text, true);
select tests.logout();
select set_config('tests.hash_b', tests.family_hash(tests.fid('B')), true);
select set_config('tests.tx_total', (select count(*)::text from public.transactions), true);

select tests.login_amr('m');
select is((select public.delete_my_account()), '{"family_erased": false}'::jsonb, 'CA-E9-23: o member exclui a conta');
select tests.logout();

select tests.login_as('a');
select is(tests.snap(), current_setting('tests.snap_a0')::jsonb,
  'CA-E9-23: R1 e totais da família A (saldos, resumo, pendentes, saldos entre integrantes, metas) iguais depois da saída do member');
select tests.login_as('b');
select is(tests.snap(), current_setting('tests.snap_b0')::jsonb, 'CA-E9-23: a família B vê os mesmos números');
select tests.logout();
select is((select count(*)::text from public.transactions), current_setting('tests.tx_total'), 'CA-E9-23: a saída não apagou nenhum lançamento');
select is(tests.family_hash(tests.fid('B')), current_setting('tests.hash_b'), 'CA-E9-23: a família B está byte a byte igual');
select is((select count(*)::int from tests.family_table_counts(tests.fid('A')) where n = 0), 0, 'CA-E9-23: a família A segue completa depois da saída do member');

-- 4 · exclusão da família inteira: nada bloqueia, nada sobra --------------------------------------------------------------------------------
update public.family_members set status = 'left', ended_at = now() where user_id = tests.uid('ad');  -- a fica sozinho
select is((select count(*)::int from public.family_members where family_id = tests.fid('A') and status = 'active'), 1, 'cenário: a é o único ativo');
select is_empty($$select * from tests.fk_paths_uncovered(tests.uid('a'))$$, 'CA-E9-21: o owner ainda cobre todas as FKs para profiles');

select tests.login_amr('a');
select lives_ok($$select public.delete_my_account()$$,
  'CA-E9-21: com linhas em todas as tabelas e em todas as FKs restrict, a exclusão do owner sozinho NÃO é bloqueada');
select tests.logout();
select lives_ok($$select tests.commit_check()$$, 'CA-E9-21: o commit simulado (constraints deferidas imediatas) não acusa o trigger de parcelas');

select is((select array_agg(tbl order by tbl) from tests.family_table_counts(tests.fid('A')) where n > 0), null::text[],
  'CA-E9-21: NENHUMA tabela com family_id (public ou private, por catálogo) guarda linha da família apagada');
select is((select count(*)::int from public.expense_splits s where not exists (select 1 from public.transactions t where t.id = s.transaction_id)), 0,
  'CA-E9-21: nenhuma parcela órfã');
select is((select count(*)::int from public.notifications n where not exists (select 1 from public.families f where f.id = n.family_id)), 0,
  'CA-E9-21: nenhuma notificação aponta para família inexistente');
select is((select count(*)::int from public.audit_events e where not exists (select 1 from public.families f where f.id = e.family_id)), 0,
  'CA-E9-21: nenhum evento de auditoria aponta para família inexistente (inclusive os category.deleted gerados pela exclusão)');
select is((select count(*)::int from public.profiles p where p.id in (tests.uid('a'), tests.uid('m'), tests.uid('ad'))
    and exists (select 1 from auth.users u where u.id = p.id)), 3, 'AB-128: os 3 perfis continuam e continuam ligados a auth.users');
select is(tests.family_hash(tests.fid('B')), current_setting('tests.hash_b'), 'CA-E9-20: a família B segue byte a byte igual depois da exclusão da A');
select tests.login_as('b');
select is(tests.snap(), current_setting('tests.snap_b0')::jsonb, 'CA-E9-20: a família B vê os mesmos números depois da exclusão da A');
select tests.logout();

-- 5 · controle negativo: tabela nova sem entrada no mapa REPROVA ----------------------------------------------------------------------------
create table public.zz_tmp_family_child (id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families (id));
create table public.zz_tmp_grandchild (id uuid primary key default gen_random_uuid(), transaction_id uuid references public.transactions (id));
select is((select array_agg(t order by t) from tests.erase_map_missing() t), array['public.zz_tmp_family_child', 'public.zz_tmp_grandchild'],
  'CA-E9-21: tabela nova com FK para families (e a que só aponta para uma tabela da família) é acusada como fora do mapa');
select isnt((select count(*)::int from tests.erase_family_tables()), 13, 'CA-E9-21: o fecho do catálogo passa a ter mais de 13 tabelas');

select * from finish();
rollback;
