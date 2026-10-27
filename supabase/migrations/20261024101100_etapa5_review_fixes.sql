-- Núcleo · Etapa 5 · correções pós-revisão (1: autor ex-integrante, 2: início da série, 3: backoff de falha).
-- Erros: P0001 com mensagem = código; 42501 = FORBIDDEN.

-- 1 · O ramo "autor" das policies de UPDATE exige vínculo ativo: ex-integrante não edita o que criou ----------------
drop policy recurrences_update on public.recurrences;
create policy recurrences_update on public.recurrences
  for update to authenticated
  using (
    private.has_family_role(family_id, array['owner', 'admin'])
    or (created_by = (select auth.uid()) and private.is_family_member(family_id))
  )
  with check (
    private.has_family_role(family_id, array['owner', 'admin'])
    or (created_by = (select auth.uid()) and private.is_family_member(family_id))
  );

drop policy transactions_update on public.transactions;
create policy transactions_update on public.transactions
  for update to authenticated
  using (
    deleted_at is null
    and (
      private.has_family_role(family_id, array['owner', 'admin'])
      or (created_by = (select auth.uid()) and private.is_family_member(family_id))
    )
  )
  with check (
    private.has_family_role(family_id, array['owner', 'admin'])
    or (created_by = (select auth.uid()) and private.is_family_member(family_id))
  );

-- 2 · start_date >= hoje - 12 meses na criação (INVALID_INPUT) ------------------------------------------------------
-- (corpo de 20261024100700 + o bloco novo; trigger e grants permanecem)
create or replace function private.recurrences_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_insert boolean := (tg_op = 'INSERT');
  v_react boolean := (tg_op = 'UPDATE' and not old.is_active and new.is_active);
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
  -- greatest(início, hoje) >= saldo inicial da nova conta.
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
    if v_react then
      new.next_occurrence_date :=
        private.recurrence_next_on_or_after(new.start_date, new.frequency, new.interval_count, v_today);
    end if;
    if new.end_date is distinct from old.end_date then
      -- reativação junto com a mudança de término: parte do ponteiro já recalculado (nunca recua para o período pausado)
      v_base := case when v_react then new.next_occurrence_date else old.next_occurrence_date end;
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
       or new.is_active is distinct from old.is_active then
      new.last_failure_code := null;
      new.last_failure_at := null;
    end if;
  end if;

  return new;
end;
$$;
-- 3 · materialização pula séries com falha registrada há menos de 1 hora (editar a série zera a falha) ------------
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


-- DOWN (manual): recriar as policies e as duas funções com os corpos de 20261024100200/100700/100900 (sem is_family_member
--   no ramo autor; sem a checagem de start_date; sem o filtro de falha). Efeito em dados existentes: nenhum (policies e funções;
--   séries já criadas com start_date antigo não são revalidadas, a regra vale só no INSERT).
