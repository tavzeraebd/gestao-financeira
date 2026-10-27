-- CA-E5-09 (materialização), CA-E5-10 (falha isolada por série), CA-E5-11 (ocorrência editada/cancelada) e a chave
-- (recurrence_id, occurrence_date). Datas relativas a private.today(); horizonte = último dia do mês seguinte.
-- Duas chamadas realmente concorrentes não cabem numa sessão: a idempotência é provada por chamadas repetidas com o
-- ponteiro recuado (on conflict do nothing) e a exclusão mútua por FOR UPDATE SKIP LOCKED fica a cargo do desenho da RPC.
-- INTERNAL_ERROR (erro sem código) não é provocável sem alterar a estrutura; fica sem cobertura aqui (ver relatório).
begin;

select plan(54);

select tests.setup_world();

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a7000000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 0, '2020-01-01', tests.uid('a')),
  ('a7000000-0000-0000-0000-000000000002', tests.fid('A'), 'Conta F1', 'cash', 0, '2020-01-01', tests.uid('a')),
  ('a7000000-0000-0000-0000-000000000003', tests.fid('A'), 'Conta F1b', 'cash', 0, '2020-01-01', tests.uid('a')),
  ('a7000000-0000-0000-0000-000000000004', tests.fid('B'), 'Conta B', 'checking', 0, '2020-01-01', tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c7000000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c7000000-0000-0000-0000-000000000002', tests.fid('A'), 'Transporte', 'expense', 'chart-2', 'car', tests.uid('a')),
  ('c7000000-0000-0000-0000-000000000003', tests.fid('B'), 'Mercado B', 'expense', 'chart-1', 'utensils', tests.uid('b'));
select set_config('tests.mem_m', (select id::text from public.family_members where user_id = tests.uid('m')), true);

insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('e7000000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001',
   'c7000000-0000-0000-0000-000000000001', 'Aluguel', 100, 'monthly', private.today(), tests.uid('a')),
  ('e7000000-0000-0000-0000-0000000000b1', tests.fid('B'), 'expense', 'a7000000-0000-0000-0000-000000000004',
   'c7000000-0000-0000-0000-000000000003', 'Série de B', 70, 'monthly', private.today() + 400, tests.uid('b'));

-- CA-E5-09 · primeira materialização (só S1 pendente de materializar) -------------------------------------------------------------
select tests.login_as('a');
select is((select public.materialize_recurrences()), 2, 'CA-E5-09: cria as ocorrências até o fim do mês seguinte (hoje e o mês que vem)');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001' and status = 'pending'), 2,
  'CA-E5-09: ambas pending');
select is((select count(*)::int from public.transactions t join public.recurrences r on r.id = t.recurrence_id
            where r.id = 'e7000000-0000-0000-0000-000000000001' and t.created_by = r.created_by and t.type = r.type
              and t.account_id = r.account_id and t.category_id = r.category_id and t.amount = r.amount and t.description = r.description
              and t.due_date = t.transaction_date and t.occurrence_date = t.transaction_date and t.deleted_at is null), 2,
  'CA-E5-09: campos copiados da série, due_date = transaction_date = occurrence_date');
select ok((select min(transaction_date) = private.today()
             and max(transaction_date) <= (date_trunc('month', private.today()::timestamp) + interval '2 months' - interval '1 day')::date
           from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001'),
  'CA-E5-09: de hoje até o último dia do mês seguinte, nada além do horizonte');
select is((select next_occurrence_date from public.recurrences where id = 'e7000000-0000-0000-0000-000000000001'),
  private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 2), 'CA-E5-09: ponteiro = primeira data não materializada');
select is((select public.materialize_recurrences()), 0, 'CA-E5-09: segunda chamada devolve 0');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001'), 2,
  'CA-E5-09: contagem não muda na segunda chamada');

-- mais séries: autor member, catch-up (semanal iniciada há 30 dias) e término curto
select tests.logout();
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, end_date, created_by) values
  ('e7000000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001',
   'c7000000-0000-0000-0000-000000000001', 'Do membro', 40, 'monthly', private.today(), null, tests.uid('m')),
  ('e7000000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001',
   'c7000000-0000-0000-0000-000000000001', 'Semanal atrasada', 10, 'weekly', private.today() - 30, null, tests.uid('a')),
  ('e7000000-0000-0000-0000-000000000004', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001',
   'c7000000-0000-0000-0000-000000000001', 'Com término', 20, 'monthly', private.today(), private.today() + 10, tests.uid('a'));
