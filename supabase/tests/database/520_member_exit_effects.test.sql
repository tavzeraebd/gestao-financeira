-- CA-E7-06 (AB-113): efeitos colaterais da saída e da remoção. Convites pendentes do alvo são revogados (com reason); convites de
-- outros, aceitos, já revogados e expirados ficam intactos; nada do que o alvo registrou é apagado ou reatribuído; o removido perde
-- o acesso; a série dele falha com RECURRENCE_AUTHOR_INACTIVE.
begin;

select no_plan();

select tests.setup_world();
select tests.create_user('x', 'Xavier Sem Familia');
create function tests.mem(p_key text) returns uuid language sql stable as $$
  select id from public.family_members where user_id = tests.uid(p_key)
  order by (status = 'active') desc, joined_at desc limit 1 $$;
grant execute on function tests.mem(text) to authenticated;
update public.family_members set joined_at = '2020-01-01' where user_id = tests.uid('a');
update public.family_members set joined_at = '2020-02-01' where user_id = tests.uid('ad');
update public.family_members set joined_at = '2020-03-01' where user_id = tests.uid('m');
-- d = segundo admin (sairá por leave_family)
insert into public.family_members (family_id, user_id, role, joined_at) values (tests.fid('A'), tests.uid('d'), 'admin', '2020-04-01');
select set_config('tests.mem_a', tests.mem('a')::text, true);
select set_config('tests.mem_ad', tests.mem('ad')::text, true);
select set_config('tests.mem_m', tests.mem('m')::text, true);
select set_config('tests.mem_d', tests.mem('d')::text, true);

-- convites: ad (p1, p2 pendentes; used aceito por c; rv revogado por ele; ex expirado), a (po pendente), d (l1 pendente)
select tests.stash_invite('p1', 'ad', 'member');
select tests.stash_invite('p2', 'ad', 'member');
select tests.stash_invite('used', 'ad', 'member');
select tests.stash_invite('rv', 'ad', 'member');
select tests.stash_invite('po', 'a', 'member');
select tests.stash_invite('l1', 'd', 'member');
select tests.login_as('c');
select public.accept_family_invite(tests.tok('used'));
select tests.login_as('ad');
select public.revoke_family_invite(tests.inv('rv'));
select tests.logout();
insert into public.family_invites (id, family_id, role, token_hash, created_by, expires_at, created_at)
  values ('e7520000-0000-0000-0000-0000000000e1', tests.fid('A'), 'member', md5('ex1') || md5('ex2'), tests.uid('ad'),
          now() - interval '3 days', now() - interval '10 days');

-- dados que o integrante registrou (devem sobreviver à saída)
insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a7520000-0000-0000-0000-000000000001', tests.fid('A'), 'Corrente', 'checking', 1000, '2020-01-01', tests.uid('a'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c7520000-0000-0000-0000-000000000001', tests.fid('A'), 'Mercado', 'expense', 'chart-1', 'utensils', tests.uid('a'));
insert into public.transactions (id, family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by) values
  ('f7520000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a7520000-0000-0000-0000-000000000001', 'c7520000-0000-0000-0000-000000000001',
   tests.mem('ad'), 'Despesa do ad', 100, private.today() - 3, 'paid', tests.uid('ad')),
  ('f7520000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a7520000-0000-0000-0000-000000000001', 'c7520000-0000-0000-0000-000000000001',
   tests.mem('ad'), 'Compromisso do ad', 50, private.today() + 10, 'pending', tests.uid('ad')),
  ('f7520000-0000-0000-0000-000000000003', tests.fid('A'), 'expense', 'a7520000-0000-0000-0000-000000000001', 'c7520000-0000-0000-0000-000000000001',
   tests.mem('a'), 'Despesa da dona', 20, private.today() - 2, 'paid', tests.uid('a'));
insert into public.expense_splits (family_id, transaction_id, member_id, amount, created_by) values
  (tests.fid('A'), 'f7520000-0000-0000-0000-000000000001', tests.mem('ad'), 50, tests.uid('ad')),
  (tests.fid('A'), 'f7520000-0000-0000-0000-000000000001', tests.mem('a'), 50, tests.uid('ad'));
