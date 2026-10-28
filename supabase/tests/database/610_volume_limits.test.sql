-- CA-E9-02 a CA-E9-06 (M1, ADR-0033): tetos de volume ativo e de frequência por usuário em transactions, goal_contributions e
-- settlements, aplicados por trigger. Os tetos são baixados em private.volume_limits DENTRO da transação (3, 2...), então nenhum
-- teste insere 100 mil linhas. Dentro de uma transação de teste now() não avança: toda linha criada conta na "última hora".
-- Ordem dos erros na função: volume ativo primeiro, frequência depois; cada bloco isola um dos dois zerando o outro
-- (max_per_hour = 0 desliga a frequência; max_active alto desliga o volume).
begin;

select no_plan();

select tests.setup_world();
-- B ganha um segundo integrante (d) para existir um acerto dentro de B
insert into public.family_members (family_id, user_id, role) values (tests.fid('B'), tests.uid('d'), 'member');
select set_config('tests.mem_a', (select id::text from public.family_members where user_id = tests.uid('a')), true);
select set_config('tests.mem_ad', (select id::text from public.family_members where user_id = tests.uid('ad')), true);
select set_config('tests.mem_m', (select id::text from public.family_members where user_id = tests.uid('m')), true);
select set_config('tests.mem_b', (select id::text from public.family_members where user_id = tests.uid('b')), true);
select set_config('tests.mem_d', (select id::text from public.family_members where user_id = tests.uid('d')), true);

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a7610000-0000-0000-0000-00000000000a', tests.fid('A'), 'Corrente A', 'checking', 0, '2020-01-01', tests.uid('a')),
  ('a7610000-0000-0000-0000-00000000000b', tests.fid('B'), 'Corrente B', 'checking', 0, '2020-01-01', tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c7610000-0000-0000-0000-00000000000a', tests.fid('A'), 'Mercado A', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c7610000-0000-0000-0000-00000000000b', tests.fid('B'), 'Mercado B', 'expense', 'chart-1', 'utensils', tests.uid('b'));
insert into public.goals (id, family_id, name, target_amount, created_by) values
  ('90761000-0000-0000-0000-000000000001', tests.fid('A'), 'Meta 1', 100000, tests.uid('a')),
  ('90761000-0000-0000-0000-000000000002', tests.fid('A'), 'Meta 2', 100000, tests.uid('a')),
  ('90761000-0000-0000-0000-00000000000b', tests.fid('B'), 'Meta B', 100000, tests.uid('b'));

-- helpers desta suíte (rodam com o papel de quem chama; a RLS e os triggers valem)
create function tests.add_tx(p_family uuid, p_account uuid, p_category uuid, p_desc text default 'x') returns void
language sql as $$
  insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status)
  values (p_family, 'expense', p_account, p_category, p_desc, 1, private.today(), 'paid') $$;
create function tests.tx_a(p_desc text default 'x') returns void language sql as $$
  select tests.add_tx(tests.fid('A'), 'a7610000-0000-0000-0000-00000000000a'::uuid, 'c7610000-0000-0000-0000-00000000000a'::uuid, p_desc) $$;
create function tests.tx_b(p_desc text default 'x') returns void language sql as $$
  select tests.add_tx(tests.fid('B'), 'a7610000-0000-0000-0000-00000000000b'::uuid, 'c7610000-0000-0000-0000-00000000000b'::uuid, p_desc) $$;
create function tests.contrib(p_family uuid, p_goal uuid, p_member uuid) returns void language sql as $$
  insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (p_family, p_goal, p_member, 'deposit', 1, private.today()) $$;
create function tests.contrib_a(p_goal uuid, p_key text) returns void language sql as $$
  select tests.contrib(tests.fid('A'), p_goal, current_setting('tests.mem_' || p_key)::uuid) $$;
create function tests.settle_a(p_from text, p_to text) returns void language sql as $$
  insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date)
  values (tests.fid('A'), current_setting('tests.mem_' || p_from)::uuid, current_setting('tests.mem_' || p_to)::uuid, 1, private.today()) $$;
grant execute on function tests.add_tx(uuid, uuid, uuid, text) to authenticated;
grant execute on function tests.tx_a(text) to authenticated;
grant execute on function tests.tx_b(text) to authenticated;
grant execute on function tests.contrib(uuid, uuid, uuid) to authenticated;
grant execute on function tests.contrib_a(uuid, text) to authenticated;
grant execute on function tests.settle_a(text, text) to authenticated;

-- dados de B para os testes de oráculo (inseridos antes de baixar qualquer teto)
select tests.login_as('b');
insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('B'), '90761000-0000-0000-0000-00000000000b', current_setting('tests.mem_b')::uuid, 'deposit', 1, private.today());
insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date)
  values (tests.fid('B'), current_setting('tests.mem_b')::uuid, current_setting('tests.mem_d')::uuid, 1, private.today());
