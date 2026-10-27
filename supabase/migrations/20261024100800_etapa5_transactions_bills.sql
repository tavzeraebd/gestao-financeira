-- Núcleo · Etapa 5 · compromissos: colunas de recorrência em transactions, trigger de lançamentos redefinido por inteiro,
-- auditoria de pagamento/cancelamento, RPCs pay/cancel e pending_summary. Contrato: docs/contracts/etapa-5.md §3.1; ADR-0022, ADR-0023.
-- Erros: P0001 com mensagem = código; 42501 = FORBIDDEN. Grants de transactions INALTERADOS (status, due_date, recurrence_id
-- e occurrence_date seguem fora de insert/update; select é de tabela, então as colunas novas são legíveis).

-- Colunas e constraints -----------------------------------------------------------------------------------------------
alter table public.transactions
  add column recurrence_id uuid null,
  add column occurrence_date date null;

alter table public.transactions
  add constraint transactions_recurrence_shape_check check ((recurrence_id is null) = (occurrence_date is null)),
  add constraint transactions_recurrence_fk foreign key (family_id, recurrence_id)
    references public.recurrences (family_id, id) on delete restrict,
  add constraint transactions_recurrence_occurrence_key unique (recurrence_id, occurrence_date);

-- Transferência não pode ser pendente (ADR-0022). NOT VALID + VALIDATE tolerante (padrão SEC-14): dado existente
-- que viole não derruba a migration (vira NOTICE; a constraint vale para novas escritas).
alter table public.transactions
  add constraint transactions_pending_type_check check (status <> 'pending' or type <> 'transfer') not valid;
do $$
begin
  alter table public.transactions validate constraint transactions_pending_type_check;
exception when check_violation then
  raise notice 'ETAPA5: existem transferências pendentes; transactions_pending_type_check fica NOT VALID (vale para novas escritas). Corrija e rode VALIDATE.';
end;
$$;

-- Resumo e próximos vencimentos: pendentes da família por data (pending_summary, listUpcomingBills, orçamento comprometido).
create index transactions_pending_date_idx
  on public.transactions (family_id, transaction_date) where status = 'pending' and deleted_at is null;

-- Backfill: pendentes criados antes desta migration têm due_date nulo; D7 manda due_date = transaction_date enquanto pendente.
-- Roda com o trigger da Etapa 3 ainda ativo (ele não mexe em due_date) e antes da redefinição abaixo. Só preenche nulo.
update public.transactions set due_date = transaction_date where status = 'pending' and due_date is null;

-- Trigger de lançamentos: redefinido por inteiro = lógica de 20261024100400 (que contém a de 20261024100200)
-- + acréscimos da Etapa 5 (marcados com "E5"). Nenhuma regra anterior foi removida.
create or replace function private.transactions_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_insert boolean := (tg_op = 'INSERT');
  v_status_changed boolean := (tg_op = 'UPDATE' and new.status is distinct from old.status);  -- E5
  v_acc public.accounts;
  v_dest public.accounts;
  v_cat public.categories;
  v_member public.family_members;
  v_orig public.transactions;
  v_reversed numeric;
