# Contrato de execução — Etapa 3 (contas, categorias e transações)

Versão 1.0 (2026-10-23) · Dono: orchestrator/architect · Alteração só por pedido ao orchestrator (§8).
Referências: spec §7.3–7.5, §11 Etapa 3, §12 B/C/D, §13 (regressão); `data-model.md` §5.1–5.3; `permissions.md` §2 (linhas Contas,
Categorias, Transações, apresentadas ao usuário e mantidas); `financial-definitions.md` (D1–D8, D11, D13, R1–R8);
`acceptance-criteria.md` (CA-E3-*); ADRs 0003, 0004, 0006, 0008, 0010, 0013, 0014–0019; contrato `etapas-1-2.md` v1.1 (regras gerais herdadas).
**Onde este contrato e o `data-model.md` divergirem, vale este contrato** (ADR-0018/0019). O architect atualiza o `data-model.md` na Fase C.

## 0. Regras do contrato

1. **Um arquivo = um dono** (§2). Ninguém cria, edita, move ou apaga arquivo de outro dono. Precisa de mudança alheia → pedido (§8).
2. As interfaces da §3 ficam congeladas nesta versão. O nome, a assinatura e o comportamento observável não mudam; a implementação interna é livre.
3. Fora do escopo: dashboard com números e gráficos (Etapa 4; nada de Recharts), pendentes/contas a pagar na UI, `status='canceled'`, recorrências (o toggle "Repetir esta transação" do mockup fica fora), orçamentos, metas, divisão, fatura por ciclo de cartão, parcelamento, importação, anexos, multi-moeda, `pg_trgm`, RPCs de escrita. Não criar rota, tabela, coluna ou componente para eles.
4. Herdadas do contrato E1–2 v1.1: sem dados fictícios; sem `any`, `@ts-ignore` ou `eslint-disable`; sem hex fora de `globals.css`; nada de EBD; nenhuma action recebe `family_id` (ADR-0008); sessão só no servidor (ADR-0016); formulários POST após a hidratação (ADR-0017); nenhum cache de dados de família (ADR-0015).
5. **Dinheiro nunca passa por ponto flutuante.** O banco usa `numeric(14,2)`. Do banco para o app vai string (`amount::text`, funções que devolvem `text`). O domínio usa `Cents` inteiro. Do formulário para a action vai string pt-BR (`"1.234,56"`). Das queries para a UI vai `Cents` (inteiro seguro). `parseFloat`, `Number(<string monetária>)` e `toFixed` são proibidos em código de dinheiro.
6. "Hoje" é sempre a data civil em `America/Sao_Paulo`: `today()` de `src/lib/dates` no app e `private.today()` no banco. Nunca `current_date`, nem `new Date().toISOString().slice(0,10)`.
7. Entrega = arquivos do dono + checagens da §5 passando + handoff com arquivos, comandos executados e resultado.

## 1. Fases e sequência

Pré-condição: Etapas 1–2 integradas (correções SEC-1/3/5/7/11 entregues, CA-E1/E2 verdes, gate sem alto/crítico `aberto`).

| Fase | Quem | O quê | Pode começar quando |
|---|---|---|---|
| A-db | database | migrations, triggers, funções e pgTAP da §3.1; `pnpm db:types` assim que as tabelas existirem | pré-condição |
| A-ds | design-system | `shadcn add` da §3.3. É o **único momento** em que o DS altera `package.json`/`pnpm-lock.yaml` | pré-condição |
| A-be | backend | **interfaces publicadas primeiro**: `src/lib/money`, `src/lib/dates`, `src/lib/validation`, `modules/*/constants.ts`, `types.ts`, `schemas.ts`, extensão de `ErrorCode`, com as assinaturas da §3.2 (implementação de `money`/`dates` já completa e testada) | pré-condição; não depende de A-ds |
| B | os quatro em paralelo | DS: componentes `shared/*` (dependem de `lib/money`, `lib/dates` e `categories/constants`). Backend: repositories, services, actions e queries (dependem de `database.ts`). Database: finaliza o pgTAP. Frontend: telas (compila contra as interfaces publicadas; build completo só na C) | A-ds e A-be concluídas (backend: também `database.ts` de A-db) |
| C | orchestrator (+ QA, reviewer, security) | integração (§6), pedidos de mudança, atualização de `data-model.md`/`financial-definitions.md` pelo architect | todos de B entregues |

Regras:
- Na B, `package.json`/`pnpm-lock.yaml` ficam congelados. Dependência nova = pedido (§8), aplicado pelo frontend na Fase C.
- `src/types/database.ts` é regenerado pelo database a cada migration, e o backend é avisado. Até lá, o backend tipa pela §3.1.
- Ordem de DS e frontend para formulários: o frontend não cria campo monetário, data, select ou lista próprios. Usa os da §3.3; se faltar algo, abre pedido.

## 2. Mapa de donos (acréscimos ao mapa do contrato E1–2 v1.1, que continua valendo)

| Caminho | Dono |
|---|---|
| `supabase/migrations/2026*_etapa3_*.sql`, `supabase/tests/database/1[0-9]0_*.test.sql`, `src/types/database.ts` | database |
| `src/lib/money/**`, `src/lib/dates/**`, `src/lib/validation/**` | backend |
| `src/modules/{accounts,categories,transactions}/` **exceto** `components/` (`schemas.ts`, `actions.ts`, `queries.ts`, `service.ts`, `repository.ts`, `types.ts`, `constants.ts`, `domain/**`, `*.test.ts`) | backend |
| `src/modules/family/permissions.ts` (extensão de `can`), `src/server/{action,errors,error-messages}.ts` (códigos novos), `src/proxy.ts`, `src/lib/safe-redirect.ts` (rotas novas) | backend |
| `tests/integration/{accounts,categories,transactions,financial-regression}.test.ts` | backend |
| `src/components/ui/{select,popover,calendar,table,pagination,textarea,radio-group,input-group}.tsx` (gerados) | design-system |
| `src/components/shared/{money-input,money,date-picker,segmented-control,responsive-list,pagination-nav,filters-panel,search-input,category-icon}.tsx` e testes | design-system |
| `docs/design-system.md`, `package.json`/`pnpm-lock.yaml` (só A-ds) | design-system |
| `src/app/(app)/{transacoes,contas,categorias}/**`, `src/app/(app)/inicio/page.tsx`, `src/config/navigation.ts` | frontend |
| `src/modules/{accounts,categories,transactions}/components/**`, `src/hooks/**` exceto `use-mobile.ts` | frontend |
| `e2e/{contas,categorias,transacoes}.spec.ts`, `e2e/helpers/**` | frontend |
| `docs/**` (exceto `docs/design-system.md`), `.claude/**`, `AGENTS.md`, `CLAUDE.md` | orchestrator/architect |

