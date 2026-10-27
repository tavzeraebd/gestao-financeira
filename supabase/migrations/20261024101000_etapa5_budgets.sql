-- Núcleo · Etapa 5 · orçamentos mensais (D14; ADR-0024). Contrato: docs/contracts/etapa-5.md §3.1.
-- Erros dos triggers: P0001 com mensagem = código; 42501 = FORBIDDEN. Sem auditoria (ADR-0024 §5).

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  category_id uuid null,  -- null = todas as despesas; imutável: fora do grant de update
  amount_limit numeric(14, 2) not null
    constraint budgets_amount_limit_check check (amount_limit > 0 and amount_limit <> 'NaN'::numeric and amount_limit <= 99999999.99),
  start_month date not null  -- imutável
    constraint budgets_start_month_check check (extract(day from start_month) = 1 and start_month >= date '2000-01-01'),
  end_month date null
    constraint budgets_end_month_check check (end_month is null or (extract(day from end_month) = 1 and end_month >= start_month)),
  archived_at timestamptz null,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_category_fk foreign key (family_id, category_id)
    references public.categories (family_id, id) on delete restrict
);

-- Um orçamento ativo por categoria da família, inclusive "todas as despesas" (category_id nulo).
create unique index budgets_family_category_active_key
  on public.budgets (family_id, category_id) nulls not distinct where archived_at is null;

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function private.set_updated_at();

alter table public.budgets enable row level security;
revoke all on public.budgets from anon, authenticated;
grant select on public.budgets to authenticated;
grant insert (family_id, category_id, amount_limit, start_month, end_month) on public.budgets to authenticated;
grant update (amount_limit, end_month, archived_at) on public.budgets to authenticated;
-- sem delete: orçamento se arquiva

create policy budgets_select on public.budgets
  for select to authenticated
  using (private.is_family_member(family_id));

create policy budgets_insert on public.budgets
  for insert to authenticated
  with check (private.has_family_role(family_id, array['owner', 'admin']) and created_by = (select auth.uid()));

create policy budgets_update on public.budgets
  for update to authenticated
  using (private.has_family_role(family_id, array['owner', 'admin']))
  with check (private.has_family_role(family_id, array['owner', 'admin']));

-- Categoria de despesa (insert); ativa no insert e no desarquivamento. Referência de outra família é invisível: a FK responde 23503.
create function private.budgets_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_insert boolean := (tg_op = 'INSERT');
  v_unarchive boolean := (tg_op = 'UPDATE' and old.archived_at is not null and new.archived_at is null);
  v_cat public.categories;
begin
  if new.category_id is not null and (v_insert or v_unarchive) then
    select * into v_cat from public.categories c where c.id = new.category_id and c.family_id = new.family_id;
    if v_cat.id is not null then
      if v_cat.type <> 'expense' then
        raise exception 'CATEGORY_TYPE_MISMATCH' using errcode = 'P0001';
      end if;
      if v_cat.archived_at is not null then
        raise exception 'CATEGORY_ARCHIVED' using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function private.budgets_before_write() from public, anon, authenticated;

create trigger budgets_before_write_biu
  before insert or update on public.budgets
  for each row execute function private.budgets_before_write();

-- D14: realizado e comprometido por orçamento visível (inclusive arquivado) e por mês civil de p_from_month a p_to_month
-- (até 12), só nos meses dentro da vigência. Realizado = despesas pagas, não excluídas, estorno com sinal invertido, na
-- categoria ou nas filhas (nula = todas); comprometido = despesas pendentes, não excluídas, no mesmo recorte.
-- security invoker (RLS vale); montantes em text; acumuladores numeric sem typmod.
create function public.budget_progress(p_from_month date, p_to_month date)
returns table (budget_id uuid, month date, spent text, committed text)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_first date;
  v_last date;
  v_months integer;
begin
  if p_from_month is null or p_to_month is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  v_first := p_from_month - (extract(day from p_from_month)::integer - 1);
  v_last := p_to_month - (extract(day from p_to_month)::integer - 1);
  v_months := (extract(year from v_last)::integer - extract(year from v_first)::integer) * 12
              + extract(month from v_last)::integer - extract(month from v_first)::integer + 1;
  if v_months < 1 or v_months > 12 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  return query
  select b.id,
         m.first_day,
         round(coalesce(sum(case when x.status = 'paid'
                                 then (case when x.reversal_of_id is null then x.amount else -x.amount end) end), 0), 2)::text,
         round(coalesce(sum(case when x.status = 'pending' then x.amount end), 0), 2)::text
  from public.budgets b
  cross join lateral (
    select (v_first + make_interval(months => i))::date as first_day from generate_series(0, v_months - 1) as i
  ) m
  left join (
    select t.status, t.reversal_of_id, t.amount, t.transaction_date, t.category_id, c.parent_id
    from public.transactions t
    left join public.categories c on c.id = t.category_id and c.family_id = t.family_id
    where t.family_id = (select private.current_family_id())
      and t.type = 'expense' and t.deleted_at is null and t.status in ('paid', 'pending')
      and t.transaction_date >= v_first
      and t.transaction_date < (v_last + interval '1 month')::date
  ) x
    on x.transaction_date >= m.first_day
   and x.transaction_date < (m.first_day + interval '1 month')::date
   and (b.category_id is null or x.category_id = b.category_id or x.parent_id = b.category_id)
  where b.family_id = (select private.current_family_id())
    and m.first_day >= b.start_month
    and (b.end_month is null or m.first_day <= b.end_month)
  group by b.id, m.first_day
  order by m.first_day, b.id;
end;
$$;

revoke execute on function public.budget_progress(date, date) from public, anon;
grant execute on function public.budget_progress(date, date) to authenticated;

-- DOWN (manual): drop function public.budget_progress(date, date); drop table public.budgets (apaga orçamentos: destrutivo,
--   só com autorização); drop function private.budgets_before_write().
-- Efeito em dados existentes: nenhum (tabela e função novas).