begin
  if v_insert and new.status not in ('paid', 'pending') then
    raise exception 'transactions_status_insert_check' using errcode = '23514';
  end if;

  -- E5 · linha cancelada é imutável; as únicas transições são pending → paid e pending → canceled.
  if not v_insert then
    if old.status = 'canceled' then
      raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
    end if;
    if v_status_changed and not (old.status = 'pending' and new.status in ('paid', 'canceled')) then
      raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
    end if;
  end if;

  -- Exclusão lógica: fixa quem e quando e descarta qualquer outra alteração enviada junto (SEC-15).
  if not v_insert and old.deleted_at is null and new.deleted_at is not null then
    if old.reversal_of_id is null and exists (
      select 1 from public.transactions r
      where r.reversal_of_id = old.id and r.family_id = old.family_id and r.deleted_at is null
    ) then
      raise exception 'TRANSACTION_HAS_REVERSALS' using errcode = 'P0001';
    end if;
    new.account_id := old.account_id;
    new.destination_account_id := old.destination_account_id;
    new.category_id := old.category_id;
    new.assigned_member_id := old.assigned_member_id;
    new.description := old.description;
    new.amount := old.amount;
    new.transaction_date := old.transaction_date;
    new.notes := old.notes;
    new.status := old.status;      -- E5 · a exclusão não carrega mudança de status nem de vencimento
    new.due_date := old.due_date;  -- E5
    new.deleted_at := now();
    new.deleted_by := auth.uid();
    return new;
  end if;

  -- Campos financeiros travados: original com estorno ativo e o próprio estorno.
  if not v_insert and (
       new.amount is distinct from old.amount
    or new.transaction_date is distinct from old.transaction_date
    or new.account_id is distinct from old.account_id
    or new.category_id is distinct from old.category_id
  ) then
    if old.reversal_of_id is not null or exists (
      select 1 from public.transactions r
      where r.reversal_of_id = old.id and r.family_id = old.family_id and r.deleted_at is null
    ) then
      raise exception 'TRANSACTION_HAS_REVERSALS' using errcode = 'P0001';
    end if;
  end if;

  -- Conta e destino: ativos (quando a referência muda; E5: também ao virar paid) e data >= saldo inicial
  -- (E5: a checagem de data também roda quando o status muda). Linhas travadas com FOR SHARE.
  v_acc := private.lock_account_share(new.family_id, new.account_id);
  if v_acc.id is not null then
    if (v_insert or new.account_id is distinct from old.account_id or (v_status_changed and new.status = 'paid'))
       and not v_acc.is_active then
      raise exception 'ACCOUNT_ARCHIVED' using errcode = 'P0001';
    end if;
    if (v_insert or new.account_id is distinct from old.account_id
        or new.transaction_date is distinct from old.transaction_date or v_status_changed)
       and new.transaction_date < v_acc.opening_balance_date then
      raise exception 'DATE_BEFORE_OPENING_BALANCE' using errcode = 'P0001';
    end if;
  end if;

  if new.destination_account_id is not null then
    v_dest := private.lock_account_share(new.family_id, new.destination_account_id);
    if v_dest.id is not null then
      if (v_insert or new.destination_account_id is distinct from old.destination_account_id) and not v_dest.is_active then
        raise exception 'ACCOUNT_ARCHIVED' using errcode = 'P0001';
      end if;
      if (v_insert or new.destination_account_id is distinct from old.destination_account_id
          or new.transaction_date is distinct from old.transaction_date)
         and new.transaction_date < v_dest.opening_balance_date then
        raise exception 'DATE_BEFORE_OPENING_BALANCE' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Categoria: mesmo tipo do lançamento (transferência com categoria cai no CHECK 23514) e ativa.
  if new.category_id is not null and (v_insert or new.category_id is distinct from old.category_id) then
    select * into v_cat from public.categories c where c.id = new.category_id and c.family_id = new.family_id;
    if v_cat.id is not null then
      if new.type in ('income', 'expense') and v_cat.type <> new.type then
        raise exception 'CATEGORY_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      if v_cat.archived_at is not null then
        raise exception 'CATEGORY_ARCHIVED' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- Responsável: vínculo ativo (vínculo de outra família é invisível: a FK responde 23503).
  if new.assigned_member_id is not null and (v_insert or new.assigned_member_id is distinct from old.assigned_member_id) then
    select * into v_member from public.family_members m
    where m.id = new.assigned_member_id and m.family_id = new.family_id;
    if v_member.id is not null and v_member.status <> 'active' then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;
  end if;

  -- Efetivado não pode ter data futura em São Paulo (E5: também ao virar paid).
  if new.status = 'paid' and new.transaction_date > private.today()
     and (v_insert or new.transaction_date is distinct from old.transaction_date or v_status_changed) then
    raise exception 'FUTURE_DATE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  -- Estorno (D5): lock do original e validações.
  if v_insert and new.reversal_of_id is not null then
    perform 1 from public.transactions t where t.id = new.reversal_of_id and t.family_id = new.family_id;
    if not found then
      raise exception 'INVALID_REVERSAL' using errcode = 'P0001';
    end if;

    if not private.has_family_role(new.family_id, array['owner', 'admin'])
       and not exists (
         select 1 from public.transactions t
         where t.id = new.reversal_of_id and t.family_id = new.family_id and t.created_by = auth.uid()
       ) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    select * into v_orig from public.transactions t
    where t.id = new.reversal_of_id and t.family_id = new.family_id
    for update;
    if v_orig.id is null
       or v_orig.status <> 'paid'
       or v_orig.deleted_at is not null
       or v_orig.type = 'transfer'
       or v_orig.reversal_of_id is not null
       or new.type <> v_orig.type
       or new.account_id <> v_orig.account_id
       or new.category_id is distinct from v_orig.category_id
       or new.status <> 'paid'
       or new.transaction_date < v_orig.transaction_date then
      raise exception 'INVALID_REVERSAL' using errcode = 'P0001';
    end if;

    select coalesce(sum(r.amount), 0) into v_reversed
    from public.transactions r
    where r.reversal_of_id = v_orig.id and r.family_id = v_orig.family_id and r.deleted_at is null;
    if v_reversed + new.amount > v_orig.amount then
      raise exception 'REVERSAL_EXCEEDS_REMAINING' using errcode = 'P0001';
    end if;
  end if;

  -- E5 · due_date é do banco: insert pending = data do lançamento; insert paid = nulo; linha que continua pending acompanha
  -- a data; pending → paid e demais casos preservam o vencimento original.
  if v_insert then
    new.due_date := case when new.status = 'pending' then new.transaction_date else null end;
  elsif old.status = 'pending' and new.status = 'pending' then
    new.due_date := new.transaction_date;
  else
    new.due_date := old.due_date;
  end if;

  return new;