## 3. Interfaces

### 3.1 Database → backend

Convenções do `data-model.md` §1 (RLS por comando `to authenticated`, `revoke all` + grants mínimos, FKs compostas `(family_id, x_id)`, `on delete restrict`, `updated_at` por trigger, funções com `search_path = ''`, `revoke execute ... from public, anon`). Os nomes de constraint abaixo fazem parte do contrato: o backend os usa em embeddings do PostgREST (`tabela!nome_fk(...)`) e no mapeamento de erro.

**Helpers novos (`private`)**
- `private.today() returns date`: `stable`, `(now() at time zone 'America/Sao_Paulo')::date`. `grant execute` a `authenticated`.
- `private.seed_default_categories(p_family_id uuid) returns void`: `security definer`, sem grant (só `create_family` e o backfill chamam).

**`accounts`**

| Coluna | Regra |
|---|---|
| `id`, `family_id` | `unique (family_id, id)`; FK families |
| `name` | 1..60 após `btrim`; índice único `accounts_family_name_active_key` em `(family_id, lower(name)) where is_active` |
| `type` | `checking, savings, cash, credit_card, digital_wallet, investment, other`; **imutável** (fora do grant de update) |
| `opening_balance numeric(14,2) not null default 0` | `credit_card` ⇒ `<= 0` |
| `opening_balance_date date not null default private.today()` | |
| `institution_name` | null ou 1..80 |
| `credit_limit numeric(14,2)` | null ou `> 0`; só `credit_card` |
| `statement_closing_day`, `statement_due_day smallint` | 1..31; not null ⇔ `type='credit_card'` |
| `is_active boolean not null default true` | |
| `created_by uuid not null default auth.uid()` | FK profiles |
| `created_at`, `updated_at` | |

Grants: `select`; `insert (family_id, name, type, opening_balance, opening_balance_date, institution_name, credit_limit, statement_closing_day, statement_due_day)`; `update (name, opening_balance, opening_balance_date, institution_name, credit_limit, statement_closing_day, statement_due_day, is_active)`. Sem delete.
Policies: `accounts_select` `is_family_member(family_id)`; `accounts_insert` e `accounts_update` com `has_family_role(family_id, '{owner,admin}')` no `using` e no `with check`, e `created_by = auth.uid()` no insert.
Trigger `before update`: mudar `opening_balance_date` para depois de algum lançamento não excluído da conta → `OPENING_DATE_AFTER_TRANSACTIONS`.
Trigger de auditoria `after update` (`security definer`): `account.opening_balance_changed` `{old:{amount,date}, new:{amount,date}}` (valores em `text`); `account.archived` / `account.reactivated` `{}`.

**`categories`** (ADR-0010, ADR-0019)

| Coluna | Regra |
|---|---|
| `id`, `family_id` | `family_id not null`; `unique (family_id, id)` |
| `name` | 1..50 após `btrim` |
| `type` | `income \| expense`; imutável |
| `color` | `check (color in ('chart-1','chart-2','chart-3','chart-4','chart-5','chart-6'))` |
| `icon` | `check (icon ~ '^[a-z0-9-]{1,40}$')` (o app valida a allowlist) |
| `parent_id` | FK composta `categories_parent_fk (family_id, parent_id) → categories(family_id, id)` |
| `is_default boolean not null default false` | |
| `archived_at timestamptz` | |
| `created_by`, `created_at`, `updated_at` | como em accounts |

Índice único `categories_family_name_active_key` em `(family_id, type, parent_id, lower(name)) nulls not distinct where archived_at is null`.
Grants: `select`; `insert (family_id, name, type, color, icon, parent_id)`; `update (name, color, icon, parent_id, archived_at)`; `delete`. As policies de insert, update e delete exigem owner/admin.
Trigger `before insert or update`: o pai não tem pai, é do mesmo `type`, está ativo e é diferente de si; uma categoria com filhos não vira filha → `INVALID_CATEGORY_PARENT`. Arquivar uma categoria com filhos ativos → `CATEGORY_HAS_CHILDREN`.
Excluir uma categoria referenciada por qualquer lançamento (inclusive excluído logicamente) ou por subcategoria falha por FK (`23503`). Auditoria: `category.archived` `{}`.
Seed (spec §7.5), `is_default = true`. Despesa: Moradia `house`/chart-1, Alimentação `utensils`/chart-3, Transporte `car`/chart-2, Saúde `heart-pulse`/chart-5, Educação `graduation-cap`/chart-4, Lazer `party-popper`/chart-1, Assinaturas `repeat`/chart-2, Contas domésticas `zap`/chart-3, Compras `shopping-bag`/chart-5, Outros `ellipsis`/chart-6. Receita: Salário `briefcase`/chart-1, Renda extra `hand-coins`/chart-3, Freelance `laptop`/chart-2, Rendimentos `trending-up`/chart-4, Reembolsos `undo-2`/chart-5, Outros `ellipsis`/chart-6.
`create_family` é redefinida (`create or replace`) para chamar `private.seed_default_categories` depois de inserir o owner. Atenção: o `exception when unique_violation` atual mascara qualquer violação; o seed não pode gerar duplicata. A migration faz o backfill das famílias existentes sem categorias.

