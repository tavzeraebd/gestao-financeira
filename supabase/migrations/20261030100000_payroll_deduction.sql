-- Recorrência de despesa "desconto em folha" (payroll_deduction). Decisão do usuário: o salário é lançado LÍQUIDO e o
-- empréstimo é descontado em folha. A série marcada (a) conta no comprometimento futuro (leitura de recurrences pelo
-- frontend), (b) NUNCA vira transação/conta a pagar e portanto não debita saldo, (c) acaba sozinha em end_date.
-- Erros: P0001 com mensagem = código; 42501 = FORBIDDEN.
--
-- Mudanças:
--   1. recurrences.payroll_deduction boolean not null default false + check (só type = 'expense'); grants de coluna.
--   2. recurrences_before_write(): corpo de 20261024101100 + (a) desmarcar reposiciona o ponteiro da agenda,
--      (b) mudar payroll_deduction limpa a falha registrada.
--   3. recurrences_after_update(): corpo de 20261024100700 + (a) marcar remove as pendentes futuras INTOCADAS (mesmo predicado
--      da pausa), (b) payroll_deduction entra na lista de colunas auditadas (recurrence.series_updated).
--   4. materialize_recurrences(): corpo de 20261024101100 + `and not r.payroll_deduction` (a série marcada não gera nada).
--   5. projected_cash_flow(): corpo de 20261024101600 + `and not r.payroll_deduction` (a projeção é de CAIXA: o desconto
--      em folha já está fora do valor líquido recebido).
-- Não alterado (verificado): notificações (20261024102000) não leem recurrences; delete_my_account apaga a série por família.

-- 1 · Coluna, check e grants ---------------------------------------------------------------------------------------
alter table public.recurrences
  add column if not exists payroll_deduction boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.recurrences'::regclass and conname = 'recurrences_payroll_deduction_check'
  ) then
    alter table public.recurrences
      add constraint recurrences_payroll_deduction_check check (not payroll_deduction or type = 'expense');
  end if;
end;
$$;

-- grants de coluna são aditivos; as policies de insert/update existentes continuam valendo
grant insert (payroll_deduction) on public.recurrences to authenticated;
grant update (payroll_deduction) on public.recurrences to authenticated;

-- 2 · Invariantes (corpo de 20261024101100 §2 + v_unmark) ----------------------------------------------------------
create or replace function private.recurrences_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_insert boolean := (tg_op = 'INSERT');
  v_react boolean := (tg_op = 'UPDATE' and not old.is_active and new.is_active);
  v_unmark boolean := (tg_op = 'UPDATE' and old.payroll_deduction and not new.payroll_deduction);
  v_acc_changed boolean := (tg_op = 'INSERT' or new.account_id is distinct from old.account_id);
  v_cat_changed boolean := (tg_op = 'INSERT' or new.category_id is distinct from old.category_id);
  v_today date := private.today();
  v_acc public.accounts;
  v_cat public.categories;
  v_member public.family_members;
  v_count integer;
  v_base date;
