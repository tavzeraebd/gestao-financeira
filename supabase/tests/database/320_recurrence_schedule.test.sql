-- CA-E5-08 · R5 e D12: agenda pura (private.recurrence_occurrence / recurrence_next_on_or_after / recurrence_first_index).
begin;

select plan(35);

select tests.setup_world();

-- propriedades da função
select is((select provolatile::text from pg_proc where oid = 'private.recurrence_occurrence(date,text,smallint,integer)'::regprocedure), 'i',
  'CA-E5-08: recurrence_occurrence é immutable');
select is((select provolatile::text from pg_proc where oid = 'private.recurrence_next_on_or_after(date,text,smallint,date)'::regprocedure), 'i',
  'CA-E5-08: recurrence_next_on_or_after é immutable');
select ok((select p.proconfig @> array['search_path=""'] and not p.prosecdef from pg_proc p where p.oid = 'private.recurrence_occurrence(date,text,smallint,integer)'::regprocedure),
  'CA-E5-08: search_path vazio e security invoker');

-- R5 · mensal a partir de 31/01/2027
select is(private.recurrence_occurrence('2027-01-31', 'monthly', 1::smallint, 0), date '2027-01-31', 'R5: n=0 → 31/01/2027');
select is(private.recurrence_occurrence('2027-01-31', 'monthly', 1::smallint, 1), date '2027-02-28', 'R5: n=1 → 28/02/2027');
select is(private.recurrence_occurrence('2027-01-31', 'monthly', 1::smallint, 2), date '2027-03-31', 'R5: n=2 → 31/03/2027 (volta ao dia âncora, sem deriva)');
select is(private.recurrence_occurrence('2027-01-31', 'monthly', 1::smallint, 3), date '2027-04-30', 'R5: n=3 → 30/04/2027');
select is(private.recurrence_occurrence('2027-01-31', 'monthly', 1::smallint, 12), date '2028-01-31', 'R5: n=12 → 31/01/2028');
select is(private.recurrence_occurrence('2027-01-31', 'monthly', 1::smallint, 13), date '2028-02-29', 'R5: ano bissexto → 29/02/2028');
select is(private.recurrence_occurrence('2028-01-31', 'monthly', 1::smallint, 1), date '2028-02-29', 'R5: a partir de 31/01/2028 → 29/02/2028');
select is(private.recurrence_occurrence('2027-01-10', 'monthly', 3::smallint, 1), date '2027-04-10', 'intervalo 3 meses, dia 10');
select is(private.recurrence_occurrence('2027-01-30', 'monthly', 1::smallint, 1), date '2027-02-28', 'dia 30 em fevereiro → 28');

-- anual
select is(private.recurrence_occurrence('2028-02-29', 'yearly', 1::smallint, 0), date '2028-02-29', 'anual: n=0');
select is(private.recurrence_occurrence('2028-02-29', 'yearly', 1::smallint, 1), date '2029-02-28', 'anual: 29/02/2028 → 28/02/2029');
select is(private.recurrence_occurrence('2028-02-29', 'yearly', 1::smallint, 2), date '2030-02-28', 'anual: → 28/02/2030');
select is(private.recurrence_occurrence('2028-02-29', 'yearly', 1::smallint, 4), date '2032-02-29', 'anual: volta a 29/02/2032');

-- semanal
select is(private.recurrence_occurrence('2027-01-01', 'weekly', 2::smallint, 1), date '2027-01-15', 'semanal intervalo 2 → +14 dias');
select is(private.recurrence_occurrence('2027-01-01', 'weekly', 1::smallint, 3), date '2027-01-22', 'semanal intervalo 1, n=3 → +21 dias');