**`transactions`** (ADR-0018)

| Coluna | Regra |
|---|---|
| `id`, `family_id` | `unique (family_id, id)` |
| `type` | `income \| expense \| transfer`; imutável |
| `account_id` | not null; FK `transactions_account_fk` → accounts |
| `destination_account_id` | FK `transactions_destination_account_fk`; not null ⇔ `type='transfer'`; `<> account_id` |
| `category_id` | FK `transactions_category_fk`; not null ⇔ `type in ('income','expense')` |
| `assigned_member_id` | FK `transactions_assigned_member_fk` → `family_members(family_id, id)` |
| `created_by uuid not null default auth.uid()` | FK `transactions_created_by_fk` → profiles |
| `description` | 1..120 após `btrim` |
| `amount numeric(14,2)` | `> 0` |
| `transaction_date date not null` | |
| `due_date date` | null (Etapa 5) |
| `status` | `pending \| paid \| canceled`, default `paid`. Insert aceita só `paid`/`pending`; a Etapa 3 não atualiza status |
| `notes` | null ou ≤ 1000 |
| `reversal_of_id` | FK `transactions_reversal_of_fk` → transactions |
| `idempotency_key uuid` | `unique (family_id, idempotency_key)` com nome `transactions_family_idempotency_key` |
| `deleted_at`, `deleted_by` | `check ((deleted_at is null) = (deleted_by is null))` |
| `recurrence_id`, `occurrence_date` | **não criar na Etapa 3** (Etapa 5 adiciona) |
| `created_at`, `updated_at` | |

Índices: `(family_id, transaction_date desc, created_at desc) where deleted_at is null`; `(account_id, transaction_date)`; `(destination_account_id, transaction_date) where destination_account_id is not null`; `(family_id, category_id, transaction_date)`; `(family_id, assigned_member_id)`; `(reversal_of_id) where reversal_of_id is not null`. Sem `pg_trgm`: a busca usa `ilike` dentro do recorte da família, e o volume familiar não justifica o índice. Reavaliar com medição.
Grants: `select`; `insert (family_id, type, account_id, destination_account_id, category_id, assigned_member_id, description, amount, transaction_date, status, notes, reversal_of_id, idempotency_key)`; `update (account_id, destination_account_id, category_id, assigned_member_id, description, amount, transaction_date, notes, deleted_at)`. Sem delete.
Policies:
- `transactions_select`: `is_family_member(family_id)`.
- `transactions_insert`: `with check (is_family_member(family_id) and created_by = auth.uid())`.
- `transactions_update`: `using (deleted_at is null and (has_family_role(family_id,'{owner,admin}') or created_by = auth.uid()))`, com o mesmo `with check` sem a condição de `deleted_at`. Uma linha excluída não é atualizável: não existe "desexcluir".

Triggers `before insert or update` (invariantes; erro `P0001` com o código):

| Regra | Código |
|---|---|
| categoria do mesmo `type` do lançamento | `CATEGORY_TYPE_MISMATCH` |
| no insert, ou quando a referência muda: conta, destino e categoria ativos | `ACCOUNT_ARCHIVED` / `CATEGORY_ARCHIVED` |
| no insert, ou quando muda: responsável com vínculo `active` | `INVALID_INPUT` |
| `transaction_date >= opening_balance_date` da conta e do destino | `DATE_BEFORE_OPENING_BALANCE` |
| `status='paid'` ⇒ `transaction_date <= private.today()` | `FUTURE_DATE_NOT_ALLOWED` |
| `deleted_at` passa de null a valor: o trigger fixa `deleted_at = now()` e `deleted_by = auth.uid()`; com estorno ativo → bloqueia | `TRANSACTION_HAS_REVERSALS` |
| update de `amount`, `transaction_date`, `account_id` ou `category_id` em original com estorno ativo, ou num estorno | `TRANSACTION_HAS_REVERSALS` |
| estorno (insert com `reversal_of_id`): lock `for update` do original. O original precisa ser visível, `paid`, não excluído, não `transfer` e não estorno; mesmo `type`, mesma conta e mesma categoria; data ≥ a do original | `INVALID_REVERSAL` |
| estorno: Σ estornos ativos + novo ≤ `amount` do original | `REVERSAL_EXCEEDS_REMAINING` |
| estorno: chamador owner/admin ou autor do original | `FORBIDDEN` (`42501`) |

Trigger de auditoria `after` (`security definer`; metadata **sem** descrição nem notas; valores em `text`):
- `transaction.updated` (entity = o lançamento), quando muda `amount`, `transaction_date`, `account_id`, `destination_account_id` ou `category_id`: `{ "changed": [...], "old": {...só os alterados}, "new": {...} }`.
- `transaction.deleted`: `{ "type", "amount", "transaction_date" }`.
- `transaction.reversed` (entity = o **original**): `{ "reversal_id", "amount", "transaction_date" }`.

**Funções de leitura (`public`, `security invoker`, `stable`, `grant execute` a `authenticated`)**
- `account_balances(p_as_of date default null) returns table (account_id uuid, balance text)`: D1 para todas as contas visíveis (ativas e arquivadas), com `p_as_of` nulo valendo `private.today()`. Conta só `paid`, não excluídos, `transaction_date <= p_as_of`. Estorno: o sinal é o inverso do `type`.
- `period_summary(p_from date, p_to date) returns table (income text, expense text, result text)`: D4 (transferências fora; estornos abatem pela data do estorno; cartão entra pela data da compra). `p_from > p_to` ou nulo → `INVALID_INPUT`.

**pgTAP** (`supabase/tests/database/`): `100_accounts`, `110_categories`, `120_transactions_rls`, `130_transactions_integrity`, `140_reversals`, `150_balances_regression` (R1, R2, R3, R4, R7, R8), `160_audit_financial`. Cobertura: CA-E3-01..16. O `010_security_baseline` precisa continuar verde com as tabelas novas.