insert into public.recurrences (id, family_id, type, account_id, category_id, description, amount, frequency, start_date, created_by) values
  ('e7520000-0000-0000-0000-0000000000a1', tests.fid('A'), 'expense', 'a7520000-0000-0000-0000-000000000001',
   'c7520000-0000-0000-0000-000000000001', 'Série do ad', 30, 'monthly', private.today(), tests.uid('ad'));
insert into public.goals (id, family_id, name, target_amount, created_by) values
  ('90752000-0000-0000-0000-000000000001', tests.fid('A'), 'Viagem', 5000, tests.uid('ad'));
select tests.login_as('a');
insert into public.goal_contributions (family_id, goal_id, member_id, kind, amount, contribution_date)
  values (tests.fid('A'), '90752000-0000-0000-0000-000000000001', tests.mem('ad'), 'deposit', 200, private.today() - 1);
select tests.logout();
insert into public.settlements (family_id, from_member_id, to_member_id, amount, settlement_date, created_by)
  values (tests.fid('A'), tests.mem('ad'), tests.mem('a'), 10, private.today() - 1, tests.uid('ad'));

-- fotografia do que existe antes (como dono do banco: sem RLS) e dos saldos/totais como a
select set_config('tests.counts_before', (select jsonb_build_object(
  'tx', (select count(*) from public.transactions), 'rec', (select count(*) from public.recurrences),
  'goals', (select count(*) from public.goals), 'contrib', (select count(*) from public.goal_contributions),
  'splits', (select count(*) from public.expense_splits), 'settle', (select count(*) from public.settlements),
  'tx_by_ad', (select count(*) from public.transactions where created_by = tests.uid('ad') and assigned_member_id = tests.mem('ad')),
  'splits_ad', (select count(*) from public.expense_splits where member_id = tests.mem('ad')))::text), true);
select tests.login_as('a');
select set_config('tests.snap_before', (select jsonb_build_object(
  'bal', (select jsonb_agg(to_jsonb(b) order by to_jsonb(b)::text) from public.account_balances() b),
  'ps', (select to_jsonb(p) from public.period_summary(private.today() - 30, private.today()) p),
  'bp', (select to_jsonb(p) from public.pending_summary() p),
  'mb', (select jsonb_agg(to_jsonb(p) order by to_jsonb(p)::text) from public.member_balances() p))::text), true);
select tests.logout();

-- remoção do ad pelo owner -----------------------------------------------------------------------------------------------------
select tests.login_as('a');
select lives_ok($$select public.remove_family_member(current_setting('tests.mem_ad')::uuid)$$, 'CA-E7-06: owner remove o admin ad');
select tests.logout();

select is((select count(*)::int from public.family_invites
            where id in (tests.inv('p1'), tests.inv('p2')) and revoked_at is not null and revoked_by = tests.uid('a')), 2,
  'CA-E7-06: os dois convites pendentes do ad foram revogados (revoked_by = quem removeu)');
select is((select count(*)::int from public.family_invites where id = tests.inv('po') and revoked_at is null and accepted_at is null), 1,
  'CA-E7-06: convite pendente de outro (owner) intacto');
select is((select count(*)::int from public.family_invites where id = tests.inv('l1') and revoked_at is null and accepted_at is null), 1,
  'CA-E7-06: convite pendente de outro (admin d) intacto');
select is((select count(*)::int from public.family_invites where id = tests.inv('used') and accepted_at is not null and revoked_at is null), 1,
  'CA-E7-06: convite já aceito intacto');
select is((select revoked_by from public.family_invites where id = tests.inv('rv')), tests.uid('ad'),
  'CA-E7-06: convite já revogado não foi revogado de novo (revoked_by continua o ad)');
select is((select count(*)::int from public.family_invites where id = 'e7520000-0000-0000-0000-0000000000e1' and revoked_at is null), 1,
  'CA-E7-06: convite expirado intacto');
select is((select count(*)::int from public.audit_events where action = 'invite.revoked' and metadata ->> 'reason' = 'member_ended'), 2,
  'CA-E7-06: um invite.revoked com reason member_ended por convite revogado');
select is((select metadata ->> 'revoked_invites' from public.audit_events where action = 'member.removed'), '2',
  'CA-E7-06: member.removed registra revoked_invites = 2');