select tests.logout();

-- CA-E9-02 · transactions, volume ativo --------------------------------------------------------------------------------------------
update private.volume_limits set max_active = 3, max_per_hour = 0 where kind = 'transactions';
select tests.login_as('a');
select lives_ok($$select tests.tx_a('t1')$$, 'CA-E9-02: 1º lançamento (volume 1 de 3)');
select lives_ok($$select tests.tx_a('t2')$$, 'CA-E9-02: 2º lançamento');
select lives_ok($$select tests.tx_a('t3')$$, 'CA-E9-02: 3º lançamento (no teto)');
select throws_ok($$select tests.tx_a('t4')$$, 'P0001', 'VOLUME_LIMIT_REACHED', 'CA-E9-02: 4º lançamento → VOLUME_LIMIT_REACHED');
select tests.login_as('ad');
select throws_ok($$select tests.tx_a('t4-ad')$$, 'P0001', 'VOLUME_LIMIT_REACHED', 'CA-E9-02: o volume é da família: outro integrante também é barrado');
select tests.login_as('a');
select is(tests.affected($$update public.transactions set deleted_at = now() where description = 't1'$$), 1, 'CA-E9-02: exclusão lógica do 1º');
select lives_ok($$select tests.tx_a('t4')$$, 'CA-E9-02: a exclusão lógica reabre a vaga de volume');
select throws_ok($$select tests.tx_a('t5')$$, 'P0001', 'VOLUME_LIMIT_REACHED', 'CA-E9-02: de novo no teto → VOLUME_LIMIT_REACHED');
select tests.logout();
select is((select count(*)::int from public.transactions where family_id = tests.fid('A')), 4,
  'CA-E9-02: a negação não gravou linha (3 ativos + 1 excluído)');

-- CA-E9-02 · transactions, frequência por usuário (excluídas contam) ------------------------------------------------------------------
update private.volume_limits set max_active = 1000, max_per_hour = 2 where kind = 'transactions';
select tests.login_as('ad');
select lives_ok($$select tests.tx_a('ad1')$$, 'CA-E9-02: ad, 1ª da hora');
select lives_ok($$select tests.tx_a('ad2')$$, 'CA-E9-02: ad, 2ª da hora (no teto)');
select throws_ok($$select tests.tx_a('ad3')$$, 'P0001', 'RATE_LIMITED', 'CA-E9-02: ad, 3ª da hora → RATE_LIMITED');
select is(tests.affected($$update public.transactions set deleted_at = now() where description = 'ad1'$$), 1, 'CA-E9-02: ad exclui uma das suas');
select throws_ok($$select tests.tx_a('ad3')$$, 'P0001', 'RATE_LIMITED',
  'CA-E9-02: a exclusão lógica NÃO reabre a frequência (excluídas contam na última hora)');
select tests.login_as('m');
select lives_ok($$select tests.tx_a('m1')$$, 'CA-E9-02: outro usuário da mesma família não é afetado pela frequência de ad');
select tests.login_as('a');
select throws_ok($$select tests.tx_a('a-extra')$$, 'P0001', 'RATE_LIMITED', 'CA-E9-02: a já criou 4 na hora (a exclusão do t1 conta) → RATE_LIMITED');
select tests.logout();

-- CA-E9-06 · série: conta no volume ativo, fica FORA da frequência; materialização exata com limite normal ------------------------------
-- (família B / usuário b; a série é monthly a partir de hoje: hoje e o mesmo dia do mês seguinte = 2 ocorrências, sempre)
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by)
  values ('e7610000-0000-0000-0000-0000000000b1', tests.fid('B'), 'expense', 'a7610000-0000-0000-0000-00000000000b',
          'c7610000-0000-0000-0000-00000000000b', 'Série B1', 10, 'monthly', private.today(), tests.uid('b'));
update private.volume_limits set max_active = 1000, max_per_hour = 1 where kind = 'transactions';
select tests.login_as('b');
select is((select public.materialize_recurrences()), 2, 'CA-E9-06: materialize_recurrences cria as 2 ocorrências mesmo com frequência 1/h (série fora da frequência)');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7610000-0000-0000-0000-0000000000b1'), 2,
  'CA-E9-06: as 2 ocorrências gravadas');
select ok((select last_failure_code is null from public.recurrences where id = 'e7610000-0000-0000-0000-0000000000b1'),
  'CA-E9-06: série sem falha registrada');