select tests.login_as('ad');
select is((select public.materialize_recurrences()),
  2 + (((date_trunc('month', private.today()::timestamp) + interval '2 months' - interval '1 day')::date - (private.today() - 30)) / 7 + 1) + 1,
  'CA-E5-09: admin chama; cria 2 (membro) + semanal em catch-up desde hoje-30 + 1 (término curto)');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000002' and created_by = tests.uid('m')), 2,
  'CA-E5-09: created_by = autor da série mesmo quando outro integrante chama');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000003'),
  (((date_trunc('month', private.today()::timestamp) + interval '2 months' - interval '1 day')::date - (private.today() - 30)) / 7 + 1),
  'CA-E5-09: catch-up cria os atrasados e o futuro até o horizonte');
select is((select min(transaction_date) from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000003'), private.today() - 30,
  'CA-E5-09: o catch-up começa em start_date');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000004'), 1,
  'CA-E5-09: respeita end_date (só a ocorrência de hoje)');
select is((select public.materialize_recurrences()), 0, 'CA-E5-09: depois do término e do horizonte, nada a criar');

-- ponteiro recuado: as datas existentes são puladas (on conflict do nothing)
select tests.logout();
update public.recurrences set next_occurrence_date = start_date where id = 'e7000000-0000-0000-0000-000000000001';
select tests.login_as('a');
select is((select public.materialize_recurrences()), 0, 'CA-E5-09: ponteiro recuado sobre datas existentes → 0 criadas');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001'), 2, 'CA-E5-09: sem duplicar');
select is((select next_occurrence_date from public.recurrences where id = 'e7000000-0000-0000-0000-000000000001'),
  private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 2), 'CA-E5-09: ponteiro volta para a primeira data não materializada');
select tests.logout();
delete from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001' and occurrence_date = private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 1);
update public.recurrences set next_occurrence_date = start_date where id = 'e7000000-0000-0000-0000-000000000001';
select tests.login_as('a');
select is((select public.materialize_recurrences()), 1, 'CA-E5-09: catch-up recria só a ocorrência que faltava');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001'), 2, 'CA-E5-09: volta a 2 ocorrências');

-- CA-E5-11 · ocorrência editada ou cancelada não é recriada nem alterada -----------------------------------------------------------------
select tests.login_as('a');
update public.transactions set amount = 999 where recurrence_id = 'e7000000-0000-0000-0000-000000000001' and occurrence_date = private.today();
update public.transactions set transaction_date = transaction_date + 1
  where recurrence_id = 'e7000000-0000-0000-0000-000000000001' and occurrence_date = private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 1);
select is((select occurrence_date from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001' and transaction_date = private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 1) + 1),
  private.recurrence_occurrence(private.today(), 'monthly', 1::smallint, 1), 'CA-E5-11: occurrence_date não muda quando a data da ocorrência é editada');
select throws_ok($$update public.transactions set occurrence_date = private.today() + 1 where recurrence_id = 'e7000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'CA-E5-11: occurrence_date não é atualizável');
select tests.logout();
update public.recurrences set next_occurrence_date = start_date where id = 'e7000000-0000-0000-0000-000000000001';
select tests.login_as('a');
select is((select public.materialize_recurrences()), 0, 'CA-E5-11: materialização seguinte não recria a editada');
select is((select amount from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001' and occurrence_date = private.today()), 999.00,
  'CA-E5-11: valor editado preservado');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001'), 2, 'CA-E5-11: nenhuma linha a mais');
select lives_ok($$select public.cancel_pending_transaction(id) from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001' and occurrence_date = private.today()$$,
  'CA-E5-11: cancela uma ocorrência');
select tests.logout();
update public.recurrences set next_occurrence_date = start_date where id = 'e7000000-0000-0000-0000-000000000001';
select tests.login_as('a');
select is((select public.materialize_recurrences()), 0, 'CA-E5-11: materialização seguinte não recria a cancelada');
select is((select status from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001' and occurrence_date = private.today()), 'canceled',
  'CA-E5-11: a cancelada continua cancelada');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000001'), 2, 'CA-E5-11: continua 2 linhas');

-- chave (recurrence_id, occurrence_date) e forma ----------------------------------------------------------------------------------------------
select tests.logout();
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, recurrence_id, occurrence_date, created_by)
  values (tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'Duplicada', 1, private.today(), 'pending',
          'e7000000-0000-0000-0000-000000000001', private.today(), tests.uid('a'))$$,
  '23505', null, 'chave única (recurrence_id, occurrence_date) barra a duplicata');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, recurrence_id, created_by)
  values (tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'Sem data', 1, private.today(), 'pending',
          'e7000000-0000-0000-0000-000000000001', tests.uid('a'))$$,
  '23514', null, 'recurrence_id sem occurrence_date → 23514');
