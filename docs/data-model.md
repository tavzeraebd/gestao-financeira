# Modelo de dados — Núcleo

> **Atenção (2026-10-24):** §5.1–5.9 e §4.8 ainda descrevem a Etapa 0. Onde divergirem, valem os contratos
> `contracts/etapa-3.md` a `etapa-7.md` e as ADRs 0018–0030 (ex.: cores `chart-1..6`, sem RPCs
> `create_transfer`/`reverse_transaction`, recorrências só de receita/despesa, orçamento só mensal, aporte de meta sem
> `transaction_id`, notificações com `data` em vez de `title`/`message`, sem `update_family`). A §2 já está atualizada.
> O texto das §5.x é atualizado pelo architect na Fase C de cada etapa.

Versão 1.0 (Etapa 0). Postgres 17 (Supabase local). Nomes em inglês (spec §5). Este documento é a
especificação; as migrations em `supabase/migrations/` são a implementação (dono: agente database).
Divergências da implementação voltam para este documento via orchestrator.

## 1. Convenções

| Regra | Decisão |
|---|---|
| PK | `id uuid primary key default gen_random_uuid()` (exceto `profiles.id` = `auth.users.id`) |
| Instantes | `timestamptz`; `created_at`/`updated_at not null default now()`; `updated_at` por trigger `private.set_updated_at()` |
| Datas financeiras | `date` (dia civil no fuso `America/Sao_Paulo`, constante da aplicação) |
| Dinheiro | `numeric(14,2)` (até 999.999.999.999,99); sempre `> 0` em lançamentos — o sinal vem do `type` ([ADR-0003](adr/0003-dinheiro-centavos-numeric.md)) |
| Enumerações | `text` + `CHECK (col in (...))` (mais fácil de evoluir que `enum`) |
| Textos livres | `CHECK (char_length(btrim(col)) between 1 and N)` |
| Isolamento | toda tabela de domínio tem `family_id not null`; tabelas referenciadas por outras da mesma família expõem `unique (family_id, id)` e são referenciadas por **FK composta** `(family_id, x_id) → t(family_id, id)` — impede referência cruzada entre famílias pela própria estrutura |
| Exclusão | `on delete restrict` por padrão; **nenhuma cascata em histórico financeiro**; lançamentos usam exclusão lógica (`deleted_at`, `deleted_by`); cadastros usam arquivamento (`is_active`/`archived_at`) |
| Schemas | `public` (exposto pela API; só tabelas + RPCs públicas), `private` (helpers e triggers; **não** exposto; `grant usage` a `authenticated` só para RLS avaliar helpers), `extensions` (pgcrypto, pgtap) |
| Funções | toda função `security definer` tem `set search_path = ''` e nomes totalmente qualificados; views usam `with (security_invoker = true)` |
| Grants | por tabela: `revoke all on public.<t> from anon, authenticated;` e depois `grant` mínimo a `authenticated` (incluindo grant por coluna quando o update é parcial). Por **toda** função criada (public e private, inclusive de trigger): `revoke execute ... from public, anon;` e `grant execute ... to authenticated` só quando a API ou uma policy precisa chamá-la |
| API | `config.toml` → `[api] schemas = ["public"]` (sem `graphql_public`) |

## 2. Mapa de entidades por etapa

| Etapa | Tabelas | RPCs / funções |
|---|---|---|
| 2 | `profiles`, `families`, `family_members`, `family_invites`, `audit_events` | `create_family`, `create_family_invite`, `get_invite_preview`, `accept_family_invite`, `revoke_family_invite`; helpers `private.*` |
| 3 | `accounts`, `categories`, `transactions` | `create_transfer`, `reverse_transaction`, `account_balances`, seed de categorias em `create_family` |
| 4 | — | `monthly_cash_flow(p_from, p_to)`, `category_totals(p_from, p_to, p_type)` (invoker, `text`; contrato `etapa-4.md` §3.1, ADR-0020) |
| 5 | `recurrences` (só income/expense; agenda imutável; `next_occurrence_date`, `last_failure_*`, `idempotency_key`; triggers `recurrences_before_write_biu` e `recurrences_after_update_au`), `budgets` (mensal: `start_month`/`end_month`, sem `name`/`period_type`, sem auditoria); `transactions` + `recurrence_id`, `occurrence_date` (`unique`), `due_date` mantido por trigger; trigger `transactions_before_write`/`transactions_audit` redefinidos | definer: `pay_pending_transaction`, `cancel_pending_transaction`, `materialize_recurrences()`; invoker: `pending_summary()`, `budget_progress(p_from_month, p_to_month)`; `private.recurrence_occurrence`, `private.recurrence_first_index` (auxiliar, além do contrato), `private.recurrence_next_on_or_after` (migrations `20261024100700`..`101100`; contrato `etapa-5.md` v1.1 §3.1, ADRs 0022–0024) |
| 6 | `goals` (status `active\|paused\|completed\|canceled`, ícone de lista fechada, sem `current_amount`), `goal_contributions` (reserva, **sem** `transaction_id`; exclusão lógica), `expense_splits` (sem grant de escrita), `settlements` (exclusão lógica) | definer: `set_transaction_splits(p_transaction_id, p_mode, p_shares)`; invoker: `goal_summary(p_from, p_to)`, `member_balances()`, `projected_cash_flow(p_months)`; `private.allocate_cents`, `private.current_member_id()`, `private.rescale_splits`; `transactions` ganha só o trigger `transactions_rescale_splits` (migrations `20261024101200`..`101700`; contrato `etapa-6.md` v1.1 §3.1, ADRs 0025–0027) |
| 7 | `notifications` (`data jsonb`, `dedupe_key` obrigatório) | definer: `change_member_role`, `transfer_ownership`, `remove_family_member`, `leave_family`, `refresh_notifications()`; invoker: `account_flows(p_from, p_to)`, `member_expense_totals(p_from, p_to)`; trigger de auditoria em `families` (sem `update_family`) (contrato `etapa-7.md` §3.1, ADRs 0028–0030) |

Planejamento de cenários (Etapa 6) é **sem persistência** no MVP (cálculo puro no domínio). Contas a
pagar/receber **não** têm tabela própria: são `transactions` com `status = 'pending'`
([ADR-0012](adr/0012-contas-a-pagar-como-transacoes-pendentes.md)).