select lives_ok($$select tests.tx_b('b1')$$, 'CA-E9-06: as linhas de série não entram na frequência: o 1º lançamento manual de b passa');
select throws_ok($$select tests.tx_b('b2')$$, 'P0001', 'RATE_LIMITED', 'CA-E9-06: o 2º lançamento manual → RATE_LIMITED (teto 1/h)');
select tests.logout();
update private.volume_limits set max_active = 3, max_per_hour = 0 where kind = 'transactions';
select tests.login_as('b');
select throws_ok($$select tests.tx_b('b3')$$, 'P0001', 'VOLUME_LIMIT_REACHED',
  'CA-E9-06: as 2 ocorrências + 1 manual = 3 ativos → as linhas de série contam no volume');
select tests.logout();
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by)
  values ('e7610000-0000-0000-0000-0000000000b2', tests.fid('B'), 'expense', 'a7610000-0000-0000-0000-00000000000b',
          'c7610000-0000-0000-0000-00000000000b', 'Série B2', 10, 'weekly', private.today(), tests.uid('b'));
select tests.login_as('b');
select is((select public.materialize_recurrences()), 0, 'CA-E9-06: com a família no teto de volume a materialização não cria nada...');
select is((select last_failure_code from public.recurrences where id = 'e7610000-0000-0000-0000-0000000000b2'), 'VOLUME_LIMIT_REACHED',
  'CA-E9-06: ...e a série registra VOLUME_LIMIT_REACHED (a falha de uma série não derruba a chamada)');
select tests.logout();

-- CA-E9-03 · goal_contributions: meta, família e frequência -----------------------------------------------------------------------------
update private.volume_limits set max_active = 2, max_per_hour = 0 where kind = 'goal_contributions_goal';
update private.volume_limits set max_active = 100, max_per_hour = 0 where kind = 'goal_contributions_family';
select tests.login_as('a');
select lives_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000001', 'a')$$, 'CA-E9-03: aporte 1 na meta 1');
select lives_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000001', 'a')$$, 'CA-E9-03: aporte 2 na meta 1 (no teto da meta)');
select throws_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000001', 'a')$$, 'P0001', 'VOLUME_LIMIT_REACHED',
  'CA-E9-03: aporte 3 na meta 1 → VOLUME_LIMIT_REACHED (teto por meta)');
select lives_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000002', 'a')$$,
  'CA-E9-03: aporte em OUTRA meta não é afetado pelo teto da primeira');
select tests.logout();
update private.volume_limits set max_active = 100, max_per_hour = 0 where kind = 'goal_contributions_goal';
update private.volume_limits set max_active = 3, max_per_hour = 0 where kind = 'goal_contributions_family';
select tests.login_as('a');
select throws_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000002', 'a')$$, 'P0001', 'VOLUME_LIMIT_REACHED',
  'CA-E9-03: a família tem 3 ativos → VOLUME_LIMIT_REACHED (teto por família, meta sem teto próprio)');
select is(tests.affected($$update public.goal_contributions set deleted_at = now()
  where id = (select id from public.goal_contributions where goal_id = '90761000-0000-0000-0000-000000000002' limit 1)$$), 1,
  'CA-E9-03: exclusão lógica do aporte da meta 2');
select lives_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000002', 'a')$$, 'CA-E9-03: a exclusão reabre a vaga de volume da família');
select tests.logout();
update private.volume_limits set max_active = 100, max_per_hour = 2 where kind = 'goal_contributions_family';
select tests.login_as('ad');
select lives_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000002', 'ad')$$, 'CA-E9-03: ad, 1º aporte da hora');
select lives_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000002', 'ad')$$, 'CA-E9-03: ad, 2º aporte da hora');
select throws_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000002', 'ad')$$, 'P0001', 'RATE_LIMITED',
  'CA-E9-03: ad, 3º aporte → RATE_LIMITED (frequência por usuário)');
select is(tests.affected($$update public.goal_contributions set deleted_at = now()
  where id = (select id from public.goal_contributions where created_by = tests.uid('ad') limit 1)$$), 1, 'CA-E9-03: ad exclui um aporte seu');
select throws_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000002', 'ad')$$, 'P0001', 'RATE_LIMITED',
  'CA-E9-03: a exclusão lógica não reabre a frequência');
select tests.login_as('m');
select lives_ok($$select tests.contrib_a('90761000-0000-0000-0000-000000000002', 'm')$$, 'CA-E9-03: outro usuário da família não é afetado pela frequência de ad');
select tests.logout();