begin
  -- Conta: ativa (insert, mudança ou reativação); data de início >= saldo inicial (insert) ou, na troca de conta,
  -- greatest(início, hoje) >= saldo inicial da nova conta. (Série em folha também exige conta: nunca é debitada.)
  if v_acc_changed or v_react then
    select * into v_acc from public.accounts a where a.id = new.account_id and a.family_id = new.family_id;
    if v_acc.id is not null then
      if not v_acc.is_active then
        raise exception 'ACCOUNT_ARCHIVED' using errcode = 'P0001';
      end if;
      if v_insert and new.start_date < v_acc.opening_balance_date then
        raise exception 'DATE_BEFORE_OPENING_BALANCE' using errcode = 'P0001';
      end if;
      if not v_insert and new.account_id is distinct from old.account_id
         and greatest(new.start_date, v_today) < v_acc.opening_balance_date then
        raise exception 'DATE_BEFORE_OPENING_BALANCE' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Início da série: não mais que 12 meses no passado (criação; start_date é imutável depois). Depois da conta: DATE_BEFORE_OPENING_BALANCE tem precedência.
  if v_insert and new.start_date < (v_today - interval '12 months')::date then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- Categoria: mesmo tipo da série (insert ou mudança); ativa (insert, mudança ou reativação).
  if v_cat_changed or v_react then
    select * into v_cat from public.categories c where c.id = new.category_id and c.family_id = new.family_id;
    if v_cat.id is not null then
      if v_cat_changed and v_cat.type <> new.type then
        raise exception 'CATEGORY_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      if v_cat.archived_at is not null then
        raise exception 'CATEGORY_ARCHIVED' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Responsável: vínculo ativo (insert ou mudança).
  if new.assigned_member_id is not null and (v_insert or new.assigned_member_id is distinct from old.assigned_member_id) then
    select * into v_member from public.family_members m
    where m.id = new.assigned_member_id and m.family_id = new.family_id;
    if v_member.id is not null and v_member.status <> 'active' then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;
  end if;

  -- Limite de séries ativas por família, contado sob lock da família (member não pode travar `families`).
  if (v_insert or v_react) and new.is_active then
    perform pg_advisory_xact_lock(hashtextextended('recurrences:' || new.family_id::text, 0));
    select count(*) into v_count from public.recurrences r
    where r.family_id = new.family_id and r.is_active and (v_insert or r.id <> new.id);
    if v_count >= 100 then
      raise exception 'RECURRENCE_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  -- Ponteiro da agenda (do banco).
  if v_insert then
    new.next_occurrence_date := new.start_date;
  else
    -- Reativação ou DESMARCAR "desconto em folha": enquanto marcada a série não materializa e o ponteiro fica parado;
    -- ao desmarcar, recomeça da primeira data >= hoje (não recria o passado).
    if v_react or v_unmark then
      new.next_occurrence_date :=
        private.recurrence_next_on_or_after(new.start_date, new.frequency, new.interval_count, v_today);
    end if;
    if new.end_date is distinct from old.end_date then
      -- reativação/desmarcação junto com a mudança de término: parte do ponteiro já recalculado (nunca recua para o período parado)
      v_base := case when v_react or v_unmark then new.next_occurrence_date else old.next_occurrence_date end;
      new.next_occurrence_date := least(
        v_base, private.recurrence_next_on_or_after(new.start_date, new.frequency, new.interval_count, v_today));
    end if;
    -- Editar a série limpa a falha registrada (a próxima materialização tenta de novo). Updates só do ponteiro/falha
    -- (feitos pela materialização) não mudam coluna editável e não passam por aqui.
    if new.account_id is distinct from old.account_id
       or new.category_id is distinct from old.category_id
       or new.assigned_member_id is distinct from old.assigned_member_id
       or new.description is distinct from old.description
       or new.amount is distinct from old.amount
       or new.end_date is distinct from old.end_date
       or new.is_active is distinct from old.is_active
       or new.payroll_deduction is distinct from old.payroll_deduction then
      new.last_failure_code := null;
      new.last_failure_at := null;
    end if;
  end if;

  return new;
end;
$$;

-- 3 · Propagação e auditoria (corpo de 20261024100700 + marcar remove intocadas + coluna auditada) -------------------
create or replace function private.recurrences_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := private.today();
  v_changed text[] := '{}';
  v_values_changed boolean;
