-- Núcleo · Etapa 5 · recorrências (recurrences) e agenda (D12). Contrato: docs/contracts/etapa-5.md §3.1; ADR-0023.
-- Erros dos triggers: P0001 com mensagem = código; 42501 = FORBIDDEN.
-- A ligação com transactions (recurrence_id/occurrence_date) está em 20261024100800_etapa5_transactions_bills.sql.

-- Agenda (D12) ---------------------------------------------------------------------------------------------------
-- Ocorrência n calculada a partir de p_start (não encadeada): sem deriva de dia âncora em meses curtos.
-- date + interval ('1 month') leva o dia 31 ao último dia do mês mais curto; 29/02 + 1 ano = 28/02.
create function private.recurrence_occurrence(p_start date, p_frequency text, p_interval smallint, p_n integer)
returns date
language sql immutable set search_path = '' as $$
  select case p_frequency
    when 'weekly' then p_start + 7 * p_interval * p_n
    when 'monthly' then (p_start + make_interval(months => p_interval * p_n))::date
    when 'yearly' then (p_start + make_interval(years => p_interval * p_n))::date
  end
$$;

-- Auxiliar (além do contrato): índice n da primeira ocorrência >= greatest(p_date, p_start). Serve a next_on_or_after e à
-- materialização (que precisa do índice para percorrer a agenda). Parte de uma estimativa por baixo e avança.
create function private.recurrence_first_index(p_start date, p_frequency text, p_interval smallint, p_date date)
returns integer
language plpgsql immutable set search_path = '' as $$
declare
  v_target date := greatest(p_date, p_start);
  v_n integer;
begin
  v_n := case p_frequency
    when 'weekly' then greatest(0, (v_target - p_start) / (7 * p_interval) - 1)
    when 'monthly' then greatest(0,
      ((extract(year from v_target)::integer - extract(year from p_start)::integer) * 12
        + extract(month from v_target)::integer - extract(month from p_start)::integer) / p_interval - 1)
    when 'yearly' then greatest(0,
      (extract(year from v_target)::integer - extract(year from p_start)::integer) / p_interval - 1)
  end;
  while private.recurrence_occurrence(p_start, p_frequency, p_interval, v_n) < v_target loop
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create function private.recurrence_next_on_or_after(p_start date, p_frequency text, p_interval smallint, p_date date)
returns date
language sql immutable set search_path = '' as $$
  select private.recurrence_occurrence(
    p_start, p_frequency, p_interval, private.recurrence_first_index(p_start, p_frequency, p_interval, p_date))
$$;

-- Usadas pelo trigger de recurrences (security invoker), logo o chamador precisa de EXECUTE (como private.today).
revoke execute on function private.recurrence_occurrence(date, text, smallint, integer) from public, anon;
revoke execute on function private.recurrence_first_index(date, text, smallint, date) from public, anon;
revoke execute on function private.recurrence_next_on_or_after(date, text, smallint, date) from public, anon;
grant execute on function private.recurrence_occurrence(date, text, smallint, integer) to authenticated;
grant execute on function private.recurrence_first_index(date, text, smallint, date) to authenticated;
grant execute on function private.recurrence_next_on_or_after(date, text, smallint, date) to authenticated;