select throws_ok($$insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, recurrence_id, occurrence_date, created_by)
  values (tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'Série de B', 1, private.today(), 'pending',
          'e7000000-0000-0000-0000-0000000000b1', private.today(), tests.uid('a'))$$,
  '23503', null, 'recurrence_id de outra família → 23503 (FK composta)');
select throws_ok($$delete from public.recurrences where id = 'e7000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'série com ocorrências não pode ser excluída (on delete restrict)');

-- CA-E5-10 · falha isolada por série ---------------------------------------------------------------------------------------------------------
insert into public.recurrences (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, frequency, start_date, created_by) values
  ('e7000000-0000-0000-0000-000000000011', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000001', null, 'F1 conta arquivada', 10, 'monthly', private.today(), tests.uid('a')),
  ('e7000000-0000-0000-0000-000000000012', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000001', null, 'F1b', 10, 'monthly', private.today(), tests.uid('a')),
  ('e7000000-0000-0000-0000-000000000013', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', null, 'G saudável', 10, 'monthly', private.today(), tests.uid('a')),
  ('e7000000-0000-0000-0000-000000000014', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', current_setting('tests.mem_m')::uuid, 'H1 responsável', 10, 'monthly', private.today(), tests.uid('a')),
  ('e7000000-0000-0000-0000-000000000015', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', null, 'AU1 autor', 10, 'monthly', private.today(), tests.uid('ad')),
  ('e7000000-0000-0000-0000-000000000016', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000002', null, 'C1', 10, 'monthly', private.today(), tests.uid('a'));
update public.accounts set is_active = false where id in ('a7000000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000003');
update public.family_members set status = 'removed', ended_at = now() where user_id in (tests.uid('m'), tests.uid('ad'));
update public.categories set archived_at = now() where id = 'c7000000-0000-0000-0000-000000000002';
select tests.login_as('a');
select is((select public.materialize_recurrences()), 2, 'CA-E5-10: as séries saudáveis são materializadas (só G; as outras cinco falham)');
select results_eq($$select description, last_failure_code from public.recurrences where last_failure_code is not null order by description$$,
  $$values ('AU1 autor'::text, 'RECURRENCE_AUTHOR_INACTIVE'::text), ('C1'::text, 'CATEGORY_ARCHIVED'::text),
           ('F1 conta arquivada'::text, 'ACCOUNT_ARCHIVED'::text), ('F1b'::text, 'ACCOUNT_ARCHIVED'::text),
           ('H1 responsável'::text, 'INVALID_INPUT'::text)$$,
  'CA-E5-10: cada série guarda o seu código de falha');
select is((select count(*)::int from public.recurrences where last_failure_code is not null and last_failure_at is not null), 5, 'CA-E5-10: last_failure_at registrado');
select is((select count(*)::int from public.transactions where recurrence_id in
  ('e7000000-0000-0000-0000-000000000011', 'e7000000-0000-0000-0000-000000000012', 'e7000000-0000-0000-0000-000000000014',
   'e7000000-0000-0000-0000-000000000015', 'e7000000-0000-0000-0000-000000000016')), 0, 'CA-E5-10: a falha desfaz as inserções parciais da série');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000013'), 2, 'CA-E5-10: a série saudável tem as suas ocorrências');
select ok((select last_failure_code is null and last_failure_at is null from public.recurrences where id = 'e7000000-0000-0000-0000-000000000013'),
  'CA-E5-10: a saudável não tem falha');
select is((select next_occurrence_date from public.recurrences where id = 'e7000000-0000-0000-0000-000000000011'), private.today(),
  'CA-E5-10: a série que falhou não avança o ponteiro');

-- conta: trocar a conta limpa a falha e a chamada seguinte materializa
select lives_ok($$update public.recurrences set account_id = 'a7000000-0000-0000-0000-000000000001' where id = 'e7000000-0000-0000-0000-000000000011'$$,
  'CA-E5-10: owner troca a conta da série');
select ok((select last_failure_code is null and last_failure_at is null from public.recurrences where id = 'e7000000-0000-0000-0000-000000000011'),
  'CA-E5-10: editar a série limpa a falha');
select is((select public.materialize_recurrences()), 2, 'CA-E5-10: a chamada seguinte materializa a série corrigida');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000011'), 2, 'CA-E5-10: ocorrências criadas');
-- conta reativada sem editar a série: a materialização limpa a falha sozinha
select tests.logout();
update public.accounts set is_active = true where id = 'a7000000-0000-0000-0000-000000000003';
-- (backoff de 1 hora: a falha registrada precisa ter envelhecido para a série ser tentada de novo)
update public.recurrences set last_failure_at = now() - interval '2 hours' where id = 'e7000000-0000-0000-0000-000000000012';
select tests.login_as('a');
select is((select public.materialize_recurrences()), 2, 'CA-E5-10: conta reativada → a série F1b é materializada');
select ok((select last_failure_code is null and last_failure_at is null from public.recurrences where id = 'e7000000-0000-0000-0000-000000000012'),
  'CA-E5-10: a materialização limpa a falha ao ter sucesso');
-- responsável inativo: remover o responsável da série e materializar
select lives_ok($$update public.recurrences set assigned_member_id = null where id = 'e7000000-0000-0000-0000-000000000014'$$, 'CA-E5-10: owner remove o responsável inativo da série');
select is((select public.materialize_recurrences()), 2, 'CA-E5-10: série com responsável corrigido é materializada');
select ok((select last_failure_code is null from public.recurrences where id = 'e7000000-0000-0000-0000-000000000014'), 'CA-E5-10: falha do responsável limpa');
-- autor sem vínculo e categoria arquivada seguem registrados (corrigir exige outra ação do usuário)
select results_eq($$select description, last_failure_code from public.recurrences where last_failure_code is not null order by description$$,
  $$values ('AU1 autor'::text, 'RECURRENCE_AUTHOR_INACTIVE'::text), ('C1'::text, 'CATEGORY_ARCHIVED'::text)$$,
  'CA-E5-10: autor inativo e categoria arquivada continuam em falha, sem derrubar as demais');
-- limpar a falha de RECURRENCE_AUTHOR_INACTIVE também por edição, e reativar de verdade exige novo autor (fora do escopo)

-- tetos: 60 por série e 500 por chamada --------------------------------------------------------------------------------------------------------
select tests.logout();
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('e7000000-0000-0000-0000-000000000021', tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001',
   'c7000000-0000-0000-0000-000000000001', 'Teto por série', 1, 'weekly', private.today(), tests.uid('a'));
-- início antigo só por fixture (a regra de 12 meses vale na criação): reposiciona como postgres
update public.recurrences set start_date = date '2020-01-06', next_occurrence_date = date '2020-01-06' where id = 'e7000000-0000-0000-0000-000000000021';
select tests.login_as('a');
select is((select public.materialize_recurrences()), 60, 'CA-E5-09: teto de 60 ocorrências por série em uma chamada');
select is((select count(*)::int from public.transactions where recurrence_id = 'e7000000-0000-0000-0000-000000000021'), 60, 'CA-E5-09: 60 linhas da série');
select is((select next_occurrence_date from public.recurrences where id = 'e7000000-0000-0000-0000-000000000021'),
  private.recurrence_occurrence(date '2020-01-06', 'weekly', 1::smallint, 60), 'CA-E5-09: ponteiro na 61ª data');
select is((select public.materialize_recurrences()), 60, 'CA-E5-09: a chamada seguinte entrega mais 60');
select tests.logout();
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by)
select ('e7000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, tests.fid('A'), 'expense', 'a7000000-0000-0000-0000-000000000001',
       'c7000000-0000-0000-0000-000000000001', 'Teto por chamada ' || n, 1, 'weekly', private.today(), tests.uid('a')
from generate_series(1, 9) n;
update public.recurrences set start_date = date '2020-01-06', next_occurrence_date = date '2020-01-06' where description like 'Teto por chamada %';
select tests.login_as('a');
select is((select public.materialize_recurrences()), 500, 'CA-E5-09: teto de 500 inserções por chamada');
select cmp_ok((select public.materialize_recurrences()), '>', 0, 'CA-E5-09: o restante entra nas chamadas seguintes');

select * from finish();
rollback;