end;
$$;

-- Auditoria: mesma lógica da migration 100200 + E5 (pending → paid grava só transaction.paid; pending → canceled grava
-- transaction.canceled). Metadata sem descrição nem notas.
create or replace function private.transactions_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_changed text[] := '{}';
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    if new.reversal_of_id is not null then
      perform private.log_audit(
        new.family_id, 'transaction', new.reversal_of_id, 'transaction.reversed',
        jsonb_build_object(
          'reversal_id', new.id, 'amount', new.amount::text,
          'transaction_date', to_char(new.transaction_date, 'YYYY-MM-DD')
        )
      );
    end if;
    return null;
  end if;

  -- E5 · pagamento: o valor e a conta podem mudar; a data de pagamento é a nova transaction_date.
  if old.status = 'pending' and new.status = 'paid' then
    if new.amount is distinct from old.amount then
      v_changed := array_append(v_changed, 'amount');
      v_old := v_old || jsonb_build_object('amount', old.amount::text);
    end if;
    if new.account_id is distinct from old.account_id then
      v_changed := array_append(v_changed, 'account_id');
      v_old := v_old || jsonb_build_object('account_id', old.account_id);
    end if;
    perform private.log_audit(
      new.family_id, 'transaction', new.id, 'transaction.paid',
      jsonb_build_object(
        'amount', new.amount::text,
        'transaction_date', to_char(new.transaction_date, 'YYYY-MM-DD'),
        'due_date', to_char(new.due_date, 'YYYY-MM-DD'),
        'changed', to_jsonb(v_changed),
        'old', v_old
      )
    );
    return null;
  end if;

  if old.status = 'pending' and new.status = 'canceled' then
    perform private.log_audit(
      new.family_id, 'transaction', new.id, 'transaction.canceled',
      jsonb_build_object(
        'type', new.type, 'amount', new.amount::text,
        'transaction_date', to_char(new.transaction_date, 'YYYY-MM-DD')
      )
    );
    return null;
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    perform private.log_audit(
      new.family_id, 'transaction', new.id, 'transaction.deleted',
      jsonb_build_object(
        'type', new.type, 'amount', new.amount::text,
        'transaction_date', to_char(new.transaction_date, 'YYYY-MM-DD')
      )
    );
    return null;
  end if;

  if new.amount is distinct from old.amount then
    v_changed := array_append(v_changed, 'amount');
    v_old := v_old || jsonb_build_object('amount', old.amount::text);
    v_new := v_new || jsonb_build_object('amount', new.amount::text);
  end if;
  if new.transaction_date is distinct from old.transaction_date then
    v_changed := array_append(v_changed, 'transaction_date');
    v_old := v_old || jsonb_build_object('transaction_date', to_char(old.transaction_date, 'YYYY-MM-DD'));
    v_new := v_new || jsonb_build_object('transaction_date', to_char(new.transaction_date, 'YYYY-MM-DD'));
  end if;
  if new.account_id is distinct from old.account_id then
    v_changed := array_append(v_changed, 'account_id');
    v_old := v_old || jsonb_build_object('account_id', old.account_id);
    v_new := v_new || jsonb_build_object('account_id', new.account_id);
  end if;
  if new.destination_account_id is distinct from old.destination_account_id then
    v_changed := array_append(v_changed, 'destination_account_id');
    v_old := v_old || jsonb_build_object('destination_account_id', old.destination_account_id);
    v_new := v_new || jsonb_build_object('destination_account_id', new.destination_account_id);
  end if;
  if new.category_id is distinct from old.category_id then
    v_changed := array_append(v_changed, 'category_id');
    v_old := v_old || jsonb_build_object('category_id', old.category_id);
    v_new := v_new || jsonb_build_object('category_id', new.category_id);
  end if;

  if cardinality(v_changed) > 0 then
    perform private.log_audit(
      new.family_id, 'transaction', new.id, 'transaction.updated',
      jsonb_build_object('changed', to_jsonb(v_changed), 'old', v_old, 'new', v_new)
    );
  end if;
  return null;