## 3. Diagrama (relações principais)

```text
auth.users 1─1 profiles 1─N family_members N─1 families
families 1─N family_invites | audit_events | accounts | categories | transactions | recurrences | budgets | goals | notifications
accounts 1─N transactions (account_id, destination_account_id)
categories 1─N categories (parent_id, 1 nível) ; categories 1─N transactions | budgets | recurrences
recurrences 1─N transactions (recurrence_id + occurrence_date)
transactions 1─N transactions (reversal_of_id) ; transactions 1─N expense_splits
goals 1─N goal_contributions   (sem vínculo com transactions: ADR-0025)
family_members 1─N transactions.assigned_member_id | expense_splits | settlements | goal_contributions
```

## 4. Etapa 2 — especificação em nível de DDL

Migrations sugeridas (uma responsabilidade por arquivo, ordem por timestamp):
`..._private_schema_and_helpers_base.sql`, `..._profiles.sql`, `..._families_and_members.sql`,
`..._audit_events.sql`, `..._family_invites.sql`, `..._rls_helpers_and_policies.sql`, `..._rpcs_family.sql`.
O agente database pode reorganizar, desde que o resultado final seja este.

### 4.1 Base

```sql
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
-- pgcrypto já existe no Supabase em "extensions"; garantir:
create extension if not exists pgcrypto with schema extensions;

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
```

### 4.2 `profiles`

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | `references auth.users(id) on delete cascade` |
| display_name | text not null | `check (char_length(btrim(display_name)) between 1 and 80)` |
| avatar_url | text null | `check (avatar_url is null or (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://'))` — sem upload no MVP |
| created_at, updated_at | timestamptz not null default now() | trigger `profiles_set_updated_at` |

Trigger de cadastro:
```sql
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  v_name := left(btrim(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
                                split_part(new.email, '@', 1), 'Usuário')), 80);
  insert into public.profiles (id, display_name) values (new.id, v_name);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
```
`raw_user_meta_data` é controlado pelo usuário: só `display_name` é lido, com trim e corte em 80.
Consequência do `cascade`: excluir o usuário do Auth tentaria remover o profile, mas FKs `restrict` de
`families.created_by`/`family_members.user_id` bloqueiam — exclusão de conta exige processo próprio
(anonimização), fora do escopo atual (pendência LGPD, `roadmap.md`).

Grants/RLS: `grant select on public.profiles to authenticated; grant update (display_name, avatar_url) on public.profiles to authenticated;`
- `profiles_select`: `using (id = (select auth.uid()) or private.shares_family_with(id))`
- `profiles_update_self`: `using (id = (select auth.uid())) with check (id = (select auth.uid()))`
- sem insert/delete (trigger cria; ninguém apaga pela API).

### 4.3 `families`

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | |
| name | text not null | `check (char_length(btrim(name)) between 1 and 80)` |
| base_currency | char(3) not null default 'BRL' | `check (base_currency = 'BRL')` (multi-moeda fora do escopo; relaxar exige ADR) |
| created_by | uuid not null | `references public.profiles(id) on delete restrict` |
| created_at, updated_at | timestamptz | trigger updated_at |

Grants/RLS: `grant select on public.families to authenticated; grant update (name) on public.families to authenticated;`
- `families_select`: `using (private.is_family_member(id))`
- `families_update_owner`: `using (private.has_family_role(id, array['owner'])) with check (private.has_family_role(id, array['owner']))`
- sem insert (só `create_family`), sem delete (exclusão de família fora do escopo).

### 4.4 `family_members`

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | `unique (family_id, id)` (alvo de FKs compostas) |
| family_id | uuid not null | `references public.families(id) on delete restrict` |
| user_id | uuid not null | `references public.profiles(id) on delete restrict` |
| role | text not null | `check (role in ('owner','admin','member'))` |
| status | text not null default 'active' | `check (status in ('active','removed','left'))` |
| joined_at | timestamptz not null default now() | |
| ended_at | timestamptz null | `check ((status = 'active') = (ended_at is null))` |
| created_at, updated_at | timestamptz | trigger updated_at |

Índices/uniques:
- `create unique index family_members_one_active_family_per_user on public.family_members (user_id) where status = 'active';` — **uma família ativa por usuário no MVP** ([ADR-0008](adr/0008-uma-familia-ativa-por-usuario.md)).
- `create unique index family_members_one_owner on public.family_members (family_id) where role = 'owner' and status = 'active';`
- `create index family_members_family_active on public.family_members (family_id) where status = 'active';`

Saída/remoção não apaga a linha: muda `status` e `ended_at` (histórico). Reentrada cria linha nova.

Grants/RLS: `grant select on public.family_members to authenticated;` **nenhum** insert/update/delete para
`authenticated` (nem policy, nem grant) — papel e vínculo só mudam por RPC (impede auto-promoção).
- `family_members_select`: `using (private.is_family_member(family_id))`

### 4.5 `family_invites`

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | |
| family_id | uuid not null | FK families restrict; índice `(family_id, created_at desc)` |
| role | text not null default 'member' | `check (role in ('admin','member'))` (convite nunca cria owner) |
| token_hash | text not null unique | `check (token_hash ~ '^[0-9a-f]{64}$')` — SHA-256 hex do token; o token em claro **não** é armazenado |
| invited_email | text null | `check (invited_email is null or (invited_email = lower(btrim(invited_email)) and char_length(invited_email) between 3 and 254))` — se preenchido, só esse e-mail aceita |
| created_by | uuid not null | FK profiles restrict |
| expires_at | timestamptz not null | `check (expires_at > created_at)`; definido pela RPC = `now() + interval '7 days'` |
| accepted_at / accepted_by | timestamptz null / uuid null FK profiles | `check ((accepted_at is null) = (accepted_by is null))` |
| revoked_at / revoked_by | timestamptz null / uuid null FK profiles | `check ((revoked_at is null) = (revoked_by is null))`; `check (accepted_at is null or revoked_at is null)` |
| created_at | timestamptz not null default now() | |