### 3.2 Backend → frontend e design-system

**`src/lib/money`** (TS puro; `index.ts` reexporta). Contrato do `financial-definitions.md` §1, com dois acréscimos:

| Export | Contrato |
|---|---|
| `type Cents` | `number & { readonly __brand: "Cents" }`; inteiro seguro, `|v| <= 99_999_999_999_999` |
| `asCents(n: number): Cents` | lança se não for inteiro seguro na faixa |
| `type MoneyResult = { ok: true; value: Cents } \| { ok: false; error: "EMPTY" \| "INVALID_FORMAT" \| "TOO_MANY_DECIMALS" \| "NEGATIVE" \| "OUT_OF_RANGE" }` | |
| `parseBRL(input: string, opts?: { allowNegative?: boolean }): MoneyResult` | regras e tabela do §1. `allowNegative` aceita um `-` inicial (saldo inicial de conta com cheque especial) |
| `formatBRL(c: Cents, opts?: { signDisplay?: "auto" \| "always" \| "exceptZero" }): string` | `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })` |
| `toBRLInput(c: Cents): string` | **novo**: `123456` → `"1.234,56"` (sem `R$`; valor inicial de campo de edição) |
| `fromDbNumeric(s: string): Cents`, `toDbNumeric(c: Cents): string` | parse por string; lança em formato inválido |
| `addCents`, `subCents`, `negCents`, `sumCents(list)` | inteiros com verificação de faixa |
| `allocate(total, weights \| "equal"): Cents[]`, `percentOf(part, whole): number \| null` | D13 (R6) e exibição |

**`src/lib/dates`** (TS puro; pode usar `date-fns`, que entra com o `calendar` em A-ds; **sem** `@date-fns/tz`, porque `Intl` com `timeZone` basta):
`APP_TIME_ZONE = "America/Sao_Paulo"` · `type ISODate = string & { readonly __brand: "ISODate" }` · `today(now?: Date): ISODate` · `parseISODate(s: string): ISODate | null` (rejeita `2026-02-30`) · `isISODate(s): s is ISODate` · `formatDateBR(d: ISODate, style?: "short" | "long"): string` (`"23/10/2026"` / `"23 de out. de 2026"`) · `addDays(d, n): ISODate` · `startOfMonth(d)`, `endOfMonth(d): ISODate` · `isoToLocalDate(d): Date` e `localDateToISO(date: Date): ISODate` (só para o calendário) · `compareISODate(a, b): -1 | 0 | 1`.

**`src/lib/validation`** (Zod, compartilhado entre cliente e servidor): `money.ts` → `brlAmount({ allowNegative?: boolean; positive?: boolean })`, que recebe string e produz `Cents`, com mensagens pt-BR por erro do `parseBRL` ("Informe um valor maior que zero.", "Use vírgula para os centavos, como 1.234,56." etc.). `dates.ts` → `isoDate({ notAfterToday?: boolean })`, que produz `ISODate` (data ≥ `2000-01-01`).

**Códigos novos de `ErrorCode`** (`src/server/action.ts`; mensagem com próximo passo em `error-messages.ts`; mapeamento em `errors.ts`):
`ACCOUNT_ARCHIVED`, `CATEGORY_ARCHIVED`, `CATEGORY_TYPE_MISMATCH`, `DATE_BEFORE_OPENING_BALANCE`, `OPENING_DATE_AFTER_TRANSACTIONS`, `FUTURE_DATE_NOT_ALLOWED`, `INVALID_REVERSAL`, `REVERSAL_EXCEEDS_REMAINING`, `TRANSACTION_HAS_REVERSALS`, `CATEGORY_HAS_CHILDREN`, `INVALID_CATEGORY_PARENT` (vêm de `P0001`); `CATEGORY_IN_USE` (`23503` ao excluir categoria; mapeado no service de categorias); `NAME_TAKEN` (`23505` em `accounts_family_name_active_key`/`categories_family_name_active_key`; devolvido com `fieldErrors.name`). Mapeamento genérico novo: `23514` → `VALIDATION_ERROR`. Erros de campo conhecidos voltam em `fieldErrors` (`amount`, `transactionDate`, `accountId`, `categoryId`, `openingBalanceDate`).

**Constantes** — `src/modules/accounts/constants.ts`: `ACCOUNT_TYPES` (tupla) e `ACCOUNT_TYPE_LABELS` (pt-BR: Conta corrente, Poupança, Dinheiro, Cartão de crédito, Carteira digital, Investimento, Outra). `src/modules/categories/constants.ts`: `CATEGORY_COLORS = ["chart-1", ..., "chart-6"] as const`, `CATEGORY_ICONS` (tupla: `house utensils car fuel heart-pulse graduation-cap book-open party-popper plane dumbbell repeat zap receipt shopping-bag shirt gift baby dog smartphone ellipsis briefcase hand-coins laptop trending-up piggy-bank undo-2 wallet landmark banknote credit-card`), tipos `CategoryColor`, `CategoryIconName`.

**Schemas Zod** (o frontend usa `zodResolver` e `z.input`; nenhum tem `family_id`; `id`s são `z.uuid()`; strings com `trim`; string vazia em campo opcional vira `undefined`):

