-- Núcleo · Etapa 3 · categorias por família com padrões copiados. Contrato: docs/contracts/etapa-3.md §3.1; ADR-0010, ADR-0019.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete restrict,
  name text not null
    constraint categories_name_check check (char_length(btrim(name)) between 1 and 50),
  type text not null  -- imutável: fora do grant de update
    constraint categories_type_check check (type in ('income', 'expense')),
  color text not null
    constraint categories_color_check check (color in ('chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6')),
  icon text not null
    constraint categories_icon_check check (icon ~ '^[a-z0-9-]{1,40}$'),  -- a allowlist é do app
  parent_id uuid null,
  is_default boolean not null default false,
  archived_at timestamptz null,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_family_id_id_key unique (family_id, id),  -- alvo de FKs compostas
  constraint categories_parent_fk foreign key (family_id, parent_id)
    references public.categories (family_id, id) on delete restrict
);

-- Nome único entre as ativas por (tipo, pai), sem diferenciar maiúsculas; pai nulo conta como valor (nulls not distinct).
create unique index categories_family_name_active_key
  on public.categories (family_id, type, parent_id, lower(btrim(name))) nulls not distinct
  where archived_at is null;

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();

alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated;
grant select on public.categories to authenticated;
grant insert (family_id, name, type, color, icon, parent_id) on public.categories to authenticated;
grant update (name, color, icon, parent_id, archived_at) on public.categories to authenticated;
grant delete on public.categories to authenticated;

create policy categories_select on public.categories
  for select to authenticated
  using (private.is_family_member(family_id));

create policy categories_insert on public.categories
  for insert to authenticated
  with check (
    private.has_family_role(family_id, array['owner', 'admin'])
    and created_by = (select auth.uid())
  );

create policy categories_update on public.categories
  for update to authenticated
  using (private.has_family_role(family_id, array['owner', 'admin']))
  with check (private.has_family_role(family_id, array['owner', 'admin']));

create policy categories_delete on public.categories
  for delete to authenticated
  using (private.has_family_role(family_id, array['owner', 'admin']));

-- Invariantes de hierarquia (1 nível, mesmo tipo, pai ativo). Roda com o papel do chamador: pai de outra família
-- é invisível (RLS) e a checagem é pulada para a FK composta responder 23503.
create function private.categories_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_parent public.categories;
begin
  if new.parent_id is not null and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    if new.parent_id = new.id then
      raise exception 'INVALID_CATEGORY_PARENT' using errcode = 'P0001';
    end if;
    select * into v_parent from public.categories c
    where c.id = new.parent_id and c.family_id = new.family_id;
    if v_parent.id is not null
       and (v_parent.parent_id is not null or v_parent.type <> new.type or v_parent.archived_at is not null) then
      raise exception 'INVALID_CATEGORY_PARENT' using errcode = 'P0001';
    end if;
    -- uma categoria com filhos não vira filha
    if tg_op = 'UPDATE' and exists (
      select 1 from public.categories c where c.parent_id = new.id and c.family_id = new.family_id
    ) then
      raise exception 'INVALID_CATEGORY_PARENT' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.archived_at is null and new.archived_at is not null and exists (
    select 1 from public.categories c
    where c.parent_id = new.id and c.family_id = new.family_id and c.archived_at is null
  ) then
    raise exception 'CATEGORY_HAS_CHILDREN' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.categories_before_write() from public, anon, authenticated;

create trigger categories_before_write_biu
  before insert or update on public.categories
  for each row execute function private.categories_before_write();

create function private.categories_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    perform private.log_audit(new.family_id, 'category', new.id, 'category.archived', '{}'::jsonb);
  end if;
  return null;
end;
$$;
revoke execute on function private.categories_audit() from public, anon, authenticated;

create trigger categories_audit_au
  after update on public.categories
  for each row execute function private.categories_audit();

-- Seed das categorias padrão (spec §7.5). Sem grant: só create_family e o backfill chamam.
-- Idempotente: família que já tem qualquer categoria não é tocada. created_by = quem criou a família.
create function private.seed_default_categories(p_family_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.categories c where c.family_id = p_family_id) then
    return;
  end if;
  insert into public.categories (family_id, name, type, color, icon, is_default, created_by)
  select f.id, d.name, d.type, d.color, d.icon, true, f.created_by
  from public.families f
  cross join (values
    ('Moradia', 'expense', 'chart-1', 'house'),
    ('Alimentação', 'expense', 'chart-3', 'utensils'),
    ('Transporte', 'expense', 'chart-2', 'car'),
    ('Saúde', 'expense', 'chart-5', 'heart-pulse'),
    ('Educação', 'expense', 'chart-4', 'graduation-cap'),
    ('Lazer', 'expense', 'chart-1', 'party-popper'),
    ('Assinaturas', 'expense', 'chart-2', 'repeat'),
    ('Contas domésticas', 'expense', 'chart-3', 'zap'),
    ('Compras', 'expense', 'chart-5', 'shopping-bag'),
    ('Outros', 'expense', 'chart-6', 'ellipsis'),
    ('Salário', 'income', 'chart-1', 'briefcase'),
    ('Renda extra', 'income', 'chart-3', 'hand-coins'),
    ('Freelance', 'income', 'chart-2', 'laptop'),
    ('Rendimentos', 'income', 'chart-4', 'trending-up'),
    ('Reembolsos', 'income', 'chart-5', 'undo-2'),
    ('Outros', 'income', 'chart-6', 'ellipsis')
  ) as d (name, type, color, icon)
  where f.id = p_family_id;
end;
$$;
revoke execute on function private.seed_default_categories(uuid) from public, anon, authenticated;

-- create_family: mesma função da Etapa 2 + seed das categorias depois de inserir o owner.
-- Atenção: o `exception when unique_violation` mascara qualquer violação; o seed é idempotente e não duplica.
create or replace function public.create_family(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_family_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if char_length(v_name) not between 1 and 80 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.family_members m where m.user_id = v_uid and m.status = 'active') then
    raise exception 'ALREADY_IN_FAMILY' using errcode = 'P0001';
  end if;

  insert into public.families (name, created_by) values (v_name, v_uid) returning id into v_family_id;
  insert into public.family_members (family_id, user_id, role) values (v_family_id, v_uid, 'owner');

  perform private.seed_default_categories(v_family_id);

  perform private.log_audit(v_family_id, 'family', v_family_id, 'family.created', '{}'::jsonb);
  return v_family_id;
exception
  when unique_violation then  -- corrida de duplo clique no índice de família ativa
    raise exception 'ALREADY_IN_FAMILY' using errcode = 'P0001';
end;
$$;

-- Backfill: famílias existentes sem categorias recebem os padrões (reaplicar não duplica).
select private.seed_default_categories(f.id)
from public.families f
where not exists (select 1 from public.categories c where c.family_id = f.id);

-- DOWN (manual): restaurar create_family da migration 20261023100600 (sem o perform do seed);
--   drop function private.seed_default_categories(uuid); drop table public.categories (só sem transactions).
-- Efeito em dados existentes: famílias existentes ganham 16 categorias padrão (idempotente); nada é alterado ou apagado.