Estado derivado (não armazenado): `revoked` se `revoked_at` ≠ null; `accepted` se `accepted_at` ≠ null;
`expired` se `expires_at <= now()`; senão `pending`.

Grants/RLS — select por **coluna**, sem `token_hash`:
`grant select (id, family_id, role, invited_email, created_by, expires_at, accepted_at, accepted_by, revoked_at, revoked_by, created_at) on public.family_invites to authenticated;`
- `family_invites_select_managers`: `using (private.has_family_role(family_id, array['owner','admin']))`
- sem insert/update/delete pela API (só RPC). Consequência: `select *` falha — repositories listam colunas.

### 4.6 `audit_events`

| Coluna | Tipo | Regra |
|---|---|---|
| id | uuid PK | |
| family_id | uuid not null | FK families restrict; índice `(family_id, created_at desc)` |
| actor_user_id | uuid null | FK profiles restrict; null = sistema |
| entity_type | text not null | `check (entity_type ~ '^[a-z_]{1,40}$')` |
| entity_id | uuid null | |
| action | text not null | `check (action ~ '^[a-z_]{1,40}\.[a-z_]{1,40}$')` |
| metadata | jsonb not null default '{}' | `check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096)` |
| created_at | timestamptz not null default now() | |

Append-only: nenhum update/delete por ninguém via API. Escrita só por `private.log_audit(...)`, chamada
dentro de RPCs/triggers `security definer`.
```sql
create function private.log_audit(p_family_id uuid, p_entity_type text, p_entity_id uuid, p_action text, p_metadata jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events (family_id, actor_user_id, entity_type, entity_id, action, metadata)
  values (p_family_id, auth.uid(), p_entity_type, p_entity_id, p_action, coalesce(p_metadata, '{}'::jsonb));
$$;
revoke all on function private.log_audit(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
```
Grants/RLS: `grant select on public.audit_events to authenticated;`
- `audit_events_select_managers`: `using (private.has_family_role(family_id, array['owner','admin']))`

Eventos auditados (catálogo fechado; metadata **sem** e-mail, nome, token, descrição, observação):

| action | Etapa | metadata |
|---|---|---|
| `family.created` | 2 | `{}` |
| `invite.created` | 2 | `{ "role", "has_email_binding": bool, "expires_at" }` |
| `invite.revoked` | 2 | `{ "invite_id" }` |
| `member.joined` | 2 | `{ "member_id", "role", "invite_id" }` |
| `family.updated` | 7 | `{ "fields": ["name"] }` (trigger em `families`) |
| `member.role_changed` | 7 | `{ "member_id", "from_role", "to_role" }` |
| `member.removed` / `member.left` | 7 | `{ "member_id", "from_role", "revoked_invites": n }` |
| `family.ownership_transferred` | 7 | `{ "member_id" (novo owner), "previous_owner_member_id", "from_role" }` |
| `invite.revoked` (por saída) | 7 | `{ "invite_id", "reason": "member_ended" }` |
| `goal.status_changed` / `goal.updated` | 6 | `{ "from", "to" }` / `{ "changed": [...], "old": {target_amount,target_date}, "new": {...} }` (sem nome nem descrição) |
| `goal_contribution.deleted` | 6 | `{ "goal_id", "kind", "amount" }` |
| `transaction.splits_changed` | 6 | `{ "mode": "equal\|amounts\|none", "parts": n }` (sem ids de pessoas nem valores por pessoa). Só quando algo mudou: `none` sem parcelas e conjunto idêntico ao atual não geram evento (SEC-23, `20261024101700`) |
| `settlement.created` / `settlement.deleted` | 6 | `{ "amount", "settlement_date" }` |
| `transaction.updated` | 3 | `{ "changed": [...], "old": {amount,transaction_date,account_id,category_id,status}, "new": {...} }` (só campos financeiros; sem descrição/notas) |
| `transaction.deleted` / `transaction.canceled` | 3/5 | `{ "type", "amount", "transaction_date" }` (`canceled` só em `pending → canceled`, pela RPC) |
| `transaction.reversed` | 3 | `{ "reversal_id", "amount", "transaction_date" }` |
| `transaction.paid` | 5 | `{ "amount", "transaction_date" (data do pagamento), "due_date", "changed": [...], "old": {...} }`; `changed` ⊆ `amount, account_id`; `old` só traz o que mudou; grava **só** este evento (não `transaction.updated`) em `pending → paid` |
| `account.archived` / `account.reactivated` / `account.opening_balance_changed` | 3 | `{ "old", "new" }` quando houver valor |
| `category.archived` | 3 | `{}` |
| `recurrence.paused` / `recurrence.resumed` | 5 | `{}` |
| `recurrence.series_updated` | 5 | `{ "changed": [...] }` com nomes de coluna entre `amount, description, account_id, category_id, assigned_member_id, end_date` (nunca valores de texto). A propagação às ocorrências intocadas também grava um `transaction.updated` por ocorrência |

Erros das RPCs (contrato com o backend): `raise exception '<CODE>' using errcode = 'P0001';` com `<CODE>` em
`NOT_AUTHENTICATED | ALREADY_IN_FAMILY | INVALID_INPUT | INVITE_NOT_FOUND | INVITE_EXPIRED | INVITE_ALREADY_USED | INVITE_REVOKED | INVITE_EMAIL_MISMATCH | INVITE_LIMIT_REACHED`;
falta de permissão: `raise exception 'FORBIDDEN' using errcode = '42501';`. Mensagens sem dados.
(`NOT_AUTHENTICATED` → `UNAUTHENTICATED` e `INVALID_INPUT` → `VALIDATION_ERROR` no app.)

### 4.7 Helpers de autorização (schema `private`)

Todas: `language sql stable security definer set search_path = ''`; `revoke all ... from public, anon;
grant execute ... to authenticated;` (necessário para as policies). Rodam como dono (bypass RLS), o que
evita recursão de policy em `family_members`.

