-- Compra parcelada no cartão (ADR-0040; D23, R21, R22): grupo de N lançamentos `expense` na conta do cartão, criado por RPC.
-- Aditiva: 3 colunas anuláveis, constraints, 2 índices parciais e 3 funções novas. NENHUMA função existente é recriada: os
-- triggers de transactions (invariantes, auditoria, volume da ADR-0033) rodam como estão sobre as linhas inseridas/atualizadas.
-- Erros: P0001 com mensagem = código; 42501 = FORBIDDEN.
--
-- Desenho:
--   * installment_group_id / installment_number / installment_total: todas nulas (lançamento comum) ou todas preenchidas
--     (2 <= total <= 36, 1 <= number <= total). FORA dos grants de insert e update: só as RPCs abaixo as gravam e ninguém as
--     altera depois (select é de tabela, então as colunas novas são legíveis).
--   * create_installment_purchase: valida no banco, divide o total com private.allocate_cents (pesos iguais, D13), calcula as
--     datas com private.recurrence_occurrence (mensal, a partir da data da compra, D12) e insere as N linhas numa única
--     instrução (atômica). Parcela com data <= hoje entra `paid`; futura entra `pending`.
--   * post_due_installments: pending -> paid das parcelas cuja data chegou, mantendo a data (exceção à D6, só para parcelas).
--   * cancel_installment_remaining: pending -> canceled das parcelas pendentes do grupo.
--   * Excluir a compra inteira e editar descrição/categoria/responsável/observações do grupo NÃO precisam de RPC: são UPDATEs
--     diretos (RLS + triggers existentes) em todas as linhas não canceladas e não excluídas do grupo, numa só instrução.

-- 1 · Colunas, constraints e índices ---------------------------------------------------------------------------------
alter table public.transactions
  add column installment_group_id uuid null,
  add column installment_number smallint null,
  add column installment_total smallint null;

-- NOT VALID + VALIDATE: o ALTER não varre a tabela com lock exclusivo; todas as linhas existentes têm as três colunas nulas,
-- então a validação não pode falhar (varredura com SHARE UPDATE EXCLUSIVE, sem bloquear escrita).
alter table public.transactions
  add constraint transactions_installment_shape_check check (
    (installment_group_id is null and installment_number is null and installment_total is null)
    or (installment_group_id is not null and installment_number is not null and installment_total is not null
        and installment_total between 2 and 36
        and installment_number between 1 and installment_total)
  ) not valid;
alter table public.transactions validate constraint transactions_installment_shape_check;

-- Unicidade da posição no grupo. Índice único PARCIAL (equivale a unique (installment_group_id, installment_number), pois NULLs
-- nunca colidem) para não indexar as linhas sem parcelamento (quase todas). Também serve às consultas por grupo (cancelar,
-- excluir e editar a compra: where installment_group_id = $1).
create unique index transactions_installment_number_key
  on public.transactions (installment_group_id, installment_number) where installment_group_id is not null;

-- Consulta que justifica: post_due_installments, a cada acesso ao app:
--   where family_id = $1 and installment_group_id is not null and status = 'pending' and deleted_at is null
--     and transaction_date <= hoje order by transaction_date, id limit 500.
-- Indexa só parcelas pendentes (pequeno; some da lista ao virar paid/canceled). transactions_pending_date_idx também
-- atenderia, mas misturaria os compromissos e as ocorrências de série, que não são parcelas.
create index transactions_installment_due_idx
  on public.transactions (family_id, transaction_date)
  where installment_group_id is not null and status = 'pending' and deleted_at is null;