select is((select jsonb_build_object(
  'tx', (select count(*) from public.transactions), 'rec', (select count(*) from public.recurrences),
  'goals', (select count(*) from public.goals), 'contrib', (select count(*) from public.goal_contributions),
  'splits', (select count(*) from public.expense_splits), 'settle', (select count(*) from public.settlements),
  'tx_by_ad', (select count(*) from public.transactions where created_by = tests.uid('ad') and assigned_member_id = tests.mem('ad')),
  'splits_ad', (select count(*) from public.expense_splits where member_id = tests.mem('ad')))),
  current_setting('tests.counts_before')::jsonb,
  'CA-E7-06: contagens de lançamentos, séries, metas, aportes, parcelas e acertos iguais; autoria e parcelas do ad preservadas');

select tests.login_as('a');
select is((select jsonb_build_object(
  'bal', (select jsonb_agg(to_jsonb(b) order by to_jsonb(b)::text) from public.account_balances() b),
  'ps', (select to_jsonb(p) from public.period_summary(private.today() - 30, private.today()) p),
  'bp', (select to_jsonb(p) from public.pending_summary() p),
  'mb', (select jsonb_agg(to_jsonb(p) order by to_jsonb(p)::text) from public.member_balances() p))),
  current_setting('tests.snap_before')::jsonb,
  'CA-E7-06: saldos, totais, pendentes e saldos entre integrantes iguais depois da remoção (R1 inalterado)');
select is((select count(*)::int from public.transactions where created_by = tests.uid('ad')), 2,
  'CA-E7-06: quem fica ainda lê os lançamentos do ex-integrante');
select is((select count(*)::int from public.goal_contributions) + (select count(*)::int from public.settlements)
  + (select count(*)::int from public.expense_splits), 4, 'CA-E7-06: aporte, acerto e parcelas legíveis pelos que ficam');

-- a série do ex-integrante falha na materialização seguinte
select is((select public.materialize_recurrences()), 0, 'CA-E7-06: a materialização não cria nada para a série do ex-integrante');
select is((select last_failure_code from public.recurrences where id = 'e7520000-0000-0000-0000-0000000000a1'), 'RECURRENCE_AUTHOR_INACTIVE',
  'CA-E7-06: série do ex-integrante falha com RECURRENCE_AUTHOR_INACTIVE');
select tests.logout();

-- o ex-integrante perdeu o acesso
select tests.login_as('ad');
select is((select count(*)::int from public.transactions) + (select count(*)::int from public.goals)
  + (select count(*)::int from public.family_members) + (select count(*)::int from public.audit_events), 0,
  'CA-E7-06: o ex-integrante lê 0 linhas da família');
select throws_ok($$select public.create_family_invite('member')$$, '42501', null, 'CA-E7-06: o ex-integrante não cria convite');
select is((select public.refresh_notifications()), 0, 'CA-E7-06: o ex-integrante não gera notificação (sem família → 0)');
select tests.logout();

select tests.login_as('x');
select throws_ok(format($$select public.accept_family_invite(%L)$$, tests.tok('p1')), 'P0001', 'INVITE_REVOKED',
  'CA-E7-06: o convite revogado devolve INVITE_REVOKED a quem tenta aceitar');
select tests.logout();

-- leave_family: d sai e leva junto o convite pendente dele ---------------------------------------------------------------------------
select tests.login_as('d');
select lives_ok($$select public.leave_family()$$, 'CA-E7-06: admin d sai da família');
select tests.logout();
select is((select count(*)::int from public.family_invites where id = tests.inv('l1') and revoked_at is not null and revoked_by = tests.uid('d')), 1,
  'CA-E7-06: o convite pendente do d foi revogado na saída');
select is((select metadata ->> 'reason' from public.audit_events where action = 'invite.revoked' and entity_id = tests.inv('l1')), 'member_ended',
  'CA-E7-06: invite.revoked da saída com reason member_ended');
select is((select metadata ->> 'revoked_invites' from public.audit_events where action = 'member.left'), '1',
  'CA-E7-06: member.left registra revoked_invites = 1');
select is((select count(*)::int from public.family_invites where id = tests.inv('po') and revoked_at is null), 1,
  'CA-E7-06: convite do owner continua pendente');

select * from finish();
rollback;