-- CA-E9-04 · settlements: família e frequência ------------------------------------------------------------------------------------------
update private.volume_limits set max_active = 2, max_per_hour = 0 where kind = 'settlements';
select tests.login_as('a');
select lives_ok($$select tests.settle_a('m', 'ad')$$, 'CA-E9-04: acerto 1');
select lives_ok($$select tests.settle_a('m', 'ad')$$, 'CA-E9-04: acerto 2 (no teto)');
select throws_ok($$select tests.settle_a('m', 'ad')$$, 'P0001', 'VOLUME_LIMIT_REACHED', 'CA-E9-04: acerto 3 → VOLUME_LIMIT_REACHED');
select is(tests.affected($$update public.settlements set deleted_at = now()
  where id = (select id from public.settlements where family_id = tests.fid('A') limit 1)$$), 1, 'CA-E9-04: exclusão lógica de um acerto');
select lives_ok($$select tests.settle_a('m', 'ad')$$, 'CA-E9-04: a exclusão reabre a vaga de volume');
select tests.logout();
update private.volume_limits set max_active = 100, max_per_hour = 2 where kind = 'settlements';
select tests.login_as('ad');
select lives_ok($$select tests.settle_a('ad', 'm')$$, 'CA-E9-04: ad, 1º acerto da hora');
select lives_ok($$select tests.settle_a('ad', 'm')$$, 'CA-E9-04: ad, 2º acerto da hora');
select throws_ok($$select tests.settle_a('ad', 'm')$$, 'P0001', 'RATE_LIMITED', 'CA-E9-04: ad, 3º acerto → RATE_LIMITED');
select is(tests.affected($$update public.settlements set deleted_at = now()
  where id = (select id from public.settlements where created_by = tests.uid('ad') limit 1)$$), 1, 'CA-E9-04: ad exclui um acerto seu');
select throws_ok($$select tests.settle_a('ad', 'm')$$, 'P0001', 'RATE_LIMITED', 'CA-E9-04: a exclusão lógica não reabre a frequência');
select tests.login_as('m');
select lives_ok($$select tests.settle_a('m', 'a')$$, 'CA-E9-04: outro usuário da família não é afetado pela frequência de ad');
select tests.logout();

-- CA-E9-05 · sem oráculo entre famílias -----------------------------------------------------------------------------------------------------
-- B está no teto em transactions (3 ativos), goal_contributions (1) e settlements (1). Um usuário de A que forja family_id = B
-- recebe a mesma resposta que receberia sem o teto (a RLS nega: 42501), nunca VOLUME_LIMIT_REACHED nem RATE_LIMITED.
update private.volume_limits set max_active = 3, max_per_hour = 1 where kind = 'transactions';
update private.volume_limits set max_active = 1, max_per_hour = 1 where kind = 'goal_contributions_goal';
update private.volume_limits set max_active = 1, max_per_hour = 1 where kind = 'goal_contributions_family';
update private.volume_limits set max_active = 1, max_per_hour = 1 where kind = 'settlements';
select tests.login_as('a');
select throws_ok($$select tests.add_tx(tests.fid('B'), 'a7610000-0000-0000-0000-00000000000b'::uuid, 'c7610000-0000-0000-0000-00000000000b'::uuid, 'forjado')$$,
  '42501', null, 'CA-E9-05: lançamento forjado em B (no teto) → 42501, não VOLUME_LIMIT_REACHED');
select throws_ok($$select tests.add_tx(gen_random_uuid(), 'a7610000-0000-0000-0000-00000000000b'::uuid, 'c7610000-0000-0000-0000-00000000000b'::uuid, 'forjado')$$,
  '42501', null, 'CA-E9-05: família inexistente → o mesmo 42501');
select throws_ok($$select tests.contrib(tests.fid('B'), '90761000-0000-0000-0000-00000000000b'::uuid, current_setting('tests.mem_b')::uuid)$$,
  '42501', null, 'CA-E9-05: aporte forjado em B (no teto) → 42501');
select throws_ok($$insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date)
  values (tests.fid('B'), current_setting('tests.mem_b')::uuid, current_setting('tests.mem_d')::uuid, 1, private.today())$$,
  '42501', null, 'CA-E9-05: acerto forjado em B (no teto) → 42501');
-- controle: quem é de B, com B no teto, recebe o erro de volume (o teto está de fato ativo)
select tests.login_as('b');
select throws_ok($$select tests.tx_b('ctrl')$$, 'P0001', 'VOLUME_LIMIT_REACHED', 'CA-E9-05: controle — o integrante de B é barrado pelo teto');
select throws_ok($$select tests.contrib(tests.fid('B'), '90761000-0000-0000-0000-00000000000b'::uuid, current_setting('tests.mem_b')::uuid)$$,
  'P0001', 'VOLUME_LIMIT_REACHED', 'CA-E9-05: controle — aporte do integrante de B é barrado pelo teto');
select tests.logout();

select * from finish();
rollback;