-- Tabela ---------------------------------------------------------------------------------------------------------
create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  type text not null  -- imutável: fora do grant de update
    constraint recurrences_type_check check (type in ('income', 'expense')),
  account_id uuid not null,
  category_id uuid not null,
  assigned_member_id uuid null,
  description text not null
    constraint recurrences_description_check check (char_length(btrim(description)) between 1 and 120),
  amount numeric(14, 2) not null
    constraint recurrences_amount_check check (amount > 0 and amount <> 'NaN'::numeric and amount <= 99999999.99),
  frequency text not null  -- imutável
    constraint recurrences_frequency_check check (frequency in ('weekly', 'monthly', 'yearly')),
  interval_count smallint not null default 1  -- imutável
    constraint recurrences_interval_count_check check (interval_count between 1 and 12),
  start_date date not null  -- imutável
    constraint recurrences_start_date_check check (start_date >= date '2000-01-01'),
  end_date date null
    constraint recurrences_end_date_check check (end_date is null or end_date >= start_date),
  next_occurrence_date date not null,  -- do banco (fora dos grants): primeira data da agenda ainda não materializada
  is_active boolean not null default true,
  last_failure_code text null
    constraint recurrences_last_failure_code_check check (last_failure_code ~ '^[A-Z_]{1,40}$'),
  last_failure_at timestamptz null,
  idempotency_key uuid null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurrences_family_id_id_key unique (family_id, id),  -- alvo da FK de transactions
  constraint recurrences_family_idempotency_key unique (family_id, idempotency_key),
  constraint recurrences_failure_shape_check check ((last_failure_code is null) = (last_failure_at is null)),
  constraint recurrences_account_fk foreign key (family_id, account_id)
    references public.accounts (family_id, id) on delete restrict,
  constraint recurrences_category_fk foreign key (family_id, category_id)
    references public.categories (family_id, id) on delete restrict,
  constraint recurrences_assigned_member_fk foreign key (family_id, assigned_member_id)
    references public.family_members (family_id, id) on delete restrict,
  constraint recurrences_created_by_fk foreign key (created_by)
    references public.profiles (id) on delete restrict
);

-- Materialização: séries ativas da família com ponteiro vencido (materialize_recurrences e listagem por próxima data).
create index recurrences_family_next_idx on public.recurrences (family_id, next_occurrence_date) where is_active;

create trigger recurrences_set_updated_at
  before update on public.recurrences
  for each row execute function private.set_updated_at();

alter table public.recurrences enable row level security;
revoke all on public.recurrences from anon, authenticated;
grant select on public.recurrences to authenticated;
grant insert (family_id, type, account_id, category_id, assigned_member_id, description, amount, frequency,
              interval_count, start_date, end_date, idempotency_key)
  on public.recurrences to authenticated;
grant update (account_id, category_id, assigned_member_id, description, amount, end_date, is_active)
  on public.recurrences to authenticated;
-- sem delete: a série se pausa ou se encerra

create policy recurrences_select on public.recurrences
  for select to authenticated
  using (private.is_family_member(family_id));

create policy recurrences_insert on public.recurrences
  for insert to authenticated
  with check (private.is_family_member(family_id) and created_by = (select auth.uid()));

create policy recurrences_update on public.recurrences
  for update to authenticated
  using (private.has_family_role(family_id, array['owner', 'admin']) or created_by = (select auth.uid()))
  with check (private.has_family_role(family_id, array['owner', 'admin']) or created_by = (select auth.uid()));

-- Invariantes (security invoker: a RLS do chamador vale; referência de outra família é invisível e a FK responde 23503) ----
create function private.recurrences_before_write() returns trigger
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
revoke execute on function private.recurrences_before_write() from public, anon, authenticated;

create trigger recurrences_before_write_biu
  before insert or update on public.recurrences
  for each row execute function private.recurrences_before_write();

-- Propagação e auditoria (security definer: remove e atualiza ocorrências de qualquer integrante da família; ADR-0023 §4).
-- Intocada = pending, não excluída, data >= hoje, transaction_date = occurrence_date, sem observações e com
-- amount/description/account/category/responsável iguais aos OLD da série. Só dispara em mudança real.
create function private.recurrences_after_update() returns trigger
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
  v_values_changed := cardinality(v_changed) > 0 and v_changed <> array['end_date'];

  -- 1. pausa: remove as intocadas
  if old.is_active and not new.is_active then
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
revoke execute on function private.recurrences_after_update() from public, anon, authenticated;

create trigger recurrences_after_update_au
  after update on public.recurrences
  for each row execute function private.recurrences_after_update();

-- DOWN (manual): drop table public.recurrences (apaga séries: destrutivo, só com autorização; antes, desfazer a migration
--   20261024100800, que referencia a tabela); drop function private.recurrences_after_update(); drop function private.recurrences_before_write();
--   drop function private.recurrence_next_on_or_after(date, text, smallint, date); drop function private.recurrence_first_index(date, text, smallint, date);
--   drop function private.recurrence_occurrence(date, text, smallint, integer).
-- Efeito em dados existentes: nenhum (tabela e funções novas).
