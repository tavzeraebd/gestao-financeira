-- CA-E9-07 e CA-E9-08 (M1, ADR-0033 §6, SEC-28): refresh_notifications com intervalo mínimo de 30 s por usuário (gate atômico em
-- private.notification_refresh_state) e teto de notificações por usuário (private.volume_limits 'notifications_user', 500).
-- Dentro de uma transação de teste now() não avança, então: "dentro da janela" = a segunda chamada na mesma transação; "depois de 30 s"
-- é provado empurrando last_run_at para o passado (como dono do banco). A corrida real de duas sessões não cabe numa sessão pgTAP:
-- o upsert condicional + advisory lock é o desenho (ver o relatório); aqui prova-se o ramo "conflito sem atualização".
begin;

select no_plan();

select tests.setup_world();
-- c entra em A como member (será a "vítima" do financial_event em massa)
insert into public.family_members (family_id, user_id, role) values (tests.fid('A'), tests.uid('c'), 'member');
select set_config('tests.mem_c', (select id::text from public.family_members where user_id = tests.uid('c')), true);

insert into public.accounts (id, family_id, name, type, opening_balance, opening_balance_date, created_by) values
  ('a7620000-0000-0000-0000-00000000000a', tests.fid('A'), 'Corrente A', 'checking', 0, '2020-01-01', tests.uid('a')),
  ('a7620000-0000-0000-0000-00000000000b', tests.fid('B'), 'Corrente B', 'checking', 0, '2020-01-01', tests.uid('b'));
insert into public.categories (id, family_id, name, type, color, icon, created_by) values
  ('c7620000-0000-0000-0000-00000000000a', tests.fid('A'), 'Contas A', 'expense', 'chart-1', 'utensils', tests.uid('a')),
  ('c7620000-0000-0000-0000-00000000000b', tests.fid('B'), 'Contas B', 'expense', 'chart-1', 'utensils', tests.uid('b'));
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by) values
  ('f7620000-0000-0000-0000-000000000001', tests.fid('A'), 'expense', 'a7620000-0000-0000-0000-00000000000a',
   'c7620000-0000-0000-0000-00000000000a', 'Conta A1', 10, private.today() + 2, 'pending', tests.uid('a')),
  ('f7620000-0000-0000-0000-0000000000b1', tests.fid('B'), 'expense', 'a7620000-0000-0000-0000-00000000000b',
   'c7620000-0000-0000-0000-00000000000b', 'Conta B1', 10, private.today() + 2, 'pending', tests.uid('b'));

-- CA-E9-07 · intervalo mínimo de 30 s -----------------------------------------------------------------------------------------------
select tests.login_as('a');
select set_config('tests.n1', (select public.refresh_notifications())::text, true);
select cmp_ok(current_setting('tests.n1')::int, '>', 0, 'CA-E9-07: a primeira chamada gera (compromisso a vencer e novos integrantes)');
select tests.logout();
select is((select count(*)::int from private.notification_refresh_state where user_id = tests.uid('a')), 1,
  'CA-E9-07: a primeira chamada grava a janela do usuário');

-- dado novo qualificado depois da primeira chamada
insert into public.transactions (id, family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by) values
  ('f7620000-0000-0000-0000-000000000002', tests.fid('A'), 'expense', 'a7620000-0000-0000-0000-00000000000a',
   'c7620000-0000-0000-0000-00000000000a', 'Conta A2', 20, private.today() + 1, 'pending', tests.uid('a'));
select tests.login_as('a');
select is((select public.refresh_notifications()), 0, 'CA-E9-07: segunda chamada em menos de 30 s devolve 0...');
select is((select count(*)::int from public.notifications where entity_id = 'f7620000-0000-0000-0000-000000000002'), 0,
  'CA-E9-07: ...e NÃO gera mesmo com dado novo qualificado');
select tests.logout();

-- 29 s ainda bloqueia; 31 s libera
update private.notification_refresh_state set last_run_at = now() - interval '29 seconds' where user_id = tests.uid('a');
select tests.login_as('a');
select is((select public.refresh_notifications()), 0, 'CA-E9-07: 29 s depois ainda está dentro da janela');
select tests.logout();
select ok((select last_run_at = now() - interval '29 seconds' from private.notification_refresh_state where user_id = tests.uid('a')),
  'CA-E9-07: a chamada bloqueada não renova a janela');
update private.notification_refresh_state set last_run_at = now() - interval '31 seconds' where user_id = tests.uid('a');
select tests.login_as('a');
select is((select public.refresh_notifications()), 1, 'CA-E9-07: 31 s depois gera (o compromisso novo)');
select tests.logout();
select ok((select last_run_at = now() from private.notification_refresh_state where user_id = tests.uid('a')),
  'CA-E9-07: a geração renova a janela');

-- a limpeza roda também dentro da janela: o compromisso cancelado some na chamada seguinte (CA-E7-54)
select tests.login_as('a');
select is((select count(*)::int from public.notifications where entity_id = 'f7620000-0000-0000-0000-000000000002'), 1,
  'CA-E9-07: a notificação do compromisso A2 existe');