end;
$$;

-- RPCs de escrita (ADR-0022) -----------------------------------------------------------------------------------------
-- Única via de mudança de status. Família = a do chamador; a linha é buscada por id E família, com FOR UPDATE.
create function public.pay_pending_transaction(p_transaction_id uuid, p_paid_on date, p_amount numeric, p_account_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_tx public.transactions;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_tx from public.transactions t
  where t.id = p_transaction_id and t.family_id = v_family and t.deleted_at is null
  for update;
  if v_tx.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_tx.status <> 'pending' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  -- owner/admin, autor ou responsável (vínculo ativo do chamador)
  if not private.has_family_role(v_family, array['owner', 'admin'])
     and v_tx.created_by <> v_uid
     and not exists (
       select 1 from public.family_members m
       where m.id = v_tx.assigned_member_id and m.family_id = v_family
         and m.user_id = v_uid and m.status = 'active'
     ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_paid_on is null or p_amount is null or p_account_id is null or p_amount <= 0 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_paid_on > private.today() then
    raise exception 'FUTURE_DATE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  -- O trigger valida conta ativa e data >= saldo inicial; a FK composta barra conta de outra família (23503).
  update public.transactions
  set status = 'paid', transaction_date = p_paid_on, amount = p_amount, account_id = p_account_id
  where id = v_tx.id and family_id = v_family;
end;
$$;

create function public.cancel_pending_transaction(p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_tx public.transactions;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_tx from public.transactions t
  where t.id = p_transaction_id and t.family_id = v_family and t.deleted_at is null
  for update;
  if v_tx.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_tx.status <> 'pending' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;

  -- owner/admin ou autor (o responsável que não é autor não cancela)
  if not private.has_family_role(v_family, array['owner', 'admin']) and v_tx.created_by <> v_uid then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.transactions set status = 'canceled' where id = v_tx.id and family_id = v_family;
end;
$$;

revoke execute on function public.pay_pending_transaction(uuid, date, numeric, uuid) from public, anon;
revoke execute on function public.cancel_pending_transaction(uuid) from public, anon;
grant execute on function public.pay_pending_transaction(uuid, date, numeric, uuid) to authenticated;
grant execute on function public.cancel_pending_transaction(uuid) to authenticated;

-- Leitura (D19) --------------------------------------------------------------------------------------------------------
-- security invoker: a RLS do chamador vale; o filtro por current_family_id() é redundante de propósito. Montantes em text.
create function public.pending_summary()
returns table (payable text, receivable text, overdue_payable text, overdue_receivable text, overdue_count integer)
language sql stable security invoker set search_path = '' as $$
  select
    round(coalesce(sum(t.amount) filter (where t.type = 'expense'), 0), 2)::text,
    round(coalesce(sum(t.amount) filter (where t.type = 'income'), 0), 2)::text,
    round(coalesce(sum(t.amount) filter (where t.type = 'expense' and t.transaction_date < private.today()), 0), 2)::text,
    round(coalesce(sum(t.amount) filter (where t.type = 'income' and t.transaction_date < private.today()), 0), 2)::text,
    (count(*) filter (where t.transaction_date < private.today()))::integer
  from public.transactions t
  where t.family_id = (select private.current_family_id())
    and t.status = 'pending' and t.deleted_at is null
    and t.type in ('income', 'expense')
$$;

revoke execute on function public.pending_summary() from public, anon;
grant execute on function public.pending_summary() to authenticated;

-- DOWN (manual): drop function public.pending_summary(); drop function public.cancel_pending_transaction(uuid);
--   drop function public.pay_pending_transaction(uuid, date, numeric, uuid);
--   restaurar private.transactions_audit() (migration 100200) e private.transactions_before_write() (migration 100400);
--   drop index public.transactions_pending_date_idx;
--   alter table public.transactions drop constraint transactions_pending_type_check, drop constraint transactions_recurrence_occurrence_key,
--     drop constraint transactions_recurrence_fk, drop constraint transactions_recurrence_shape_check,
--     drop column recurrence_id, drop column occurrence_date  (as colunas só podem sair se não houver ocorrências: destrutivo).
-- Efeito em dados existentes: o backfill de due_date (pendentes com due_date nulo = transaction_date) não é revertido (inofensivo).
--   Colunas novas nulas; nenhum outro dado alterado. Lock: ALTER TABLE com colunas anuláveis sem default é instantâneo;
--   a validação das constraints faz uma varredura da tabela (volume atual não medido neste ambiente).