| Arquivo · export | Campos |
|---|---|
| `accounts/schemas.ts` · `createAccountSchema` | `name` 1..60 · `type` · `institutionName?` ≤ 80 · `openingBalance` string (não cartão: `allowNegative`; cartão: valor positivo da dívida, que a saída torna `<= 0`) · `openingBalanceDate` (≤ hoje) · `creditLimit?` (> 0, só cartão) · `statementClosingDay`, `statementDueDay` 1..31 (obrigatórios sse cartão; erro no campo) |
| `updateAccountSchema` | `accountId` + os mesmos campos, **sem** `type` (o service lê o tipo do banco para interpretar `openingBalance`) |
| `accountIdSchema` | `{ accountId }` |
| `categories/schemas.ts` · `createCategorySchema` | `name` 1..50 · `type` · `color` ∈ `CATEGORY_COLORS` · `icon` ∈ `CATEGORY_ICONS` · `parentId?` |
| `updateCategorySchema` / `categoryIdSchema` | `categoryId`, `name`, `color`, `icon`, `parentId` (uuid ou null) / `{ categoryId }` |
| `transactions/schemas.ts` · `transactionInputSchema` | união discriminada por `type`. `income`/`expense`: `description` 1..120, `amount` (positivo), `transactionDate` (≤ hoje), `accountId`, `categoryId`, `assignedMemberId?`, `notes?` ≤ 1000. `transfer`: igual, sem `categoryId`, com `destinationAccountId` ≠ `accountId` (erro em `destinationAccountId`). Ambos com `idempotencyKey: z.uuid()` |
| `updateTransactionSchema` | `transactionId` + os mesmos campos (`type` presente só para discriminar; diferente do banco → `VALIDATION_ERROR`) |
| `reverseTransactionSchema` | `transactionId`, `amount`, `transactionDate` (≤ hoje), `description?` (padrão `"Estorno: <descrição original>"` cortado em 120), `idempotencyKey` |
| `transactionIdSchema` | `{ transactionId }` |
| `transactionFiltersSchema` | parâmetros de URL, **tolerante**: valor inválido vira o padrão, nunca erro. `de`, `ate` (ISODate) · `tipo` (`receita\|despesa\|transferencia`) · `conta`, `categoria` (uuid) · `responsavel` (uuid ou `nenhum`) · `q` (trim, ≤ 100) · `ordem` (`data_desc` (padrão) `\|data_asc\|valor_desc\|valor_asc`) · `pagina` (int ≥ 1, padrão 1) · `por_pagina` (20 (padrão) `\|50\|100`) |

**Server Actions** (`"use server"`, todas por `runAction`, `auth: "required"`; a família vem de `requireMembership()`; depois do sucesso, `revalidatePath` das rotas afetadas entre `/transacoes`, `/contas`, `/categorias` e `/inicio`):

| Arquivo · função | Retorno | Comportamento |
|---|---|---|
| `accounts/actions.ts` · `createAccount(input)` | `ActionResult<{ id: string }>` | `FORBIDDEN` (member), `NAME_TAKEN` |
| `updateAccount(input)` | `ActionResult<null>` | `FORBIDDEN`, `NOT_FOUND`, `NAME_TAKEN`, `OPENING_DATE_AFTER_TRANSACTIONS` |
| `archiveAccount({ accountId })` / `reactivateAccount({ accountId })` | `ActionResult<null>` | idempotentes; `FORBIDDEN`, `NOT_FOUND`; reativar com o nome já usado → `NAME_TAKEN` |
| `categories/actions.ts` · `createCategory`, `updateCategory` | `{ id }` / `null` | `FORBIDDEN`, `NAME_TAKEN`, `INVALID_CATEGORY_PARENT` |
| `archiveCategory`, `unarchiveCategory`, `deleteCategory` (`{ categoryId }`) | `null` | `CATEGORY_HAS_CHILDREN`, `CATEGORY_IN_USE` (a mensagem sugere arquivar) |
| `transactions/actions.ts` · `createTransaction(input)` | `ActionResult<{ id: string }>` | cria `paid`. Repetir a `idempotencyKey` (`23505` em `transactions_family_idempotency_key`) devolve `ok` com o `id` existente. Erros da tabela da §3.1 |
| `updateTransaction(input)` | `ActionResult<null>` | o update retorna 0 linhas: se o lançamento é visível, `FORBIDDEN`; senão, `NOT_FOUND` |
| `deleteTransaction({ transactionId })` | `ActionResult<null>` | exclusão lógica (`deleted_at`); `TRANSACTION_HAS_REVERSALS`, `FORBIDDEN`, `NOT_FOUND` |
| `reverseTransaction(input)` | `ActionResult<{ id: string }>` | lê o original, insere o estorno com a mesma conta e categoria; idempotente pela chave |

**Queries** (`server-only`; montantes como `Cents`, datas como `ISODate`):