select lives_ok($$select public.cancel_pending_transaction('f7620000-0000-0000-0000-000000000002')$$, 'CA-E9-07: A2 é cancelado');
select is((select public.refresh_notifications()), 0, 'CA-E9-07: dentro da janela a geração é pulada...');
select is((select count(*)::int from public.notifications where entity_id = 'f7620000-0000-0000-0000-000000000002'), 0,
  'CA-E9-07: ...mas a limpeza aconteceu (notificação de compromisso resolvido removida)');

-- outro usuário não é limitado pela janela de a
select tests.login_as('b');
select is((select public.refresh_notifications()), 1, 'CA-E9-07: b (outra família) gera normalmente logo depois de a');
select tests.logout();
select is((select count(*)::int from private.notification_refresh_state), 2, 'CA-E9-07: uma linha de janela por usuário que chamou (a e b)');

-- CA-E9-08 · teto de notificações por usuário ---------------------------------------------------------------------------------------------
-- ad: 500 existentes → a geração insere 0 (apesar de haver compromissos qualificados)
insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
select tests.fid('A'), tests.uid('ad'), 'member_joined', 'family_member', gen_random_uuid(), 'member_joined:' || gen_random_uuid()::text
from generate_series(1, 500);
-- m: 497 existentes e 5 compromissos próprios a vencer → insere exatamente 3
insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
select tests.fid('A'), tests.uid('m'), 'member_joined', 'family_member', gen_random_uuid(), 'member_joined:' || gen_random_uuid()::text
from generate_series(1, 497);
insert into public.transactions (family_id, type, account_id, category_id, description, amount, transaction_date, status, created_by)
select tests.fid('A'), 'expense', 'a7620000-0000-0000-0000-00000000000a', 'c7620000-0000-0000-0000-00000000000a',
       'Conta do m ' || g, 1, private.today() + 1, 'pending', tests.uid('m')
from generate_series(1, 5) g;

select tests.login_as('ad');
select is((select public.refresh_notifications()), 0, 'CA-E9-08: com 500 existentes a geração insere 0');
select is((select count(*)::int from public.notifications), 500, 'CA-E9-08: ad continua com 500');
select tests.logout();
insert into public.notifications (family_id, user_id, type, entity_type, entity_id, dedupe_key)
select tests.fid('A'), tests.uid('ad'), 'member_joined', 'family_member', gen_random_uuid(), 'member_joined:' || gen_random_uuid()::text
from generate_series(1, 30);
select tests.reset_refresh_gate('ad');
select is((select public.refresh_notifications()), 0, 'CA-E9-08: acima do teto (530 existentes) o saldo nunca fica negativo: insere 0...');
select is((select count(*)::int from public.notifications), 530, 'CA-E9-08: ...e o teto não apaga nada');

select tests.login_as('m');
select is((select public.refresh_notifications()), 3, 'CA-E9-08: com 497 existentes insere no máximo 3 (havia mais candidatos)');
select is((select count(*)::int from public.notifications), 500, 'CA-E9-08: m termina em 500');
select tests.reset_refresh_gate('m');
select is((select public.refresh_notifications()), 0, 'CA-E9-08: a chamada seguinte (janela zerada) insere 0');
select is((select count(*)::int from public.notifications), 500, 'CA-E9-08: m segue em 500');

-- o teto é por usuário: a família e os outros integrantes não são afetados
select tests.reset_refresh_gate('a');
select cmp_ok((select public.refresh_notifications()), '>', 0, 'CA-E9-08: a (mesma família, sem notificações dos compromissos do m) ainda gera');

-- financial_event em massa: 600 lançamentos de outra pessoa com c como responsável → c para em 500
select tests.logout();
insert into public.transactions (family_id, type, account_id, category_id, assigned_member_id, description, amount, transaction_date, status, created_by)
select tests.fid('A'), 'expense', 'a7620000-0000-0000-0000-00000000000a', 'c7620000-0000-0000-0000-00000000000a',
       current_setting('tests.mem_c')::uuid, 'Evento ' || g, 1, private.today(), 'paid', tests.uid('a')
from generate_series(1, 600) g;
select tests.login_as('c');
select is((select public.refresh_notifications()), 100, 'CA-E9-08: c, 1ª chamada: 100 (teto por chamada continua)');
select tests.reset_refresh_gate('c');
select is((select public.refresh_notifications()), 100, 'CA-E9-08: c, 2ª chamada: 100');
select tests.reset_refresh_gate('c');
select is((select public.refresh_notifications()), 100, 'CA-E9-08: c, 3ª chamada: 100');
select tests.reset_refresh_gate('c');
select is((select public.refresh_notifications()), 100, 'CA-E9-08: c, 4ª chamada: 100');
select tests.reset_refresh_gate('c');
select is((select public.refresh_notifications()), 100, 'CA-E9-08: c, 5ª chamada: 100 (500 no total)');
select tests.reset_refresh_gate('c');
select is((select public.refresh_notifications()), 0, 'CA-E9-08: c, 6ª chamada: 0 — o financial_event em massa para em 500');
select is((select count(*)::int from public.notifications), 500, 'CA-E9-08: c termina com exatamente 500');
select tests.logout();

select * from finish();
rollback;