```sql
create function private.is_family_member(p_family_id uuid) returns boolean ... as $$
  select exists (select 1 from public.family_members m
                 where m.family_id = p_family_id and m.user_id = (select auth.uid()) and m.status = 'active');
$$;
create function private.has_family_role(p_family_id uuid, p_roles text[]) returns boolean ... as $$
  select exists (select 1 from public.family_members m
                 where m.family_id = p_family_id and m.user_id = (select auth.uid())
                   and m.status = 'active' and m.role = any (p_roles));
$$;
create function private.shares_family_with(p_user_id uuid) returns boolean ... as $$
  select exists (select 1 from public.family_members a join public.family_members b on b.family_id = a.family_id
                 where a.user_id = (select auth.uid()) and a.status = 'active'
                   and b.user_id = p_user_id and b.status = 'active');
$$;
create function private.current_family_id() returns uuid ... as $$   -- MVP: 1 família ativa
  select m.family_id from public.family_members m
  where m.user_id = (select auth.uid()) and m.status = 'active' limit 1;
$$;
```
Policies sempre `to authenticated` e usam `(select auth.uid())` (avaliado uma vez por query).

### 4.8 RPCs públicas da Etapa 2

Todas: `language plpgsql security definer set search_path = ''`; começam com
`if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;`;
`revoke execute ... from public, anon; grant execute ... to authenticated;`. Executam numa única
transação (falha = nada persistido).

| RPC | Assinatura | Regras |
|---|---|---|
| `create_family` | `(p_name text) returns uuid` | `btrim`, 1..80 senão `INVALID_INPUT`; se usuário já tem vínculo ativo → `ALREADY_IN_FAMILY`; insere `families` (created_by = uid) + `family_members` (role `owner`) + `log_audit('family.created')`. `unique_violation` no índice de família ativa (corrida de duplo clique) → `ALREADY_IN_FAMILY`. Etapa 3 estende para semear categorias padrão. |
| `create_family_invite` | `(p_role text default 'member', p_email text default null) returns table (invite_id uuid, token text, expires_at timestamptz)` | família = `private.current_family_id()` (null → `FORBIDDEN`); `p_role in ('admin','member')` senão `INVALID_INPUT`; `member` exige owner/admin; `admin` exige owner → senão `FORBIDDEN`; máx. 20 convites `pending` por família → `INVITE_LIMIT_REACHED`; `token := encode(extensions.gen_random_bytes(32), 'hex')`; grava `token_hash := encode(sha256(convert_to(token,'UTF8')), 'hex')`, `invited_email := lower(btrim(p_email))`, `expires_at := now() + interval '7 days'`; `log_audit('invite.created')`; **devolve o token em claro uma única vez**. |
| `get_invite_preview` | `(p_token text) returns table (family_name text, role text, expires_at timestamptz, status text, email_bound boolean)` | `p_token !~ '^[0-9a-f]{64}$'` → `INVITE_NOT_FOUND`; busca por hash; inexistente → `INVITE_NOT_FOUND`; devolve status derivado (`pending\|expired\|accepted\|revoked`); não devolve e-mail nem quem convidou. |
| `accept_family_invite` | `(p_token text) returns uuid` (family_id) | formato inválido/inexistente → `INVITE_NOT_FOUND`; `select ... for update` na linha do convite; `revoked_at` → `INVITE_REVOKED`; `accepted_at` → `INVITE_ALREADY_USED`; `expires_at <= now()` → `INVITE_EXPIRED`; `invited_email` ≠ `lower(auth.jwt()->>'email')` → `INVITE_EMAIL_MISMATCH`; vínculo ativo em qualquer família → `ALREADY_IN_FAMILY`; insere `family_members` com `role` do convite; marca `accepted_at/accepted_by`; `log_audit('member.joined')`. |
| `revoke_family_invite` | `(p_invite_id uuid) returns void` | convite inexistente **ou de outra família** → `INVITE_NOT_FOUND` (não revela existência); owner revoga qualquer; admin só convites `role='member'`; member → `FORBIDDEN`; já aceito → `INVITE_ALREADY_USED`; já revogado → idempotente (sem erro, sem novo evento); `log_audit('invite.revoked')`. |

Etapa 7 (especificadas aqui para fechar as invariantes; implementação posterior):
`change_member_role(p_member_id uuid, p_role text)` — só owner; alvo ≠ próprio usuário; `p_role in ('admin','member')`.
`transfer_ownership(p_member_id uuid)` — só owner; troca atômica owner→admin e alvo→owner.
`remove_family_member(p_member_id uuid)` — owner remove admin/member; admin remove member; ninguém remove o owner; `status='removed'`.
`leave_family()` — admin/member; owner precisa transferir antes. Destino dos registros de quem sai:
permanecem na família (autoria preservada por FK `restrict`; `assigned_member_id` continua apontando para o vínculo encerrado, exibido como "ex-integrante").
`update_family(p_name text)` — substitui o update direto se for necessário auditar.

### 4.9 Testes pgTAP obrigatórios da Etapa 2

Em `supabase/tests/database/` (helpers de teste em schema `tests`, criados por `000_setup.test.sql`,
nunca em migration): ver `acceptance-criteria.md` §E2-DB.

## 5. Etapas 3+ — modelo relacional refinado

Mesmas convenções de §1 (RLS, grants, FKs compostas, triggers updated_at). Permissões: `permissions.md`.

### 5.1 `accounts` (Etapa 3)

| Coluna | Tipo | Regra |
|---|---|---|
| id, family_id | uuid | `unique (family_id, id)`; FK families restrict |
| name | text | 1..60; `unique (family_id, lower(name))` |
| type | text | `check (type in ('checking','savings','cash','credit_card','digital_wallet','investment','other'))` |
| opening_balance | numeric(14,2) not null default 0 | `credit_card`: `<= 0` (dívida inicial); demais: qualquer sinal (cheque especial) |
| opening_balance_date | date not null | transações da conta exigem `transaction_date >= opening_balance_date` (trigger) |
| institution_name | text null | ≤ 80 |
| credit_limit | numeric(14,2) null | `> 0`; só `credit_card` |
| statement_closing_day, statement_due_day | smallint null | 1..31; obrigatórios sse `type='credit_card'` |
| is_active | boolean not null default true | arquivar = `false`; conta arquivada não recebe lançamento novo (trigger) |
| created_at, updated_at | timestamptz | |

