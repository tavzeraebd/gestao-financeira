-- Núcleo · Etapa 3 · contas (accounts) e private.today(). Contrato: docs/contracts/etapa-3.md §3.1; ADR-0013, ADR-0018.
-- O trigger de data do saldo inicial (depende de transactions) está em 20261024100200_etapa3_transactions.sql.

-- "Hoje" é a data civil em America/Sao_Paulo (nunca current_date).
create function private.today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;
revoke execute on function private.today() from public, anon;
grant execute on function private.today() to authenticated;  -- usada em DEFAULT e em triggers com o papel do chamador

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  name text not null
    constraint accounts_name_check check (char_length(btrim(name)) between 1 and 60),
  type text not null  -- imutável: fora do grant de update
    constraint accounts_type_check check (
      type in ('checking', 'savings', 'cash', 'credit_card', 'digital_wallet', 'investment', 'other')
    ),
  opening_balance numeric(14, 2) not null default 0,
  opening_balance_date date not null default private.today(),
  institution_name text null
    constraint accounts_institution_name_check check (
      institution_name is null or char_length(btrim(institution_name)) between 1 and 80
    ),
  credit_limit numeric(14, 2) null,
  statement_closing_day smallint null,
  statement_due_day smallint null,
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_family_id_id_key unique (family_id, id),  -- alvo de FKs compostas
  -- cartão é passivo: o saldo inicial é a dívida (<= 0)
  constraint accounts_card_opening_balance_check check (type <> 'credit_card' or opening_balance <= 0),
  constraint accounts_credit_limit_check check (
    credit_limit is null or (credit_limit > 0 and type = 'credit_card')
  ),
  -- dias de fechamento/vencimento: ambos presentes se e somente se for cartão
  constraint accounts_statement_days_presence_check check (
    (type = 'credit_card') = (statement_closing_day is not null and statement_due_day is not null)
    and (type = 'credit_card' or (statement_closing_day is null and statement_due_day is null))
  ),
  constraint accounts_statement_days_range_check check (
    (statement_closing_day is null or statement_closing_day between 1 and 31)
    and (statement_due_day is null or statement_due_day between 1 and 31)
  )
);

-- Nome único entre as contas ativas da família (sem diferenciar maiúsculas); também serve à listagem por família.
create unique index accounts_family_name_active_key
  on public.accounts (family_id, lower(btrim(name))) where is_active;

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function private.set_updated_at();

alter table public.accounts enable row level security;
revoke all on public.accounts from anon, authenticated;
grant select on public.accounts to authenticated;
grant insert (family_id, name, type, opening_balance, opening_balance_date, institution_name, credit_limit,
              statement_closing_day, statement_due_day) on public.accounts to authenticated;
grant update (name, opening_balance, opening_balance_date, institution_name, credit_limit,
              statement_closing_day, statement_due_day, is_active) on public.accounts to authenticated;
-- sem delete: conta se arquiva

create policy accounts_select on public.accounts
  for select to authenticated
  using (private.is_family_member(family_id));

create policy accounts_insert on public.accounts
  for insert to authenticated
  with check (
    private.has_family_role(family_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );

create policy accounts_update on public.accounts
  for update to authenticated
  using (private.has_family_role(family_id, array['owner', 'admin']))
  with check (private.has_family_role(family_id, array['owner', 'admin']));

-- Auditoria: saldo inicial (valores em text), arquivar e reativar. Sem nome nem instituição na metadata.
create function private.accounts_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.opening_balance is distinct from old.opening_balance
     or new.opening_balance_date is distinct from old.opening_balance_date then
    perform private.log_audit(
      new.family_id, 'account', new.id, 'account.opening_balance_changed',
      jsonb_build_object(
        'old', jsonb_build_object('amount', old.opening_balance::text, 'date', to_char(old.opening_balance_date, 'YYYY-MM-DD')),
        'new', jsonb_build_object('amount', new.opening_balance::text, 'date', to_char(new.opening_balance_date, 'YYYY-MM-DD'))
      )
    );
  end if;
  if old.is_active and not new.is_active then
    perform private.log_audit(new.family_id, 'account', new.id, 'account.archived', '{}'::jsonb);
  elsif not old.is_active and new.is_active then
    perform private.log_audit(new.family_id, 'account', new.id, 'account.reactivated', '{}'::jsonb);
  end if;
  return null;
end;
$$;
revoke execute on function private.accounts_audit() from public, anon, authenticated;

create trigger accounts_audit_au
  after update on public.accounts
  for each row execute function private.accounts_audit();

-- DOWN (manual): drop table public.accounts; drop function private.accounts_audit(); drop function private.today();
--   (só possível antes de existir public.transactions; depois, na ordem inversa das migrations da Etapa 3).
-- Efeito em dados existentes: nenhum (tabela nova).