| Função | Retorno |
|---|---|
| `accounts/queries.ts` · `getAccountsOverview()` | `{ accounts: AccountView[]; consolidatedBalance: Cents; openCardDebt: Cents }`. `consolidatedBalance` = D3 (contas de ativo, inclusive arquivadas); `openCardDebt` = D8 (soma de −saldo dos cartões negativos). Fórmulas em `accounts/domain/balances.ts` (puro, testado) |
| `getAccount(id)` | `AccountView \| null` |
| `listAccountOptions()` | `{ id; name; type; isActive }[]` (o formulário mostra só as ativas, mais a atual na edição; o filtro mostra todas) |
| `AccountView` | `{ id; name; type; institutionName: string \| null; isActive; openingBalance: Cents; openingBalanceDate: ISODate; creditLimit: Cents \| null; statementClosingDay: number \| null; statementDueDay: number \| null; balance: Cents; availableCredit: Cents \| null }` |
| `categories/queries.ts` · `listCategories({ includeArchived? })` | `CategoryView[]` = `{ id; name; type; color: CategoryColor; icon: CategoryIconName; parentId: string \| null; isDefault; archivedAt: string \| null }`. Ícone fora da allowlist vira `ellipsis` |
| `listCategoryOptions(type)` | ativas, pais seguidos das filhas: `{ id; name; parentId; color; icon }[]` |
| `transactions/queries.ts` · `listTransactions(filters)` | `{ items: TransactionListItem[]; total: number; page: number; pageSize: number; pageCount: number }`. Exclui os excluídos; inclui os estornos. `conta` filtra origem **ou** destino; `categoria` inclui as subcategorias; `q` usa `ilike` com `%`, `_` e `\` escapados. Ordem estável: chave escolhida, depois `created_at desc`, depois `id`. Paginação por offset (`range`) com `count: "exact"` |
| `TransactionListItem` | `{ id; type; description; amount: Cents; direction: "in" \| "out" \| "neutral"; transactionDate: ISODate; status; account: { id; name }; destinationAccount: { id; name } \| null; category: { id; name; color; icon } \| null; assignedMember: { id; displayName: string \| null } \| null; reversalOfId: string \| null; canManage: boolean }`. `direction` vem de `transactions/domain/effect.ts`: transferência é `neutral`, salvo com filtro de conta (saída `out`, entrada `in`); estorno inverte |
| `getTransaction(id)` | `TransactionDetail \| null` = item + `notes`, `createdBy: { id; displayName }`, `createdAt`, `updatedAt`, `reversals: { id; amount; transactionDate }[]`, `reversibleAmount: Cents`, `canEdit`, `canDelete`, `canReverse`, `history: HistoryEntry[] \| null` (`null` para member: a RLS de `audit_events` não deixa ler) |
| `getPeriodSummary(from, to)` | `{ income: Cents; expense: Cents; result: Cents }` (D4, via `period_summary`; consumida pelos testes de regressão e pela Etapa 4) |

`family/permissions.ts`: `can()` ganha `"account.manage" | "category.manage" | "transaction.manage_any"`, e entra `canManageTransaction(role, createdBy, userId): boolean`. As duas são só UX e espelham a `permissions.md`.
`src/proxy.ts` (`PRIVATE_PREFIXES`) e `src/lib/safe-redirect.ts` (allowlist) passam a incluir `/transacoes`, `/contas` e `/categorias`.
Repositories selecionam colunas explícitas e montantes **só** com `::text` (`amount::text`, `opening_balance::text`, `credit_limit::text`) ou pelas funções da §3.1.

### 3.3 Design-system → frontend

**A-ds:** `pnpm dlx shadcn@latest add select popover calendar table pagination textarea radio-group input-group`. **Não** use `--overwrite`: `button`, `input` e `textarea` (dependências do `input-group`) não podem ser sobrescritos. Confira depois que o teste de `Button loading` continua passando e que o diff de `button.tsx` e `input.tsx` está vazio. Confira também que `package.json` ganhou só `react-day-picker` e `date-fns`; se aparecer o pacote npm `cn`, ele sai (SEC-9). Combobox, command, drawer, switch e checkbox ficam de fora (listas curtas; o `Select` atende).

**Componentes `shared/` (Fase B)** — tokens apenas, foco visível, alvo ≥ 40px, estados disabled/erro (`aria-invalid`), pt-BR:

| Arquivo · export | Contrato |
|---|---|
| `money-input.tsx` · `MoneyInput` | client; props de `Input` menos `type`/`value`/`onChange` + `value: string`, `onChange(v: string)`, `allowNegative?`. Prefixo visual "R$" (`InputGroupAddon`, `aria-hidden`), `inputMode="decimal"`, `autoComplete="off"`, `tabular-nums`. No `blur`, se `parseBRL` der certo, reescreve com `toBRLInput`; se der errado, mantém o texto (o erro vem do schema). Funciona com `{...field}` do `Controller` |
| `money.tsx` · `Money` | sem `"use client"`; `{ cents: Cents; direction?: "in" \| "out" \| "neutral"; className? }`. `formatBRL`, `tabular-nums`; `in` = `text-income` com "+", `out` = `text-expense` com "−", `neutral` sem sinal. O sinal é texto, não só cor |
| `date-picker.tsx` · `DatePicker` | client; `{ id; value: string; onChange(v: string); today: ISODate; min?: ISODate; max?: ISODate; disabled?; "aria-invalid"?; "aria-describedby"? }`. Botão com ícone de calendário que mostra "Hoje", "Ontem" ou `dd/mm/aaaa`; `Popover` + `Calendar` (`locale` ptBR de `date-fns/locale`); datas fora de `min`/`max` desabilitadas; teclado do react-day-picker; atalhos "Hoje" e "Ontem" no popover |
| `segmented-control.tsx` · `SegmentedControl<T extends string>` | client; sobre `radio-group`; `{ value: T; onValueChange(v: T); options: { value: T; label: string; icon?: LucideIcon; tone?: "default" \| "income" \| "expense" }[]; "aria-label": string; disabled? }`. Trilho `bg-muted`; o item marcado usa `tone` (expense: fundo `danger-soft` com texto `foreground`, como Despesa no mockup) |
| `responsive-list.tsx` · `ResponsiveList<T>` | **sem `"use client"`** (aceita funções vindas de RSC); `{ items: T[]; getKey(i): string; caption: string; columns: { id: string; header: string; cell(i): ReactNode; align?: "start" \| "end"; className? }[]; renderCard(i): ReactNode }`. ≥ `md` renderiza `Table` com `<caption class="sr-only">`; < `md` renderiza `<ul>` de cartões (`rounded-xl border bg-card`). A versão oculta fica com `hidden` (fora da árvore de acessibilidade) |
| `pagination-nav.tsx` · `PaginationNav` | sem `"use client"`; `{ page: number; pageCount: number; hrefForPage(p: number): string }`; `nav aria-label="Paginação"`, anterior/próxima, até 5 números com `aria-current="page"`; no celular, só anterior/próxima + "Página X de Y". Links com `next/link` |
| `filters-panel.tsx` · `FiltersPanel` | client; `{ children; activeCount: number; onClear(): void }`. ≥ `md`: linha que quebra (`flex-wrap gap-3`) + "Limpar filtros". < `md`: botão "Filtros (n)" que abre `Sheet` (`side="bottom"`, dentro da safe area) com os filtros, "Limpar" e "Ver resultados" |
| `search-input.tsx` · `SearchInput` | client; props de `Input` + `onClear()`; `type="search"`, lupa, botão "Limpar busca" (`aria-label`) quando há texto |
| `category-icon.tsx` · `CategoryIcon`, `CATEGORY_ICON_COMPONENTS` | sem `"use client"`; `{ icon: CategoryIconName; color: CategoryColor; size?: "sm" \| "md" }`; quadrado `rounded-lg` com fundo `bg-<color>/15` e ícone `text-<color>`; decorativo (`aria-hidden`), porque o nome está sempre ao lado. `CATEGORY_ICON_COMPONENTS: Record<CategoryIconName, LucideIcon>`: um ícone que falte quebra o typecheck |

Tokens: **nenhum novo**. As cores de categoria são `chart-1..6` (ADR-0019). `docs/design-system.md` ganha a seção desses componentes, o padrão de lista responsiva e a medição de `chart-1..6` sobre `card` nos dois temas, indicando que o ícone é decorativo.

### 3.4 Rotas e telas (frontend)

Todas em `src/app/(app)/` (o guard `requireMembership` já existe), Server Components por padrão, `loading.tsx` com `Skeleton` e o `error.tsx` do grupo. Filtros, ordem e página ficam na URL (o reload preserva). Formulários seguem a ADR-0017 (`method="post"`, `useHydrated`, `startTransition`, `setError` com `fieldErrors`, dados mantidos em falha, `UNAUTHENTICATED` → `/login?motivo=sessao_expirada&next=<rota>`) e o padrão `Field` + `Controller` do `docs/design-system.md`.

| Rota | Arquivo | Conteúdo e estados |
|---|---|---|
| `/transacoes` | `transacoes/page.tsx` | `PageHeader` "Transações" com a ação "Nova transação". `FiltersPanel` com período (`DatePicker` de/até + atalhos "Este mês"/"Mês passado"), tipo, conta, categoria, responsável e `SearchInput` (debounce de 300 ms; `router.replace`). Ordem por `Select`. `ResponsiveList` com data, descrição + categoria (`CategoryIcon`) + conta (transferência: "Origem → Destino"), responsável e `Money` com `direction`; estorno com `Badge` "Estorno". Cada linha leva a `/transacoes/[id]`. `PaginationNav` + "N lançamentos". Estados: sem conta ("Cadastre uma conta primeiro" → `/contas/nova`, ou orientação para member); sem lançamentos ("Nenhum lançamento ainda" → Nova transação); filtros sem resultado ("Nenhum lançamento encontrado" → Limpar filtros); página além da última (link para a página 1) |
| `/transacoes/nova` | `transacoes/nova/page.tsx` | **Mockup tela 3**: voltar ("‹ Transações") + título "Nova transação"; cartão `max-w-xl`. `SegmentedControl` **Despesa \| Receita \| Transferência** (padrão Despesa; `?tipo=` pré-seleciona). Campos na ordem do mockup: Descrição (placeholder "Ex.: Supermercado"), Categoria (`Select` com `CategoryIcon`, filhas indentadas), Valor (`MoneyInput`, "0,00"), Data (`DatePicker`, padrão Hoje, `max` = hoje), "Conta ou cartão" (`Select`; no mockup, "Forma de pagamento"). Transferência: "Conta de origem" e "Conta de destino" no lugar de Categoria/Conta. Depois: Responsável (`Select`, padrão "Sem responsável", integrantes ativos de `getFamilyOverview`) e Observações (`Textarea`). Botão primário de largura total "Salvar despesa", "Salvar receita" ou "Salvar transferência" (`loading`). `idempotencyKey` gerada uma vez por montagem. Sucesso: toast "Lançamento salvo" → `/transacoes`. `?conta=` pré-seleciona a conta |
| `/transacoes/[id]` | `transacoes/[id]/page.tsx` | detalhe: valor (`Money`), tipo, data, conta(s), categoria, responsável, observações, quem criou, estornos e "Valor ainda estornável". Ações conforme `can*`: Editar, Estornar (`Dialog` com `MoneyInput` (padrão = o estornável) + `DatePicker`), Excluir (`AlertDialog`: "O lançamento deixa de contar nos saldos e totais. O registro fica no histórico."). "Histórico de alterações" (owner/admin): "Valor: R$ 200,00 → R$ 250,00 · Ana · 23/10/2026". Lançamento inexistente, de outra família ou excluído → `notFound()` |
| `/transacoes/[id]/editar` | `transacoes/[id]/editar/page.tsx` | o mesmo formulário com `type` fixo (controle segmentado desabilitado). Sem permissão → `notFound()`. Campos financeiros travados (com explicação) quando há estorno ou é estorno |
| `/contas` | `contas/page.tsx` | `PageHeader` "Contas" + "Nova conta" (owner/admin). Cartão de resumo "Saldo total" (D3, com o texto "Soma das contas, sem cartões de crédito") e "Faturas em aberto" (D8) quando houver cartão. `Tabs` Ativas \| Arquivadas. Cada conta: ícone por tipo, nome, tipo, instituição e saldo (`Money`); no cartão, dívida + limite disponível. Ações: Ver movimentações (`/transacoes?conta=<id>`), Nova transação (`/transacoes/nova?conta=<id>`), Transferir, Editar, Arquivar/Reativar (`AlertDialog` ao arquivar: "A conta continua no saldo total e no histórico; não recebe lançamentos novos."). Vazio: "Nenhuma conta cadastrada" → Nova conta (member: "Peça a quem administra a família para cadastrar as contas.") |
| `/contas/nova`, `/contas/[id]/editar` | `contas/nova/page.tsx`, `contas/[id]/editar/page.tsx` | nome, tipo (`Select`; travado na edição), instituição, saldo inicial (`MoneyInput` `allowNegative`; cartão: "Fatura atual (valor devido)", positivo), "Saldo em" (`DatePicker`), e, só para cartão: limite, dia de fechamento e dia de vencimento. Member → `notFound()`. Sucesso → `/contas` |
| `/categorias` | `categorias/page.tsx` | `Tabs` Despesas \| Receitas e filtro Ativas/Arquivadas; lista com `CategoryIcon`, nome, "Padrão" (`Badge` secondary) e subcategorias indentadas. Owner/admin: "Nova categoria" e Editar em `Dialog` (nome, tipo (só na criação), cor (6 opções em `radio-group` com nome acessível "Cor 1".."Cor 6"), ícone (grade da allowlist em `radio-group`), "Subcategoria de" (opcional)); Arquivar/Reativar; Excluir (`AlertDialog`; `CATEGORY_IN_USE` → "Esta categoria tem lançamentos. Arquive-a para escondê-la dos formulários.") |
| `/inicio` | `inicio/page.tsx` | continua **sem números** (dashboard é Etapa 4). `EmptyState` conforme o estado: sem contas → "Cadastre sua primeira conta" (owner/admin → `/contas/nova`; member: orientação); com contas e sem lançamentos → "Registre seu primeiro lançamento" → `/transacoes/nova`; senão, atalhos "Nova transação" e "Ver transações". Este é o passo "primeira conta + saldo inicial" do onboarding (spec §7.1), retomável |

`src/config/navigation.ts`: Início (primary), Transações (`/transacoes`, `ArrowLeftRightIcon`, primary), Contas (`/contas`, `WalletIcon`, primary), Família (primary), Categorias (`/categorias`, `TagsIcon`, more), Configurações (more). O item ativo também casa subrotas (`/transacoes/nova` marca Transações).

### 3.5 Dependências novas

| Pacote | Quem instala | Quando |
|---|---|---|
| `react-day-picker`, `date-fns` | design-system, pelo `shadcn add calendar` | A-ds |
| qualquer outra (inclusive `@date-fns/tz`, Recharts, TanStack Table) | proibida nesta etapa; pedido §8 | — |

## 4. Fluxo de dados (resumo)

Formulário (string pt-BR) → Zod (`brlAmount` → `Cents`) → action → service → repository (`toDbNumeric` → `"1234.56"`) → PostgREST (RLS + triggers) → Postgres. Leitura: Postgres → `::text` / funções `text` → `fromDbNumeric` → `Cents` → RSC → `Money`/`formatBRL`.

## 5. Entregas e aceite por agente

### 5.1 database
Migrations da §3.1, sem SQL destrutivo sobre dados existentes. O backfill de categorias é idempotente. pgTAP da §3.1; `pnpm db:types`.
Aceite: `pnpm db:reset && pnpm db:test` 100% verde do zero; `pnpm db:lint` sem erro; CA-E3-01..16; nenhuma função `security definer` sem `search_path=''`; `anon` sem privilégio nas tabelas e funções novas; `period_summary` e `account_balances` são `security invoker` (`prosecdef = false`).

### 5.2 backend
A-be: interfaces + `lib/money` e `lib/dates` completos com testes. B: repositories, services, actions, queries, domínio (`accounts/domain/balances.ts`, `transactions/domain/effect.ts`), códigos de erro, `proxy`/`safe-redirect`, testes de integração.
Aceite: CA-E3-30..39; `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:integration` verdes; `grep -rnE "parseFloat|toFixed\(" src/lib/money src/modules/{accounts,categories,transactions}` vazio; todo arquivo de servidor novo com `import "server-only"`.

### 5.3 design-system
A-ds: `shadcn add` (§3.3) com as conferências. B: os 9 componentes `shared/` + testes RTL + `docs/design-system.md`.
Aceite: CA-E3-70..73; `grep -rEn "#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(" src --include=*.tsx` vazio; `pnpm lint`, `typecheck` e `test` verdes.

### 5.4 frontend
Telas da §3.4, componentes de módulo, navegação, E2E (`e2e/contas.spec.ts`, `categorias.spec.ts`, `transacoes.spec.ts`; desktop e mobile).
Aceite: CA-E3-50..62; RTL do `TransactionForm` (validação de valor, troca de tipo, `loading`, `fieldErrors` do servidor, dados mantidos em falha) e do `AccountForm` (campos de cartão condicionais); nenhuma importação de `repository`/`service`/`@/lib/supabase/*` em arquivo `"use client"`; nenhuma fórmula financeira em componente (só `Money`, `formatBRL` e `direction` vindos do backend).

## 6. Integração (Fase C)

Ordem: `pnpm install` → `pnpm db:reset` → `pnpm db:types` (sem diff) → `pnpm check` → `pnpm build` → `pnpm db:test` → `pnpm test:integration` → `pnpm test:e2e` → `node ~/.claude/factory/security/gate.mjs "<projeto>"` → revisão (reviewer + security, mudança `structural`: tabelas novas, RLS, triggers definer).
Etapa 3 concluída = CA-E3-* verdes + regra de conclusão do `acceptance-criteria.md`. O architect atualiza o `data-model.md` (§2, §5.1–5.3 e catálogo de auditoria) e o `financial-definitions.md` §1 (`allowNegative`, `toBRLInput`) para o estado implementado.

## 7. Bloqueadores e riscos

| Item | Impacto | Afeta |
|---|---|---|
| Docker Desktop rodando | sem `db:test`, integração e E2E | Etapa 3 (bloqueante) |
| Correções das Etapas 1–2 em curso (SEC-1/SEC-11: `method="post"`, `useHydrated` e `logging.serverFunctions` ainda não estavam no código em 2026-10-23) | os formulários novos repetiriam o defeito | pré-condição da Fase B |
| Spec truncada na §15 | regras do autor podem faltar | confirmar com o usuário (segue aberto) |
| Concorrência de edição (a última gravação vence) | dois integrantes editando o mesmo lançamento | aceito no MVP; os dois ficam auditados |
| Busca sem `pg_trgm` | `ilike` faz varredura dentro da família | aceito; medir na Etapa 9 |

## 8. Pedido de mudança

Formato no handoff: `CR-<agente>-<n>: <arquivo/interface> — <mudança> — <motivo> — <impacto em quem>`.
O orchestrator decide. Se uma interface da §3 muda, este documento sobe de versão (1.1) antes da implementação.