Sem `current_balance`: saldo é derivado ([ADR-0004](adr/0004-saldo-derivado.md)); função
`public.account_balances(p_as_of date default current_date) returns table(account_id uuid, balance numeric)`
`security invoker` (RLS aplica). Sem delete pela API (FK restrict de transações; conta sem histórico também só arquiva — simplicidade).

### 5.2 `categories` (Etapa 3) — por família ([ADR-0010](adr/0010-categorias-por-familia.md))

| Coluna | Tipo | Regra |
|---|---|---|
| id, family_id | uuid | `family_id not null`; `unique (family_id, id)` |
| name | text | 1..50 |
| type | text | `check (type in ('income','expense'))` |
| color | text | chave de paleta fechada: `check (color in ('lime','green','sky','orange','violet','pink','yellow','red','gray'))` — mapeada a token CSS por tema; nunca hex |
| icon | text | nome Lucide de uma allowlist do app; `check (icon ~ '^[a-z0-9-]{1,40}$')` |
| parent_id | uuid null | FK composta `(family_id, parent_id) → categories(family_id, id)`; 1 nível (trigger: pai sem pai e mesmo `type`) |
| is_default | boolean not null default false | semeada por `create_family` |
| archived_at | timestamptz null | |
| created_at, updated_at | timestamptz | |

`unique nulls not distinct (family_id, type, parent_id, lower(name))` via índice único parcial `where archived_at is null`.
Categoria com histórico: só arquiva (FK restrict); sem histórico: pode ser excluída. Padrões (spec §7.5):
despesa — Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Assinaturas, Contas domésticas, Compras, Outros;
receita — Salário, Renda extra, Freelance, Rendimentos, Reembolsos, Outros.

### 5.3 `transactions` (Etapa 3; colunas de recorrência na 5)

| Coluna | Tipo | Regra |
|---|---|---|
| id, family_id | uuid | `unique (family_id, id)` |
| type | text | `check (type in ('income','expense','transfer'))` |
| account_id | uuid not null | FK composta → accounts |
| destination_account_id | uuid null | FK composta → accounts; `type='transfer'` ⇔ not null; `<> account_id` |
| category_id | uuid null | FK composta → categories; `type in (income,expense)` ⇔ not null; trigger: `categories.type = transactions.type` |
| assigned_member_id | uuid null | FK composta → family_members (responsável) |
| created_by | uuid not null | FK profiles restrict |
| description | text not null | 1..120 |
| amount | numeric(14,2) not null | `check (amount > 0)` |
| transaction_date | date not null | data que define o período e o efeito no saldo (`financial-definitions.md` §D11) |
| due_date | date null | vencimento original (contas a pagar); **mantido pelo trigger, fora dos grants de insert e update** (Etapa 5): insert `pending` → `= transaction_date`; insert `paid` → null; linha que continua `pending` → acompanha `transaction_date`; `pending → paid` e demais casos preservam o valor. Backfill da migration: pendentes antigos com `due_date` nulo recebem `transaction_date`. Só informativo após pagamento |
| status | text not null | `check (status in ('pending','paid','canceled'))`; `transactions_pending_type_check check (status <> 'pending' or type <> 'transfer')` (`not valid` + `validate` tolerante, padrão SEC-14). **Muda só pelas RPCs** `pay_pending_transaction`/`cancel_pending_transaction` (fora do grant de update); transições permitidas só `pending → paid` e `pending → canceled`; linha `canceled` é imutável (`INVALID_STATUS_TRANSITION`) |
| notes | text null | ≤ 1000 |
| reversal_of_id | uuid null | FK composta → transactions; estorno: mesmo `type`, mesma conta, `status='paid'`; trigger com `for update` no original garante Σ estornos ≤ `amount` original; transfer não tem estorno (cancela/exclui) |
| recurrence_id, occurrence_date | uuid null, date null | Etapa 5; fora dos grants (só `materialize_recurrences` escreve); `transactions_recurrence_shape_check check ((recurrence_id is null) = (occurrence_date is null))`; `transactions_recurrence_fk (family_id, recurrence_id) → recurrences (family_id, id) on delete restrict`; `transactions_recurrence_occurrence_key unique (recurrence_id, occurrence_date)` |
| idempotency_key | uuid null | gerado pelo formulário; `unique (family_id, idempotency_key)` — anti duplo envio |
| deleted_at, deleted_by | timestamptz null, uuid null | exclusão lógica; `check ((deleted_at is null) = (deleted_by is null))` |
| created_at, updated_at | timestamptz | |

Índices: `(family_id, transaction_date desc) where deleted_at is null`; `(account_id, transaction_date)`;
`(destination_account_id) where destination_account_id is not null`; `(family_id, category_id, transaction_date)`;
`transactions_pending_date_idx (family_id, transaction_date) where status = 'pending' and deleted_at is null`; `(family_id, assigned_member_id)`;
busca por descrição: `pg_trgm` GIN em `description` (decidir na Etapa 3 conforme volume).
Sem delete físico pela API. Updates de campos financeiros e exclusões geram `audit_events`.