begin
  if new.amount is distinct from old.amount then v_changed := array_append(v_changed, 'amount'); end if;
  if new.description is distinct from old.description then v_changed := array_append(v_changed, 'description'); end if;
  if new.account_id is distinct from old.account_id then v_changed := array_append(v_changed, 'account_id'); end if;
  if new.category_id is distinct from old.category_id then v_changed := array_append(v_changed, 'category_id'); end if;
  if new.assigned_member_id is distinct from old.assigned_member_id then
    v_changed := array_append(v_changed, 'assigned_member_id');
  end if;
  if new.end_date is distinct from old.end_date then v_changed := array_append(v_changed, 'end_date'); end if;
  if new.payroll_deduction is distinct from old.payroll_deduction then
    v_changed := array_append(v_changed, 'payroll_deduction');
  end if;
  v_values_changed := cardinality(v_changed) > 0 and v_changed <> array['end_date'];

  -- 1. pausa, ou marcar "desconto em folha": remove as intocadas (pending futuras iguais à série). Já pagas, editadas,
  --    vencidas (< hoje) ou com observações ficam: são dinheiro/decisão do usuário e não são revertidas aqui.
  if (old.is_active and not new.is_active) or (not old.payroll_deduction and new.payroll_deduction) then
    delete from public.transactions t
    where t.recurrence_id = old.id and t.family_id = old.family_id
      and t.status = 'pending' and t.deleted_at is null
      and t.occurrence_date >= v_today and t.transaction_date = t.occurrence_date and t.notes is null
      and t.amount = old.amount and t.description = old.description
      and t.account_id = old.account_id and t.category_id = old.category_id
      and t.assigned_member_id is not distinct from old.assigned_member_id;
  end if;

  -- 2. término novo: remove as intocadas depois dele
  if new.end_date is not null and new.end_date is distinct from old.end_date then
    delete from public.transactions t
    where t.recurrence_id = old.id and t.family_id = old.family_id
      and t.status = 'pending' and t.deleted_at is null
      and t.occurrence_date >= v_today and t.occurrence_date > new.end_date
      and t.transaction_date = t.occurrence_date and t.notes is null
      and t.amount = old.amount and t.description = old.description
      and t.account_id = old.account_id and t.category_id = old.category_id
      and t.assigned_member_id is not distinct from old.assigned_member_id;
  end if;

  -- 3. valores novos: atualiza as intocadas que restaram (os triggers de lançamentos rodam e auditam transaction.updated)
  if v_values_changed and (v_changed && array['amount', 'description', 'account_id', 'category_id', 'assigned_member_id']) then
    update public.transactions t
    set amount = new.amount, description = new.description, account_id = new.account_id,
        category_id = new.category_id, assigned_member_id = new.assigned_member_id
    where t.recurrence_id = old.id and t.family_id = old.family_id
      and t.status = 'pending' and t.deleted_at is null
      and t.occurrence_date >= v_today and t.transaction_date = t.occurrence_date and t.notes is null
      and t.amount = old.amount and t.description = old.description
      and t.account_id = old.account_id and t.category_id = old.category_id
      and t.assigned_member_id is not distinct from old.assigned_member_id;
  end if;

  -- Auditoria (nomes de coluna, nunca valores de texto)
  if old.is_active and not new.is_active then
    perform private.log_audit(new.family_id, 'recurrence', new.id, 'recurrence.paused', '{}'::jsonb);
  elsif not old.is_active and new.is_active then
    perform private.log_audit(new.family_id, 'recurrence', new.id, 'recurrence.resumed', '{}'::jsonb);
  end if;
  if cardinality(v_changed) > 0 then
    perform private.log_audit(new.family_id, 'recurrence', new.id, 'recurrence.series_updated',
      jsonb_build_object('changed', to_jsonb(v_changed)));
  end if;
  return null;
end;
$$;

-- 4 · Materialização: séries em folha não geram nada (corpo de 20261024101100 §3 + um predicado) ----------------------
create or replace function public.materialize_recurrences()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_today date := private.today();
  v_horizon date;
  v_series public.recurrences;
  v_total integer := 0;
  v_made integer;
  v_seen integer;
  v_inserted integer;
  v_idx integer;
  v_date date;
  v_limit date;
  v_code text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- último dia do mês seguinte a hoje
  v_horizon := (date_trunc('month', v_today::timestamp) + interval '2 months' - interval '1 day')::date;

  for v_series in
    select r.* from public.recurrences r
    where r.family_id = v_family and r.is_active
      and not r.payroll_deduction  -- desconto em folha: nunca vira transação/conta a pagar
      and (r.last_failure_code is null or r.last_failure_at < now() - interval '1 hour')
      and r.next_occurrence_date <= least(v_horizon, coalesce(r.end_date, v_horizon))
    order by r.next_occurrence_date, r.id
    for update skip locked
  loop
    exit when v_total >= 500;
    begin
      v_made := 0;
      v_seen := 0;

      if not exists (
        select 1 from public.family_members m
        where m.family_id = v_series.family_id and m.user_id = v_series.created_by and m.status = 'active'
      ) then
        raise exception 'RECURRENCE_AUTHOR_INACTIVE' using errcode = 'P0001';
      end if;

      v_limit := least(v_horizon, coalesce(v_series.end_date, v_horizon));
      v_idx := private.recurrence_first_index(
        v_series.start_date, v_series.frequency, v_series.interval_count, v_series.next_occurrence_date);

      loop
        v_date := private.recurrence_occurrence(v_series.start_date, v_series.frequency, v_series.interval_count, v_idx);
        exit when v_date > v_limit or v_seen >= 60 or v_total + v_made >= 500;

        insert into public.transactions (
          family_id, type, account_id, category_id, assigned_member_id, description, amount,
          transaction_date, status, recurrence_id, occurrence_date, created_by
        ) values (
          v_series.family_id, v_series.type, v_series.account_id, v_series.category_id, v_series.assigned_member_id,
          v_series.description, v_series.amount, v_date, 'pending', v_series.id, v_date, v_series.created_by
        )
        on conflict (recurrence_id, occurrence_date) do nothing;
        get diagnostics v_inserted = row_count;

        v_made := v_made + v_inserted;
        v_seen := v_seen + 1;
        v_idx := v_idx + 1;
      end loop;

      -- ponteiro = primeira data da agenda ainda não materializada; sucesso limpa a falha anterior
      update public.recurrences
      set next_occurrence_date =
            private.recurrence_occurrence(v_series.start_date, v_series.frequency, v_series.interval_count, v_idx),
          last_failure_code = null,
          last_failure_at = null
      where id = v_series.id;

      v_total := v_total + v_made;
    exception when others then
      -- o sub-bloco desfez as inserções desta série; registra o código (mensagem = código) ou INTERNAL_ERROR
      v_code := case when sqlerrm ~ '^[A-Z_]{1,40}$' then sqlerrm else 'INTERNAL_ERROR' end;
      update public.recurrences
      set last_failure_code = v_code, last_failure_at = now()
      where id = v_series.id;
    end;
  end loop;

  return v_total;