-- 2 · create_installment_purchase ------------------------------------------------------------------------------------
-- Devolve o id do grupo. Chave de idempotência só na 1ª parcela (unique (family_id, idempotency_key) já existe): repetir a
-- chamada com a mesma chave devolve o grupo existente sem criar nada. Qualquer integrante ativo da família pode chamar
-- (como no insert direto). Ordem de validação: autenticação, família, entrada, chave, conta, data, valor mínimo; categoria,
-- responsável e conta arquivada são validados pelos triggers existentes (CATEGORY_TYPE_MISMATCH, CATEGORY_ARCHIVED,
-- INVALID_INPUT, ACCOUNT_ARCHIVED, DATE_BEFORE_OPENING_BALANCE) e pelas FKs compostas (23503 para objeto de outra família).
create function public.create_installment_purchase(
  p_account_id uuid,
  p_category_id uuid,
  p_assigned_member_id uuid,
  p_description text,
  p_total_amount numeric,
  p_installments integer,
  p_purchase_date date,
  p_notes text,
  p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_today date := private.today();
  v_acc public.accounts;
  v_group uuid;
  v_amounts numeric[];
  v_first uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- entrada
  if p_account_id is null or p_category_id is null or p_description is null or p_total_amount is null
     or p_installments is null or p_purchase_date is null
     or p_installments < 2 or p_installments > 36
     or p_total_amount = 'NaN'::numeric or p_total_amount <= 0 or p_total_amount > 99999999.99
     or p_total_amount <> round(p_total_amount, 2)
     or char_length(btrim(p_description)) not between 1 and 120
     or (p_notes is not null and char_length(p_notes) > 1000) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- idempotência: a chave só existe na 1ª parcela do grupo
  if p_idempotency_key is not null then
    select t.installment_group_id into v_group
    from public.transactions t
    where t.family_id = v_family and t.idempotency_key = p_idempotency_key;
    if found then
      if v_group is null then
        raise exception 'INVALID_INPUT' using errcode = 'P0001';  -- chave já usada por um lançamento comum
      end if;
      return v_group;
    end if;
  end if;

  -- conta: da família e de cartão (conta de outra família é invisível aqui: NOT_FOUND)
  select * into v_acc from public.accounts a where a.id = p_account_id and a.family_id = v_family;
  if v_acc.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_acc.type <> 'credit_card' then
    raise exception 'INSTALLMENT_REQUIRES_CREDIT_CARD' using errcode = 'P0001';
  end if;

  if p_purchase_date > v_today then
    raise exception 'FUTURE_DATE_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  -- cada parcela precisa de pelo menos 1 centavo
  if p_total_amount * 100 < p_installments then
    raise exception 'INSTALLMENT_AMOUNT_TOO_SMALL' using errcode = 'P0001';
  end if;

  -- D13 com pesos iguais: a sobra vai 1 centavo por vez às primeiras parcelas; Σ = total
  v_amounts := private.allocate_cents(p_total_amount, array_fill(1::numeric, array[p_installments]));
  v_group := gen_random_uuid();

  -- Uma única instrução (atômica). Os triggers existentes rodam por linha (invariantes, volume ADR-0033, auditoria).
  insert into public.transactions (
    family_id, type, account_id, category_id, assigned_member_id, created_by, description, amount,
    transaction_date, status, notes, idempotency_key, installment_group_id, installment_number, installment_total
  )
  select
    v_family, 'expense', p_account_id, p_category_id, p_assigned_member_id, v_uid, p_description, v_amounts[k],
    d.dt, case when d.dt <= v_today then 'paid' else 'pending' end, p_notes,
    case when k = 1 then p_idempotency_key end, v_group, k::smallint, p_installments::smallint
  from generate_series(1, p_installments) as k
  cross join lateral (select private.recurrence_occurrence(p_purchase_date, 'monthly', 1::smallint, k - 1) as dt) d
  order by k;

  select t.id into v_first
  from public.transactions t
  where t.installment_group_id = v_group and t.installment_number = 1;

  -- um evento por grupo, sem descrição nem notas; entity_id = 1ª parcela
  perform private.log_audit(
    v_family, 'transaction', v_first, 'transaction.installments_created',
    jsonb_build_object(
      'group_id', v_group,
      'installment_total', p_installments,
      'total_amount', p_total_amount::text,
      'first_date', to_char(p_purchase_date, 'YYYY-MM-DD')
    )
  );

  return v_group;
end;
$$;

-- 3 · post_due_installments ------------------------------------------------------------------------------------------
-- pending -> paid das parcelas da família do chamador cuja data chegou (<= hoje), MANTENDO a data. Até 500 por chamada,
-- com skip locked (outra chamada simultânea pega outras linhas) e falha isolada por linha (sub-bloco): o que falhar fica
-- pendente e é tentado na chamada seguinte. Parcela de cartão arquivado nem entra na seleção (não ocupa as 500 vagas).
-- O trigger de status existente grava transaction.paid. Devolve quantas foram lançadas.
create function public.post_due_installments()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_today date := private.today();
  v_row record;
  v_n integer;
  v_total integer := 0;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  for v_row in
    select t.id
    from public.transactions t
    where t.family_id = v_family
      and t.installment_group_id is not null
      and t.status = 'pending' and t.deleted_at is null
      and t.transaction_date <= v_today
      and exists (
        select 1 from public.accounts a
        where a.id = t.account_id and a.family_id = t.family_id and a.is_active
      )
    order by t.transaction_date, t.id
    limit 500
    for update of t skip locked
  loop
    begin
      update public.transactions
      set status = 'paid'
      where id = v_row.id and family_id = v_family and status = 'pending';
      get diagnostics v_n = row_count;
      v_total := v_total + v_n;
    exception when others then
      null;  -- o sub-bloco desfez esta linha; ela segue pendente
    end;
  end loop;

  return v_total;
end;
$$;

-- 4 · cancel_installment_remaining -----------------------------------------------------------------------------------
-- pending -> canceled das parcelas pendentes e não excluídas do grupo (devolução, quitação). As efetivadas ficam.
-- Autorização: owner/admin ou autor do grupo (mesma regra de cancel_pending_transaction). Idempotente: sem pendentes, devolve 0.
-- NOT_FOUND se o grupo não existe na família do chamador (ou está todo excluído). O trigger existente grava transaction.canceled
-- por parcela.
create function public.cancel_installment_remaining(p_group_id uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_family uuid;
  v_author uuid;
  v_n integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  v_family := private.current_family_id();
  if v_family is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_group_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select t.created_by into v_author
  from public.transactions t
  where t.installment_group_id = p_group_id and t.family_id = v_family and t.deleted_at is null
  order by t.installment_number
  limit 1;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if not private.has_family_role(v_family, array['owner', 'admin']) and v_author <> v_uid then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  with locked as (
    select t.id
    from public.transactions t
    where t.installment_group_id = p_group_id and t.family_id = v_family
      and t.status = 'pending' and t.deleted_at is null
    order by t.installment_number
    for update of t
  )
  update public.transactions t
  set status = 'canceled'
  from locked
  where t.id = locked.id;
  get diagnostics v_n = row_count;

  return v_n;
end;
$$;

revoke execute on function public.create_installment_purchase(uuid, uuid, uuid, text, numeric, integer, date, text, uuid)
  from public, anon;
revoke execute on function public.post_due_installments() from public, anon;
revoke execute on function public.cancel_installment_remaining(uuid) from public, anon;
grant execute on function public.create_installment_purchase(uuid, uuid, uuid, text, numeric, integer, date, text, uuid)
  to authenticated;
grant execute on function public.post_due_installments() to authenticated;
grant execute on function public.cancel_installment_remaining(uuid) to authenticated;

-- DOWN (manual), nesta ordem:
--   drop function public.cancel_installment_remaining(uuid);
--   drop function public.post_due_installments();
--   drop function public.create_installment_purchase(uuid, uuid, uuid, text, numeric, integer, date, text, uuid);
--   drop index public.transactions_installment_due_idx;
--   drop index public.transactions_installment_number_key;
--   alter table public.transactions drop constraint transactions_installment_shape_check,
--     drop column installment_group_id, drop column installment_number, drop column installment_total;
--   (DESTRUTIVO só para o agrupamento: as linhas continuam despesas válidas e `paid`/`pending`, mas as parcelas pendentes
--   deixam de ser lançadas sozinhas na data e o vínculo entre as parcelas de uma compra se perde. Só com autorização
--   explícita, depois de o app parar de chamar as RPCs.)
-- Efeito em dados existentes: nenhum. Colunas novas nulas, sem default e sem backfill (ADD COLUMN anulável é instantâneo; lock
--   ACCESS EXCLUSIVE só pelo instante do catálogo). A validação da CHECK varre a tabela sem bloquear escrita (volume não medido
--   neste ambiente). CREATE INDEX (não concorrente: a CLI roda a migration numa transação) bloqueia escrita em transactions
--   enquanto constrói; os dois índices são parciais em coluna toda nula, então varrem a tabela e gravam zero entradas.