Etapa 5 (migration `20261024100800`; o trigger é redefinido por inteiro, sem perder regra da Etapa 3):
- Conta ativa e `transaction_date` entre `opening_balance_date` e hoje também valem em `pending → paid` (`ACCOUNT_ARCHIVED`, `DATE_BEFORE_OPENING_BALANCE`, `FUTURE_DATE_NOT_ALLOWED`).
- A exclusão lógica também descarta `status` e `due_date` enviados junto (SEC-15).
- Policy `transactions_update` (e `recurrences_update`): o ramo "autor" exige vínculo ativo (`created_by = auth.uid() and is_family_member`), migration `20261024101100` (SEC-19).
- RPCs `security definer` (`search_path=''`, `revoke` de public/anon, `grant` a `authenticated`; família = `private.current_family_id()`, linha por id **e** família com `for update`):
  `pay_pending_transaction(p_transaction_id, p_paid_on, p_amount, p_account_id)` → `NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `FORBIDDEN` (`42501`: nem owner/admin, nem autor, nem responsável com vínculo ativo), `INVALID_INPUT`, `FUTURE_DATE_NOT_ALLOWED`; o `update` da mesma linha para `paid` troca data, valor e conta. `cancel_pending_transaction(p_transaction_id)` → `FORBIDDEN` se não for owner/admin nem autor (o responsável que não é autor não cancela).
- `pending_summary()` (invoker, `text`): `payable`, `receivable`, `overdue_payable`, `overdue_receivable`, `overdue_count` sobre `pending` não excluídos `income`/`expense`; vencido = `transaction_date < private.today()` (D19).

### 5.4 `recurrences` (Etapa 5) — [ADR-0011](adr/0011-recorrencias-materializadas-sob-demanda.md), [ADR-0023](adr/0023-recorrencias-modelo-e-edicao-de-serie.md)

Implementado em `20261024100700` e `20261024101100` (prevalece sobre o rascunho anterior desta seção):
`id, family_id, type (income|expense — sem transfer), account_id not null, category_id not null, assigned_member_id?,
description 1..120 (btrim), amount numeric(14,2) > 0 e <= 99999999.99 e <> NaN, frequency (weekly|monthly|yearly),
interval_count smallint not null default 1 check 1..12, start_date date >= 2000-01-01, end_date date null check >= start_date,
next_occurrence_date date not null, is_active boolean not null default true, last_failure_code text null
(check ^[A-Z_]{1,40}$), last_failure_at timestamptz null, idempotency_key uuid null, created_by uuid not null default auth.uid(),
created_at, updated_at`. Sem `destination_account_id`.
- Constraints: `recurrences_family_id_id_key unique (family_id, id)`; `recurrences_family_idempotency_key unique (family_id, idempotency_key)`; `recurrences_failure_shape_check ((last_failure_code is null) = (last_failure_at is null))`; FKs compostas `recurrences_account_fk`, `recurrences_category_fk`, `recurrences_assigned_member_fk` (restrict) e `recurrences_created_by_fk`. Índice `recurrences_family_next_idx (family_id, next_occurrence_date) where is_active`.
- Grants: `select`; `insert (family_id, type, account_id, category_id, assigned_member_id, description, amount, frequency, interval_count, start_date, end_date, idempotency_key)`; `update (account_id, category_id, assigned_member_id, description, amount, end_date, is_active)`. Sem delete. `type`, `frequency`, `interval_count`, `start_date`, `next_occurrence_date` e `last_failure_*` não são editáveis pela API.
- Policies: `recurrences_select` (`is_family_member`); `recurrences_insert` (`is_family_member and created_by = auth.uid()`); `recurrences_update` (`owner/admin` **ou** autor **com vínculo ativo**, `using` e `with check`).
- Trigger `recurrences_before_write_biu` (invoker, `P0001`): conta ativa e categoria do mesmo tipo e ativa (`ACCOUNT_ARCHIVED`, `CATEGORY_TYPE_MISMATCH`, `CATEGORY_ARCHIVED`); responsável com vínculo ativo (`INVALID_INPUT`); `start_date >= opening_balance_date` da conta (`DATE_BEFORE_OPENING_BALANCE`, precede a regra seguinte); **`start_date >= hoje − 12 meses` no insert (`INVALID_INPUT`, SEC-20)**; máximo de 100 séries ativas por família sob `pg_advisory_xact_lock` (`RECURRENCE_LIMIT_REACHED`); ponteiro do banco (insert: `start_date`; reativação: primeira data ≥ hoje; mudança de `end_date`: `least(base, primeira data ≥ hoje)`, em que **base = ponteiro já recalculado na reativação, senão o antigo** — ADR-0023 §5, D12); editar coluna editável limpa `last_failure_*`.
- Trigger `recurrences_after_update_au` (definer): propagação nesta ordem — pausa remove as ocorrências intocadas; `end_date` nova remove as intocadas após ela; mudança de valores atualiza as intocadas restantes. Auditoria `recurrence.paused`, `recurrence.resumed`, `recurrence.series_updated`.
- Agenda (D12): `private.recurrence_occurrence(start, frequency, interval, n)` e `private.recurrence_next_on_or_after(...)` (contrato) mais `private.recurrence_first_index(...)` (auxiliar, índice da primeira ocorrência ≥ data), todas `immutable`, `search_path=''`, `execute` a `authenticated` (usadas por trigger invoker).
- `materialize_recurrences()` (definer, sem parâmetros, só a família do chamador): horizonte = último dia do mês seguinte a hoje; séries ativas com ponteiro ≤ `least(horizonte, end_date)`, `for update skip locked`; **séries com falha registrada há menos de 1 hora são puladas (backoff; editar a série zera a falha) — SEC-21, `20261024101100`**; por série, bloco com exceção (`RECURRENCE_AUTHOR_INACTIVE` se o autor não tem vínculo ativo; falha grava `last_failure_code` = código ou `INTERNAL_ERROR`); tetos de 60 ocorrências por série e 500 por chamada; `insert ... on conflict (recurrence_id, occurrence_date) do nothing`; devolve quantas criou.

### 5.5 `budgets` (Etapa 5) — [ADR-0024](adr/0024-orcamentos-mensais.md)

Implementado em `20261024101000` (somente orçamento mensal; sem `name`, `period_type` nem `custom`):
`id, family_id, category_id null (null = todas as despesas; imutável), amount_limit numeric(14,2) > 0 e <= 99999999.99 e <> NaN,
start_month date (dia 1, >= 2000-01-01; imutável), end_month date null (dia 1 e >= start_month), archived_at timestamptz null,
created_by uuid not null default auth.uid(), created_at, updated_at`. FK composta `budgets_category_fk (family_id, category_id) → categories`.
- Único: `budgets_family_category_active_key (family_id, category_id) nulls not distinct where archived_at is null`.
- Grants: `select`; `insert (family_id, category_id, amount_limit, start_month, end_month)`; `update (amount_limit, end_month, archived_at)`. Sem delete (arquiva). Policies: select `is_family_member`; insert e update `owner/admin` (insert com `created_by = auth.uid()`).
- Trigger `budgets_before_write_biu`: categoria de despesa (`CATEGORY_TYPE_MISMATCH`) e ativa (`CATEGORY_ARCHIVED`) no insert e no desarquivamento. Sem auditoria.
- `budget_progress(p_from_month, p_to_month)` (invoker, `text`): até 12 meses civis (senão `INVALID_INPUT`); uma linha por orçamento visível (inclusive arquivado) e mês dentro da vigência; `spent` = despesas `paid` com estorno abatendo, na categoria ou nas filhas (nula = todas); `committed` = despesas `pending` no mesmo recorte (D14).

### 5.6 `goals` (Etapa 6) — [ADR-0025](adr/0025-metas-reserva-sem-transacao.md)

Implementado em `20261024101300`. Colunas: `id, family_id, name` (1..80 após `btrim`), `description` (null ou ≤ 500), `target_amount numeric(14,2)` (`> 0`, `<> 'NaN'`, `<= 99999999.99`), `target_date date null` (≥ 2000-01-01), `icon text not null default 'target'` (`goals_icon_check`: `target, plane, house, car, shield, graduation-cap, heart-pulse, gift, baby, briefcase, laptop, piggy-bank`), `status` (`active|paused|completed|canceled`, padrão `active`), `completed_at timestamptz null` (do banco; `goals_completed_shape_check`: `status = 'completed'` ⇔ não nulo), `idempotency_key uuid null`, `created_by uuid not null default auth.uid()`, `created_at`, `updated_at`.
**Sem `current_amount`**: progresso = Σ `goal_contributions` (fonte única). Imagem de capa do mockup: ícone da allowlist no MVP; upload (Storage) exige ADR.
- Únicos: `goals_family_id_id_key (family_id, id)` (alvo da FK de aportes) e `goals_family_idempotency_key (family_id, idempotency_key)`.
- Grants: `select`; `insert (family_id, name, description, target_amount, target_date, icon, idempotency_key)`; `update (name, description, target_amount, target_date, icon, status)`. Sem delete (a meta se cancela). Policies: select `is_family_member`; insert e update `owner/admin` (insert com `created_by = auth.uid()`).
- Trigger `goals_before_update_bu` (invoker): `completed` e `canceled` são finais (qualquer update → `INVALID_STATUS_TRANSITION`); transições `active→paused|completed|canceled` e `paused→active|completed|canceled`; `→ completed` fixa `completed_at = now()`.
- Auditoria `goals_after_update_au` (definer): `goal.status_changed` e `goal.updated` (só `target_amount`/`target_date`). A criação não é auditada.

### 5.7 `goal_contributions` (Etapa 6)

Implementado em `20261024101300`. `id, family_id`, `goal_id` e `member_id` (FKs compostas `goal_contributions_goal_fk (family_id, goal_id) → goals` e `goal_contributions_member_fk (family_id, member_id) → family_members`, restrict), `kind` (`deposit|withdrawal`), `amount numeric(14,2)` (`> 0`, `<> 'NaN'`, `<= 99999999.99`), `contribution_date date` (≥ 2000-01-01), `notes` (≤ 500), `idempotency_key uuid null`, `created_by`, `deleted_at`/`deleted_by` (`goal_contributions_deleted_shape_check`), `created_at`, `updated_at`.
**Não existe `transaction_id`** (ADR-0025): o aporte é reserva e não toca contas.
- Único `goal_contributions_family_idempotency_key (family_id, idempotency_key)`; índice parcial `goal_contributions_goal_date_idx (goal_id, contribution_date desc) where deleted_at is null`.
- Grants: `select`; `insert (family_id, goal_id, member_id, kind, amount, contribution_date, notes, idempotency_key)`; `update (deleted_at)`. Sem delete. Policies: select `is_family_member`; insert `is_family_member and created_by = auth.uid()`; update (exclusão lógica, só com `deleted_at is null`) owner/admin ou autor com vínculo ativo.
- Trigger `goal_contributions_before_write_biu` (invoker; `pg_advisory_xact_lock(hashtextextended('goal:' || goal_id, 0))` antes de somar). Insert: meta `active` (`GOAL_NOT_ACTIVE`), `member_id` com vínculo ativo (`INVALID_INPUT`), chamador owner/admin ou `member_id = private.current_member_id()` (`FORBIDDEN`, `42501`), data ≤ hoje (`FUTURE_DATE_NOT_ALLOWED`) e retirada que não deixe o acumulado < 0 (`GOAL_NEGATIVE_PROGRESS`). Update: só `deleted_at` de nulo para não nulo (senão `INVALID_INPUT`); o trigger fixa `deleted_at = now()` e `deleted_by = auth.uid()`; excluir um `deposit` que deixaria o acumulado < 0 → `GOAL_NEGATIVE_PROGRESS`. A contribuição é imutável (corrigir = excluir e registrar outra).
- Auditoria `goal_contributions_after_update_au` (definer): `goal_contribution.deleted`. A criação não é auditada.

### 5.8 `expense_splits` e `settlements` (Etapa 6) — [ADR-0026](adr/0026-divisao-de-despesas-por-rpc.md)

**`expense_splits`** (`20261024101400`): `id, family_id`, `transaction_id` (FK composta `expense_splits_transaction_fk (family_id, transaction_id) → transactions`), `member_id` (FK composta `expense_splits_member_fk`), `amount numeric(14,2)` (`> 0`, `<> 'NaN'`), `created_by`, `created_at`, `updated_at`; `expense_splits_transaction_member_key unique (transaction_id, member_id)`.
- Grants: **só `select`**; policy select `is_family_member`. Nenhuma escrita direta: só a RPC e o trigger de reescala (ambos definer).
- Constraint trigger `expense_splits_sum_check` (`after insert or update or delete`, `deferrable initially deferred`, por linha, definer): se a despesa tem parcelas, Σ = `transactions.amount`, senão `SPLIT_SUM_MISMATCH` no commit.
- Trigger `transactions_rescale_splits` em `transactions` (`after update of amount`, `when old.amount is distinct from new.amount`, definer, **separado** dos triggers da Etapa 5): chama `private.rescale_splits(id, amount)`; sem parcelas é no-op. Cobre pagamento com valor real e edição de valor. Parcela resultante ≤ 0 → `SPLIT_AMOUNT_TOO_SMALL` (`20261024101700`; antes caía em `23514`).
- Nenhuma função de saldo, total ou orçamento lê esta tabela; só `member_balances`.

**`set_transaction_splits(p_transaction_id uuid, p_mode text, p_shares jsonb) returns void`** (`plpgsql security definer`, `search_path=''`, `revoke` de public/anon, `grant` a `authenticated`; versão final em `20261024101700`). Ordem: `NOT_AUTHENTICATED`; família do chamador nula → `FORBIDDEN`; lançamento da família, não excluído, `for update` (senão `NOT_FOUND`); `type <> 'expense'`, cancelado ou estorno → `SPLIT_NOT_ALLOWED`; chamador que não é owner/admin nem autor → `FORBIDDEN`; modo fora de `equal|amounts|none` → `INVALID_INPUT`. `none` apaga e só audita se removeu algo. `p_shares`: 2..20 objetos com `member_id` uuid distintos (em `amounts`, `amount` texto `^\d{1,8}(\.\d{1,2})?$` e > 0); integrantes desta família (senão `INVALID_INPUT`), ativos ou já na divisão atual (senão `MEMBER_INACTIVE`). `equal` → `private.allocate_cents` com pesos 1, integrantes por `joined_at, id`; `amounts` → Σ ≠ valor → `SPLIT_SUM_MISMATCH`. Parcela ≤ 0 → `SPLIT_AMOUNT_TOO_SMALL`. Conjunto idêntico ao atual é no-op (sem reescrita nem auditoria, SEC-23). Senão substitui o conjunto (delete + insert) e grava `transaction.splits_changed`.

**`settlements`** (`20261024101500`; spec "se implementado"): `id, family_id`, `from_member_id`/`to_member_id` (FKs compostas → `family_members`; `settlements_members_check (from <> to)`), `amount numeric(14,2)` (`> 0`, `<> 'NaN'`, `<= 99999999.99`), `settlement_date date` (≥ 2000-01-01), `notes` (≤ 500), `idempotency_key`, `created_by`, `deleted_at`/`deleted_by` (check de forma), `created_at`, `updated_at`. Único `settlements_family_idempotency_key`; índice parcial `settlements_family_date_idx (family_id, settlement_date desc) where deleted_at is null`.
- Grants: `select`; `insert (family_id, from_member_id, to_member_id, amount, settlement_date, notes, idempotency_key)`; `update (deleted_at)`. Sem delete.
- Policies: select `is_family_member`; insert `is_family_member and created_by = auth.uid()` e (owner/admin **ou** `from`/`to` = `private.current_member_id()`); update (exclusão lógica; `deleted_at is null` e vínculo ativo): owner/admin, autor **ou uma das partes** (`from`/`to`). As partes entraram em `20261024101700` (SEC-25).
- Trigger `settlements_before_write_biu` (invoker): insert com data > hoje → `FUTURE_DATE_NOT_ALLOWED`; update só aceita `deleted_at` de nulo para não nulo (senão `INVALID_INPUT`) e fixa `deleted_at`/`deleted_by`. Auditoria `settlements_audit_aiu` (definer): `settlement.created` e `settlement.deleted`. Integrantes inativos são aceitos (dívida histórica). Não afeta contas nem consolidado.

**Funções de leitura** (`20261024101600`; `public`, `stable`, `security invoker`, `search_path=''`, montantes `text`, filtro por `private.current_family_id()` + RLS; `grant` a `authenticated`; `prosecdef = false`):
- `goal_summary(p_from date, p_to date) returns (goal_id, saved, deposits, withdrawals)`: uma linha por meta visível (todos os status), ordem `created_at, id`; `saved` = D9 de todas as datas; `deposits`/`withdrawals` = Σ no intervalo; datas nulas, `p_from > p_to` ou mais de 366 dias → `INVALID_INPUT`.
- `member_balances() returns (debtor_member_id, creditor_member_id, amount)`: D10; parcelas de despesas `paid`, não excluídas, não estorno e com `assigned_member_id`, líquidas de estorno (proporção do original por `allocate_cents`), menos acertos não excluídos, compensado por par; só `amount > 0`.
- `projected_cash_flow(p_months integer) returns (month, pending_income, pending_expense, recurring_income, recurring_expense)`: D15; `p_months` 1..12 (senão `INVALID_INPUT`), todos os meses presentes desde o mês de hoje. Pendente = `pending` não excluído `income|expense` (no 1º mês, também as anteriores a hoje). Recorrente = séries `is_active`, ocorrências ≥ `greatest(next_occurrence_date, hoje)` e ≤ `end_date`, no máximo 60 por série.

**Helpers `private`** (`20261024101200`, `101700`; `search_path=''`): `current_member_id()` (definer, estável; vínculo ativo do chamador; `grant` a `authenticated`); `allocate_cents(p_total, p_weights[])` (D13 em centavos, aritmética exata em `numeric`, empate pelo índice do array; `p_total` ≥ 0 com 2 casas e pesos ≥ 0 com soma > 0, senão `INVALID_INPUT`; `grant` a `authenticated`); `rescale_splits(p_transaction_id, p_new_amount)` (definer, **sem** grant a `authenticated`). A Etapa 6 também reafirma o `grant execute` de `recurrence_occurrence` e `recurrence_first_index` (Etapa 5) a `authenticated`, exigido pela função invoker `projected_cash_flow`.

### 5.9 `notifications` (Etapa 7)

`id, family_id, user_id (FK profiles), type check in ('bill_due_soon','bill_overdue','goal_near_target',
'budget_near_limit','member_joined','invite_received','financial_event'), title ≤ 120, message ≤ 500,
read_at timestamptz null, related_entity_type text null, related_entity_id uuid null, dedupe_key text null,
created_at`; `unique (user_id, dedupe_key) where dedupe_key is not null`; índice `(user_id, read_at, created_at desc)`.
RLS: select/update (`read_at` por grant de coluna) só `user_id = auth.uid()` **e** membro ativo da família; insert só por funções definer.
Lembretes de vencimento: gerados sob demanda e idempotentes (`dedupe_key = 'bill_due:<tx_id>:<date>'`), como recorrências.

### 5.10 Storage

Fora das Etapas 1–7. Se comprovantes forem adotados: bucket privado, caminho `<family_id>/<entity>/<uuid>`,
policies em `storage.objects` com `private.is_family_member((storage.foldername(name))[1]::uuid)`, URLs assinadas curtas (ADR própria).