end;
$$;

revoke execute on function public.materialize_recurrences() from public, anon;
grant execute on function public.materialize_recurrences() to authenticated;

-- 5 · Projeção de caixa: séries em folha fora (corpo de 20261024101600 + um predicado em `series`) ------------------
create or replace function public.projected_cash_flow(p_months integer)
returns table (month date, pending_income text, pending_expense text, recurring_income text, recurring_expense text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_today date := private.today();
  v_first date;
  v_end date;  -- primeiro dia depois da janela
begin
  if p_months is null or p_months < 1 or p_months > 12 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  v_first := date_trunc('month', v_today::timestamp)::date;
  v_end := (v_first + make_interval(months => p_months))::date;

  return query
  with months as (
    select (v_first + make_interval(months => i))::date as first_day, i
    from generate_series(0, p_months - 1) as i
  ),
  pend as (
    select case when t.transaction_date < v_first then v_first
                else date_trunc('month', t.transaction_date::timestamp)::date end as m,
           t.type, t.amount
    from public.transactions t
    where t.family_id = (select private.current_family_id())
      and t.status = 'pending' and t.deleted_at is null and t.type in ('income', 'expense')
      and t.transaction_date < v_end
  ),
  series as (
    select r.type, r.amount, r.start_date, r.frequency, r.interval_count, r.end_date,
           private.recurrence_first_index(r.start_date, r.frequency, r.interval_count,
             greatest(r.next_occurrence_date, v_today)) as idx
    from public.recurrences r
    where r.family_id = (select private.current_family_id()) and r.is_active
      and not r.payroll_deduction  -- desconto em folha não sai do caixa (salário é lançado líquido)
  ),
  virt as (
    select date_trunc('month', d.occ::timestamp)::date as m, s.type, s.amount
    from series s
    cross join lateral generate_series(s.idx, s.idx + 59) as n
    cross join lateral (
      select private.recurrence_occurrence(s.start_date, s.frequency, s.interval_count, n) as occ
    ) d
    where d.occ >= v_today and d.occ < v_end and (s.end_date is null or d.occ <= s.end_date)
  )
  select mo.first_day,
         round(coalesce((select sum(p.amount) from pend p where p.m = mo.first_day and p.type = 'income'), 0), 2)::text,
         round(coalesce((select sum(p.amount) from pend p where p.m = mo.first_day and p.type = 'expense'), 0), 2)::text,
         round(coalesce((select sum(v.amount) from virt v where v.m = mo.first_day and v.type = 'income'), 0), 2)::text,
         round(coalesce((select sum(v.amount) from virt v where v.m = mo.first_day and v.type = 'expense'), 0), 2)::text
  from months mo
  order by mo.first_day;
end;
$$;
revoke execute on function public.projected_cash_flow(integer) from public, anon;
grant execute on function public.projected_cash_flow(integer) to authenticated;

-- DOWN (manual), nesta ordem:
--   1. Recriar as 4 funções com os corpos anteriores: private.recurrences_before_write() de 20261024101100 §2;
--      private.recurrences_after_update() de 20261024100700; public.materialize_recurrences() de 20261024101100 §3;
--      public.projected_cash_flow(integer) de 20261024101600 (mesmos revoke/grant).
--   2. revoke insert (payroll_deduction), update (payroll_deduction) on public.recurrences from authenticated;
--      alter table public.recurrences drop constraint recurrences_payroll_deduction_check;
--      alter table public.recurrences drop column payroll_deduction;
--      (DESTRUTIVO: perde a marcação; as séries marcadas passariam a gerar contas a pagar na próxima materialização.
--      Só com autorização explícita e depois de desmarcar/encerrar as séries em folha.)
-- Efeito em dados existentes: coluna nova com default false (metadado, sem reescrita de tabela, lock curto) — nenhuma
--   série existente muda de comportamento; sem backfill. Pendentes já geradas só são removidas quando o usuário MARCA a série
--   (ver §3, apenas as intocadas e futuras); marcar não toca pagas, vencidas, editadas ou com observações.