-- recurrence_next_on_or_after: antes, no dia e depois de uma ocorrência
select is(private.recurrence_next_on_or_after('2027-01-31', 'monthly', 1::smallint, '2026-12-01'), date '2027-01-31', 'antes do início → início');
select is(private.recurrence_next_on_or_after('2027-01-31', 'monthly', 1::smallint, '2027-01-31'), date '2027-01-31', 'no dia da ocorrência → ela mesma');
select is(private.recurrence_next_on_or_after('2027-01-31', 'monthly', 1::smallint, '2027-02-01'), date '2027-02-28', 'depois de uma ocorrência → a próxima (28/02)');
select is(private.recurrence_next_on_or_after('2027-01-31', 'monthly', 1::smallint, '2027-02-27'), date '2027-02-28', 'um dia antes da ocorrência curta → ela');
select is(private.recurrence_next_on_or_after('2027-01-31', 'monthly', 1::smallint, '2027-02-28'), date '2027-02-28', 'no dia da ocorrência curta → ela mesma');
select is(private.recurrence_next_on_or_after('2027-01-31', 'monthly', 1::smallint, '2027-03-01'), date '2027-03-31', 'dia seguinte à curta → 31/03');
select is(private.recurrence_next_on_or_after('2027-01-31', 'monthly', 1::smallint, '2030-06-15'), date '2030-06-30', 'data distante → 30/06/2030');
select is(private.recurrence_next_on_or_after('2027-01-10', 'monthly', 3::smallint, '2027-02-01'), date '2027-04-10', 'intervalo 3 → próximo trimestre');
select is(private.recurrence_next_on_or_after('2027-01-01', 'weekly', 1::smallint, '2027-01-02'), date '2027-01-08', 'semanal: depois da ocorrência');
select is(private.recurrence_next_on_or_after('2027-01-01', 'weekly', 2::smallint, '2027-01-10'), date '2027-01-15', 'semanal intervalo 2');
select is(private.recurrence_next_on_or_after('2028-02-29', 'yearly', 1::smallint, '2029-01-01'), date '2029-02-28', 'anual: 29/02 em ano comum → 28/02');
select is(private.recurrence_next_on_or_after('2028-02-29', 'yearly', 1::smallint, '2029-03-01'), date '2030-02-28', 'anual: depois de 28/02/2029 → 28/02/2030');

-- propriedade: para toda ocorrência n, next_on_or_after(occ(n)) = occ(n) e next_on_or_after(occ(n) + 1) = occ(n+1)
select is((select count(*)::int from generate_series(0, 60) n
  where private.recurrence_next_on_or_after('2027-01-31', 'monthly', 1::smallint, private.recurrence_occurrence('2027-01-31', 'monthly', 1::smallint, n))
          <> private.recurrence_occurrence('2027-01-31', 'monthly', 1::smallint, n)
     or private.recurrence_next_on_or_after('2027-01-31', 'monthly', 1::smallint, private.recurrence_occurrence('2027-01-31', 'monthly', 1::smallint, n) + 1)
          <> private.recurrence_occurrence('2027-01-31', 'monthly', 1::smallint, n + 1)), 0,
  'propriedade: mensal dia 31 consistente por 61 ocorrências');
select is((select count(*)::int from generate_series(0, 60) n
  where private.recurrence_next_on_or_after('2027-03-29', 'monthly', 5::smallint, private.recurrence_occurrence('2027-03-29', 'monthly', 5::smallint, n) + 1)
          <> private.recurrence_occurrence('2027-03-29', 'monthly', 5::smallint, n + 1)), 0,
  'propriedade: mensal a cada 5 meses consistente');
select is((select count(*)::int from generate_series(0, 60) n
  where private.recurrence_next_on_or_after('2028-02-29', 'yearly', 3::smallint, private.recurrence_occurrence('2028-02-29', 'yearly', 3::smallint, n) + 1)
          <> private.recurrence_occurrence('2028-02-29', 'yearly', 3::smallint, n + 1)), 0,
  'propriedade: anual a cada 3 anos consistente');
select is((select count(*)::int from generate_series(0, 60) n
  where private.recurrence_next_on_or_after('2027-01-01', 'weekly', 3::smallint, private.recurrence_occurrence('2027-01-01', 'weekly', 3::smallint, n) + 1)
          <> private.recurrence_occurrence('2027-01-01', 'weekly', 3::smallint, n + 1)), 0,
  'propriedade: semanal a cada 3 semanas consistente');

-- authenticated executa (os triggers de recurrences são security invoker)
select tests.login_as('a');
select is(private.recurrence_next_on_or_after('2027-01-31', 'monthly', 1::smallint, '2027-02-01'), date '2027-02-28', 'authenticated executa a agenda');

select * from finish();
rollback;
