# Contrato de execução — Etapa 5 (contas a pagar e receber, recorrências e orçamentos)

Versão 1.1 (2026-10-24) · Dono: orchestrator/architect · Alteração só por pedido ao orchestrator (§8).
**v1.1 (emendas pós-revisão, migration `20261024101100_etapa5_review_fixes.sql`; ADR-0023 §5–§8):** (a) reativar junto com mudar `end_date`: o ponteiro parte do valor recalculado (`on_or_after(hoje)`), não do antigo (D12); (b) `start_date >= hoje − 12 meses` no insert de `recurrences` (`INVALID_INPUT`, depois de `DATE_BEFORE_OPENING_BALANCE`); (c) `materialize_recurrences()` pula séries com `last_failure_at` há menos de 1 hora; (d) ramo "autor" de `recurrences_update` e `transactions_update` exige `is_family_member`; (e) `getPendingCommitted` devolve só o "a pagar" (D14). Mapeamento de `23503` (FK) para erro de validação no app (SEC-22). Nenhuma interface do frontend mudou.
Referências: spec §7.3 ("identificar recorrentes"), §7.6, §7.7, §7.8, §9, §11 Etapa 5, §13; `financial-definitions.md` v1.1 (D6, D7, D12, D14, D19; R3, R5, R12–R14);
`permissions.md` §2 (linhas Contas a pagar, Recorrências, Orçamentos, aprovadas); `acceptance-criteria.md` (CA-E5-*); `threat-model.md` §3.10 (AB-90..99);
ADRs 0004, 0011, 0012, 0015, 0018, **0022**, **0023**, **0024**; contratos `etapa-3.md` v1.0 e `etapa-4.md` v1.0 (regras e interfaces herdadas).
**Onde este contrato e o `data-model.md` §5.3–5.5 divergirem, vale este contrato.**

## 0. Regras do contrato

1. Valem as regras do `etapa-3.md` §0 e do `etapa-4.md` §0 (um arquivo, um dono; dinheiro sem ponto flutuante; "hoje" em São Paulo; uma fórmula, um lugar; sem cache de dados de família; nenhum `family_id` em action).
2. **Nenhum número realizado depende de job ou da materialização**: saldos e totais só contam `paid`; pendentes só aparecem como "previsto/comprometido".
3. **Status muda só pelas RPCs** `pay_pending_transaction` e `cancel_pending_transaction` (ADR-0022). Nenhum código do app faz `update ... status`.
4. **Materialização só pelo backend**: `ensureRecurrencesMaterialized()` (§3.2). O frontend nunca chama a RPC nem decide quando chamá-la.
5. Fora do escopo: notificações e lembretes (Etapa 7: a Etapa 5 só mostra o estado na UI); pagamento parcial; desfazer pagamento; recorrência de transferência; toggle "Repetir" no formulário de Nova transação (ADR-0023 §1); orçamento por período personalizado; metas e divisão (Etapa 6); `pg_cron`; job agendado. Não criar rota, tabela, coluna ou componente para eles.
6. **Pré-condição de dados:** o trigger `private.transactions_before_write` é redefinido por inteiro (`create or replace`). A versão nova **contém toda a lógica** da migration `20261024100400` mais os acréscimos da §3.1. O pgTAP 120–170 da Etapa 3 precisa continuar verde.

## 1. Fases e sequência

Pré-condição: Etapa 4 integrada (CA-E4-* verdes). A-db da Etapa 5 pode começar quando a migration da Etapa 4 estiver pronta (só os timestamps precisam vir depois); as demais fases esperam a Etapa 4 concluída, porque `/inicio` e `reports` mudam de novo.

| Fase | Quem | O quê | Pode começar quando |
|---|---|---|---|
| A-db | database | migrations, triggers, RPCs, funções e pgTAP da §3.1; `pnpm db:types` assim que tabelas e colunas existirem | pré-condição de A-db |
| A-ds | design-system | `pnpm dlx shadcn@latest add switch progress` **sem** `--overwrite`; conferir que `package.json` **não mudou** (Base UI já está instalado; se o shadcn adicionar pacote, parar e abrir pedido §8); `pnpm outdated`/`audit` e atualização do que estiver atrás (único momento em que `package.json` pode mudar). Depois, `shared/progress-meter.tsx` e `shared/sub-nav.tsx` | pré-condição |
| A-be | backend | **interfaces publicadas primeiro**: `modules/{bills,recurrences,budgets}/{constants,types,schemas}.ts`, `domain/**` completo e testado (TS puro), extensão de `ErrorCode`, `family/permissions.ts`, alterações de tipo em `transactions/types.ts` | pré-condição |
| B | backend + frontend em paralelo (DS termina testes e doc; database termina pgTAP) | backend: repositories, services, actions, queries, `ensureRecurrencesMaterialized`, mudanças em `transactions` e `reports`, integração. Frontend: telas da §3.4 | A-ds e A-be concluídas (backend: também `database.ts`) |
| C | orchestrator (+ QA, reviewer, security) | integração (§6); architect atualiza `data-model.md` §2, §5.3–5.5 e o catálogo de auditoria | todos de B entregues |

## 2. Mapa de donos (acréscimos; os mapas anteriores continuam valendo)

| Caminho | Dono |
|---|---|
| `supabase/migrations/2026*_etapa5_*.sql`, `supabase/tests/database/3[0-9]0_*.test.sql`, `src/types/database.ts` | database |
| `src/modules/{bills,recurrences,budgets}/**` **exceto** `components/` | backend |
| `src/modules/transactions/**` exceto `components/` (filtro `paid`, `recurrenceId`, `dueDate`, histórico) e `src/modules/reports/**` exceto `components/` (`upcomingBills`) | backend |
| `src/modules/family/permissions.ts`, `src/server/{action,errors,error-messages}.ts`, `src/proxy.ts`, `src/lib/safe-redirect.ts` | backend |
| `tests/integration/{bills,recurrences,budgets,etapa5-regression}.test.ts` | backend |
| `src/components/ui/{switch,progress}.tsx` (gerados), `src/components/shared/{progress-meter,sub-nav}.tsx` e testes, `docs/design-system.md`, `package.json`/`pnpm-lock.yaml` (só A-ds) | design-system |
| `src/app/(app)/{compromissos,recorrencias,orcamentos}/**`, `src/app/(app)/transacoes/**`, `src/app/(app)/inicio/**`, `src/config/navigation.ts`, `src/components/layout/**` (item ativo por prefixos) | frontend |
| `src/modules/{bills,recurrences,budgets,transactions,reports}/components/**` | frontend |
| `e2e/{compromissos,recorrencias,orcamentos}.spec.ts`, `e2e/inicio.spec.ts`, `e2e/transacoes.spec.ts`, `e2e/helpers/**` | frontend |
| `docs/**` (exceto `docs/design-system.md`), `.claude/**` | orchestrator/architect |

## 3. Interfaces

### 3.1 Database → backend

Convenções do `data-model.md` §1 e do `etapa-3.md` §3.1. Os nomes de constraint fazem parte do contrato. O database pode reorganizar as migrations, mas a ordem sugerida é: `etapa5_recurrences` → `etapa5_transactions_bills` → `etapa5_materialization` → `etapa5_budgets`.

**Agenda (`private`, `language sql`, `immutable`, `set search_path = ''`; `grant execute` a `authenticated` só se uma policy precisar; usadas por triggers, RPC e pgTAP)**
- `private.recurrence_occurrence(p_start date, p_frequency text, p_interval smallint, p_n integer) returns date`: D12. `weekly` = `p_start + 7·p_interval·p_n`; `monthly` = `(p_start + make_interval(months => p_interval·p_n))::date` (o Postgres leva o dia âncora maior que o mês para o último dia, sem deriva, porque cada data parte de `p_start`); `yearly` = `+ make_interval(years => p_interval·p_n)`.
- `private.recurrence_next_on_or_after(p_start date, p_frequency text, p_interval smallint, p_date date) returns date`: primeira ocorrência ≥ `greatest(p_date, p_start)`.

**`recurrences`** (ADR-0023)

| Coluna | Regra |
|---|---|
| `id`, `family_id` | `unique (family_id, id)` (`recurrences_family_id_id_key`); FK families |
| `type` | `income \| expense`; imutável |
| `account_id` | not null; FK `recurrences_account_fk` → accounts |
| `category_id` | not null; FK `recurrences_category_fk` → categories |
| `assigned_member_id` | FK `recurrences_assigned_member_fk` → family_members |
| `description` | 1..120 após `btrim` |
| `amount numeric(14,2)` | `> 0`, `<> 'NaN'`, `<= 99999999.99` |
| `frequency` | `weekly \| monthly \| yearly`; imutável |
| `interval_count smallint not null default 1` | 1..12; imutável |
| `start_date date not null` | `>= '2000-01-01'`; imutável |
| `end_date date` | null ou `>= start_date` |
| `next_occurrence_date date not null` | do banco (fora dos grants): primeira data da agenda ainda não materializada |
| `is_active boolean not null default true` | |
| `last_failure_code text`, `last_failure_at timestamptz` | do banco; `check (last_failure_code ~ '^[A-Z_]{1,40}$')`; `(last_failure_code is null) = (last_failure_at is null)` |
| `idempotency_key uuid` | `recurrences_family_idempotency_key unique (family_id, idempotency_key)` |
| `created_by uuid not null default auth.uid()` | FK `recurrences_created_by_fk` → profiles |
| `created_at`, `updated_at` | |

Índice: `recurrences_family_next_idx (family_id, next_occurrence_date) where is_active`.
Grants: `select`; `insert (family_id, type, account_id, category_id, assigned_member_id, description, amount, frequency, interval_count, start_date, end_date, idempotency_key)`; `update (account_id, category_id, assigned_member_id, description, amount, end_date, is_active)`. Sem delete.
Policies: `recurrences_select` `is_family_member`; `recurrences_insert` `with check (is_family_member(family_id) and created_by = auth.uid())`; `recurrences_update` `using`/`with check` `has_family_role(family_id,'{owner,admin}') or (created_by = auth.uid() and is_family_member(family_id))` (v1.1; o mesmo ramo vale em `transactions_update`).
Trigger `before insert or update` (invoker; `P0001` com o código):

| Regra | Código |
|---|---|
| insert, mudança de conta ou reativação: conta ativa | `ACCOUNT_ARCHIVED` |
| categoria do mesmo `type`; insert, mudança ou reativação: categoria ativa | `CATEGORY_TYPE_MISMATCH` / `CATEGORY_ARCHIVED` |
| responsável com vínculo `active` (insert ou mudança) | `INVALID_INPUT` |
| `start_date` (no insert) e `greatest(start_date, today)` (na mudança de conta) ≥ `opening_balance_date` da conta | `DATE_BEFORE_OPENING_BALANCE` |
| insert ou reativação: no máximo 100 séries ativas por família (contagem sob `pg_advisory_xact_lock` da família: member não pode travar `families`) | `RECURRENCE_LIMIT_REACHED` |
| insert: `next_occurrence_date := start_date` | — |
| reativação (`false → true`): `next_occurrence_date := recurrence_next_on_or_after(..., today)` | — |
| mudança de `end_date`: `next_occurrence_date := least(base, recurrence_next_on_or_after(..., today))`, em que `base` = o ponteiro já recalculado pela reativação (se `false → true` na mesma escrita), senão `old.next_occurrence_date` (v1.1) | — |
| insert: `start_date >= today − 12 meses` (v1.1; depois da checagem de saldo inicial) | `INVALID_INPUT` |
| update que muda coluna editável (`account_id`, `category_id`, `assigned_member_id`, `description`, `amount`, `end_date`, `is_active`): `last_failure_code`/`last_failure_at := null`. Updates feitos só pela materialização (`next_occurrence_date`, `last_failure_*`) não passam por esta regra nem pela propagação | — |

Trigger `after update` (`security definer`; propagação, ADR-0023 §4). **Intocada** = ocorrência da série com `status='pending'`, `deleted_at is null`, `occurrence_date >= today`, `transaction_date = occurrence_date`, `notes is null` e `amount`, `description`, `account_id`, `category_id`, `assigned_member_id` iguais aos **OLD** da série. Ações, nesta ordem:
1. pausa (`true → false`): `delete` das intocadas;
2. `end_date` nova não nula: `delete` das intocadas com `occurrence_date > new.end_date`;
3. mudança de `amount`/`description`/`account_id`/`category_id`/`assigned_member_id`: `update` das intocadas restantes com os valores NEW (os triggers de lançamentos rodam e auditam `transaction.updated`).
Auditoria: `recurrence.paused {}`, `recurrence.resumed {}`, `recurrence.series_updated { "changed": [...] }` (nomes de coluna entre `amount, description, account_id, category_id, assigned_member_id, end_date`; nunca valores de texto).

**`transactions`** (acréscimos; ADR-0022)
- Colunas `recurrence_id uuid`, `occurrence_date date`, ambas fora dos grants. `transactions_recurrence_shape_check check ((recurrence_id is null) = (occurrence_date is null))`; `transactions_recurrence_fk foreign key (family_id, recurrence_id) references recurrences (family_id, id) on delete restrict`; `transactions_recurrence_occurrence_key unique (recurrence_id, occurrence_date)`.
- `transactions_pending_type_check check (status <> 'pending' or type <> 'transfer')`, `not valid` + `validate` tolerante (padrão do SEC-14).
- Índice `transactions_pending_date_idx (family_id, transaction_date) where status = 'pending' and deleted_at is null`.
- Grants **inalterados** (`status`, `due_date`, `recurrence_id` e `occurrence_date` fora do update; `due_date` fora do insert).
- Acréscimos ao trigger `before insert or update` (redefinido por inteiro, regra 6):

| Regra | Código |
|---|---|
| `old.status = 'canceled'`: qualquer update | `INVALID_STATUS_TRANSITION` |
| `status` muda e não é `pending → paid` nem `pending → canceled` | `INVALID_STATUS_TRANSITION` |
| `pending → paid`: conta ativa | `ACCOUNT_ARCHIVED` |
| `pending → paid`: `transaction_date <= today` e `>= opening_balance_date` (a checagem de data também roda quando o status muda) | `FUTURE_DATE_NOT_ALLOWED` / `DATE_BEFORE_OPENING_BALANCE` |
| `due_date`: insert `pending` → `= transaction_date`; insert `paid` → `null`; update de linha que continua `pending` → `= new.transaction_date`; `pending → paid` → `= old.due_date`; demais → `= old.due_date` | — |

- Auditoria (redefinição do trigger `after`): `pending → paid` grava **só** `transaction.paid` `{ "amount", "transaction_date", "due_date", "changed": [...], "old": {...} }` (`changed` ⊆ `amount, account_id`); `pending → canceled` grava `transaction.canceled` `{ "type", "amount", "transaction_date" }`. O resto não muda.

**RPCs de escrita (`public`, `language plpgsql`, `security definer`, `set search_path = ''`; `revoke ... from public, anon`; `grant execute` a `authenticated`)**. Começam com `auth.uid()` nulo → `NOT_AUTHENTICATED`; família = `private.current_family_id()` (nula → `FORBIDDEN` `42501`); a linha é buscada por `id` **e** família, com `for update`.

| RPC | Regras (em ordem) |
|---|---|
| `pay_pending_transaction(p_transaction_id uuid, p_paid_on date, p_amount numeric, p_account_id uuid) returns void` | inexistente, de outra família ou excluída → `NOT_FOUND`; `status <> 'pending'` → `INVALID_STATUS_TRANSITION`; o chamador não é owner/admin, autor nem responsável (`family_members.user_id = auth.uid()`, vínculo `active`) → `FORBIDDEN` (`42501`); parâmetro nulo ou `p_amount <= 0` → `INVALID_INPUT`; `p_paid_on > today` → `FUTURE_DATE_NOT_ALLOWED`; `update` de `status='paid'`, `transaction_date=p_paid_on`, `amount=p_amount`, `account_id=p_account_id` (o trigger valida conta ativa e data ≥ saldo inicial; a FK composta barra conta de outra família com `23503`; teto `23514`) |
| `cancel_pending_transaction(p_transaction_id uuid) returns void` | `NOT_FOUND`; `INVALID_STATUS_TRANSITION`; o chamador não é owner/admin nem autor → `FORBIDDEN`; `update status='canceled'` |
| `materialize_recurrences() returns integer` | horizonte = último dia do mês seguinte a `today`. Séries da família com `is_active`, **sem falha registrada há menos de 1 hora** (`last_failure_code is null or last_failure_at < now() - interval '1 hour'`; v1.1) e `next_occurrence_date <= least(horizonte, coalesce(end_date, horizonte))`, `order by next_occurrence_date, id for update skip locked`. Por série, num bloco `begin ... exception when others`: autor sem vínculo `active` → `RECURRENCE_AUTHOR_INACTIVE`; para cada data `d` da agenda a partir de `next_occurrence_date`, até `least(horizonte, end_date)` e até **60** por série: `insert` (`family_id`, `type`, `account_id`, `category_id`, `assigned_member_id`, `description`, `amount`, `transaction_date = d`, `status='pending'`, `recurrence_id`, `occurrence_date = d`, `created_by =` autor da série) `on conflict (recurrence_id, occurrence_date) do nothing`; no fim, `next_occurrence_date :=` primeira data não materializada e `last_failure_* := null`. Na exceção: `last_failure_code := sqlerrm` se casar com `^[A-Z_]{1,40}$`, senão `'INTERNAL_ERROR'`; `last_failure_at := now()`. Para em **500** inserções por chamada. Devolve quantas criou. Sem parâmetros: nunca lê família de fora |

**Funções de leitura (`public`, `stable`, `security invoker`, `search_path = ''`, `text`, filtro `family_id = private.current_family_id()` + RLS; `grant execute` a `authenticated`)**

| Função | Contrato |
|---|---|
| `pending_summary() returns table (payable text, receivable text, overdue_payable text, overdue_receivable text, overdue_count integer)` | D19 sobre `pending` não excluídos; vencido = `transaction_date < today` |
| `budget_progress(p_from_month date, p_to_month date) returns table (budget_id uuid, month date, spent text, committed text)` | D14. Meses civis de `date_trunc` a `date_trunc`, até 12 → senão `INVALID_INPUT`. Uma linha por orçamento visível (inclusive arquivado) **e** mês dentro da vigência `[start_month, coalesce(end_month, ∞)]`. `spent` = Σ `expense` `paid` não excluídos com sinal de estorno, na categoria ou nas filhas (nula = todas as despesas); `committed` = Σ `expense` `pending` não excluídos do mês no mesmo recorte |

**`budgets`** (ADR-0024)

| Coluna | Regra |
|---|---|
| `id`, `family_id` | FK families |
| `category_id uuid` | null = todas as despesas; FK `budgets_category_fk (family_id, category_id) → categories`; imutável |
| `amount_limit numeric(14,2) not null` | `> 0`, `<> 'NaN'`, `<= 99999999.99` |
| `start_month date not null` | `extract(day from start_month) = 1`, `>= '2000-01-01'`; imutável |
| `end_month date` | null ou (dia 1 e `>= start_month`) |
| `archived_at timestamptz` | |
| `created_by`, `created_at`, `updated_at` | como em accounts |

Índice único `budgets_family_category_active_key` em `(family_id, category_id) nulls not distinct where archived_at is null`.
Grants: `select`; `insert (family_id, category_id, amount_limit, start_month, end_month)`; `update (amount_limit, end_month, archived_at)`. Sem delete. Policies: select `is_family_member`; insert e update `has_family_role(family_id,'{owner,admin}')` (`using` e `with check`; insert com `created_by = auth.uid()`).
Trigger `before insert or update`: categoria de despesa → `CATEGORY_TYPE_MISMATCH`; insert ou desarquivamento com categoria arquivada → `CATEGORY_ARCHIVED`. Sem auditoria (ADR-0024 §5).

**pgTAP** (`supabase/tests/database/`): `300_etapa5_privileges` (RLS, grants exatos, `prosecdef`/`proconfig`, `anon`), `310_bills_pay_cancel`, `320_recurrence_schedule` (R5), `330_materialization`, `340_recurrence_series_edit`, `350_budgets`, `360_etapa5_regression` (R3, R12, R13, R14 + R1..R8 sem mudança), `370_audit_etapa5`. Cobertura: CA-E5-01..17. O `010_security_baseline` e os testes 100–210 continuam verdes.

### 3.2 Backend → frontend e design-system

**Códigos novos de `ErrorCode`**: `INVALID_STATUS_TRANSITION`, `RECURRENCE_LIMIT_REACHED` (de `P0001`); `BUDGET_ALREADY_EXISTS` (`23505` em `budgets_family_category_active_key`, mapeado no service, com `fieldErrors.categoryId`); `NOT_FOUND` passa a vir também de `P0001 'NOT_FOUND'`. Mensagens com o próximo passo ("Este compromisso já foi pago ou cancelado. Atualize a página para ver a situação atual." · "A família já tem 100 recorrências ativas. Pause ou encerre alguma antes de criar outra." · "Já existe um orçamento ativo para esta categoria. Edite o existente."). A mensagem de `CATEGORY_IN_USE` passa a citar "lançamentos, recorrências ou orçamentos".
**`family/permissions.ts`**: `can()` ganha `"budget.manage"` (owner, admin); entra `canPayBill(role, createdBy, assignedUserId: string | null, userId): boolean` (owner/admin, autor ou responsável). As recorrências usam `canManageTransaction`. Tudo só UX.
**`proxy.ts`/`safe-redirect.ts`**: `/compromissos`, `/recorrencias`, `/orcamentos`.

**Constantes e domínio (TS puro, testados)**

| Arquivo · export | Contrato |
|---|---|
| `bills/constants.ts` | `BILL_KINDS = ["pagar","receber"]` (↔ `expense`/`income`), `BILL_SITUATIONS = ["abertos","vencidos","pagos","cancelados"]`, rótulos pt-BR; `UPCOMING_DAYS = 30` |
| `bills/domain/status.ts` · `billStatusOf({ status, transactionDate, dueDate }, today): { status: "pending" \| "due_today" \| "overdue" \| "paid" \| "canceled"; days: number }` | D6: vencido = `pending` com `transactionDate < today` (derivado); `days` = dias até o vencimento (negativo se vencido) |
| `recurrences/constants.ts` | `FREQUENCIES = ["weekly","monthly","yearly"]`, `INTERVAL_MAX = 12`, `RECURRENCE_LIMIT = 100`; `ATTENTION_MESSAGES: Record<string, string>` para `ACCOUNT_ARCHIVED`, `CATEGORY_ARCHIVED`, `INVALID_INPUT`, `DATE_BEFORE_OPENING_BALANCE`, `RECURRENCE_AUTHOR_INACTIVE` e `INTERNAL_ERROR` (com o próximo passo) |
| `recurrences/domain/labels.ts` · `frequencyLabel(frequency, intervalCount, startDate): string` | "Toda semana (sexta-feira)", "A cada 2 semanas", "Todo mês, dia 31", "A cada 3 meses, dia 10", "Todo ano, 29/02" |
| `budgets/domain/progress.ts` · `budgetProgress(limit: Cents, spent: Cents, committed: Cents): { available: Cents; percent: number \| null; status: "ok" \| "attention" \| "exceeded" }` | D14: `available = limit − spent`; `percent = spent / limit × 100`; `ok` < 80; `attention` 80..100 (inclusive); `exceeded` > 100; `spent <= 0` → `ok` |

**Schemas Zod** (nenhum com `family_id`; o frontend usa `zodResolver` e `z.input`):

| Arquivo · export | Campos |
|---|---|
| `bills/schemas.ts` · `billFormSchema` | união discriminada por `repeat`. Comum: `kind` (`pagar\|receber`), `description` 1..120, `amount` (positivo), `dueDate` (`isoDate()` sem `notAfterToday`; ≥ 2000-01-01), `accountId`, `categoryId`, `assignedMemberId?`, `notes?` ≤ 1000, `idempotencyKey`. `repeat: true` acrescenta `frequency`, `intervalCount` (1..12, padrão 1) e `endDate?` (≥ `dueDate`, erro no campo) e **não** aceita `notes` |
| `updateBillSchema` | `transactionId`, `description`, `amount`, `dueDate`, `accountId`, `categoryId`, `assignedMemberId?`, `notes?` |
| `payBillSchema` | `transactionId`, `paidOn` (`isoDate({ notAfterToday: true })`), `amount` (positivo), `accountId` |
| `billIdSchema` | `{ transactionId }` |
| `billFiltersSchema` | URL, **tolerante**: `tipo` (`pagar\|receber`), `situacao` (`abertos` (padrão) `\|vencidos\|pagos\|cancelados`), `de`, `ate` (vencimento), `serie` (uuid), `pagina`, `por_pagina` (20/50/100) |
| `recurrences/schemas.ts` · `updateRecurrenceSchema` | `recurrenceId`, `description`, `amount`, `accountId`, `categoryId`, `assignedMemberId?` (uuid ou null), `endDate?` (ISODate ou null) |
| `recurrenceIdSchema`, `endRecurrenceSchema` | `{ recurrenceId }` / `{ recurrenceId, endDate }` (≥ início da série, conferido no banco) |
| `recurrenceFiltersSchema` | `situacao` (`ativas` (padrão) `\|pausadas\|encerradas`) |
| `budgets/schemas.ts` · `budgetInputSchema` | `categoryId` (uuid ou `null` = todas), `amountLimit` (positivo), `startMonth`, `endMonth?` (`"YYYY-MM"` → ISODate do dia 1; `endMonth ≥ startMonth`) |
| `updateBudgetSchema`, `budgetIdSchema`, `budgetMonthSchema` | `budgetId`, `amountLimit`, `endMonth?` / `{ budgetId }` / URL tolerante `mes` (`YYYY-MM`, padrão o mês atual) e `arquivados` (`sim`) |

**Server Actions** (`runAction`, `auth: "required"`; depois do sucesso, `revalidatePath` de `/compromissos`, `/recorrencias`, `/orcamentos`, `/transacoes`, `/contas`, `/inicio`, conforme o caso):

| Arquivo · função | Retorno | Comportamento |
|---|---|---|
| `bills/actions.ts` · `createBill(input)` | `ActionResult<{ id: string; kind: "transaction" \| "recurrence" }>` | `repeat: false` → insert em `transactions` `status='pending'`, idempotente pela chave. `repeat: true` → insert em `recurrences` (`start_date = dueDate`), idempotente pela chave, depois `materialize_recurrences()` |
| `updateBill(input)` | `ActionResult<null>` | só `pending`; 0 linhas: visível → `FORBIDDEN`, senão `NOT_FOUND`; não `pending` → `INVALID_STATUS_TRANSITION` |
| `payBill(input)` | `ActionResult<null>` | RPC `pay_pending_transaction` com `toDbNumeric(amount)` |
| `cancelBill({ transactionId })` | `ActionResult<null>` | RPC `cancel_pending_transaction` |
| `recurrences/actions.ts` · `updateRecurrence`, `pauseRecurrence`, `resumeRecurrence`, `endRecurrence` | `ActionResult<null>` | update direto (RLS); 0 linhas → `FORBIDDEN`/`NOT_FOUND`; depois `materialize_recurrences()` (exceto em pausar) |
| `budgets/actions.ts` · `createBudget` / `updateBudget`, `archiveBudget`, `unarchiveBudget` | `{ id }` / `null` | `FORBIDDEN` (member), `BUDGET_ALREADY_EXISTS`, `CATEGORY_TYPE_MISMATCH`, `CATEGORY_ARCHIVED` |

**Serviço de materialização**: `recurrences/service.ts` · `ensureRecurrencesMaterialized(): Promise<void>`. `server-only`, deduplicado por requisição (`React.cache`). Chama `materialize_recurrences()`; em erro, registra no logger (`module: "recurrences"`, código, `requestId`, sem dado financeiro) e **não lança**. Chamado no início de `getDashboard`, `listBills`, `getBillsSummary`, `listUpcomingBills`, `listRecurrences`, `getRecurrence` e `getBudgetsOverview`.

**Queries** (`server-only`; `Cents`, `ISODate`):

| Função | Retorno |
|---|---|
| `bills/queries.ts` · `listBills(filters)` | `{ items: BillListItem[]; total; page; pageSize; pageCount }`. `abertos` = `pending` (inclui vencidos), vencimento crescente; `vencidos` = `pending` com data < hoje; `pagos` = `paid` com `due_date` não nulo, pagamento decrescente; `cancelados`. Só `income`/`expense`, não excluídos |
| `BillListItem` | `{ id; kind: "pagar" \| "receber"; description; amount: Cents; dueDate: ISODate; paidOn: ISODate \| null; status: "pending" \| "due_today" \| "overdue" \| "paid" \| "canceled"; days: number; account: { id; name }; category: { id; name; color; icon }; assignedMember: { id; displayName } \| null; recurrence: { id; label: string } \| null; canPay; canEdit; canCancel }` |
| `getBill(id)` | `BillDetail \| null` = item + `notes`, `createdBy`, `createdAt`, `history: HistoryEntry[] \| null`. Inexistente, de outra família, excluído, transferência ou `paid` sem `due_date` → `null` |
| `getBillsSummary()` | `{ payable; receivable; overduePayable; overdueReceivable: Cents; overdueCount: number }` (via `pending_summary`) |
| `listUpcomingBills({ limit = 5 })` | D19: `pending` com vencimento ≤ hoje + 30 dias (inclui vencidos), vencimento crescente |
| `recurrences/queries.ts` · `listRecurrences(filters)` | `RecurrenceView[]` = `{ id; kind; description; amount; frequency; intervalCount; startDate; endDate: ISODate \| null; label; nextOccurrence: ISODate \| null; state: "active" \| "paused" \| "ended" \| "attention"; attention: { code: string; message: string } \| null; account; category; assignedMember; canManage }`. `ended` = `end_date < hoje`; `attention` = ativa com `last_failure_code`; `nextOccurrence` = menor `pending` ≥ hoje da série, senão `next_occurrence_date` (se ativa e ≤ `end_date`), senão `null` |
| `getRecurrence(id)` | `RecurrenceView \| null` |
| `budgets/queries.ts` · `getBudgetsOverview({ month, archived })` | `{ month: ISODate; label; budgets: BudgetView[] }`; `BudgetView` = `{ id; category: { id; name; color; icon; archived: boolean } \| null; amountLimit; spent; committed; available: Cents; percent: number \| null; status; history: { month: ISODate; label; spent: Cents; percent: number \| null; status }[] (até 3 meses anteriores dentro da vigência); startMonth; endMonth: ISODate \| null; archivedAt: string \| null; canManage: boolean }`. Uma chamada a `budget_progress(mês − 3, mês)` |
| `getBudget(id)` | para o formulário de edição |

**Mudanças em módulos existentes**
- `transactions`: `listTransactions` filtra `status = 'paid'` (ADR-0022 §6). `TransactionListItem` ganha `recurrenceId: string | null`. `TransactionDetail` ganha `dueDate: ISODate | null` e `recurrence: { id; label } | null`. `HistoryEntry.action` ganha `"transaction.paid"` e `"transaction.canceled"`. `getPendingCommitted` passa a usar `pending_summary` e devolve só o `payable` (despesa pendente, "a pagar"; D14, v1.1); a assinatura não muda.
- `reports`: `Dashboard` ganha `upcomingBills: BillListItem[]` (`listUpcomingBills`), e `getDashboard` chama `ensureRecurrencesMaterialized()` primeiro. `INDICATOR_DEFINITIONS.upcomingBills` → D19.

### 3.3 Design-system → frontend

**A-ds:** `shadcn add switch progress` (§1). Ajustes: `Switch` com alvo ≥ 40px (área de toque) e rótulo associado; `Progress` sem animação com `prefers-reduced-motion`.

| Arquivo · export | Contrato |
|---|---|
| `shared/progress-meter.tsx` · `ProgressMeter` (sem `"use client"`) | `{ value: number \| null; tone: "default" \| "warning" \| "danger"; label: string; valueText: string }`. Barra sobre `ui/progress`, cheia em 100% no máximo (`aria-valuenow` limitado a 0..100), com `aria-valuetext` = `valueText` real ("112% do limite"). Tons: `bg-primary`, `bg-warning`, `bg-danger` (tokens de estado, não `chart-*`). O estado vem sempre também em texto (quem usa mostra `Badge` com ícone) |
| `shared/sub-nav.tsx` · `SubNav` (`"use client"`, `usePathname`) | `{ items: { href: string; label: string }[]; "aria-label": string }`. Links em trilho (`bg-muted`, como o `SegmentedControl`), `aria-current="page"` no ativo (casa subrotas), rolagem horizontal **dentro** do trilho no celular, alvo ≥ 40px |

Tokens: nenhum novo. `docs/design-system.md` ganha os dois componentes, `Switch`/`Progress` e o padrão de status de compromisso: `Badge` + ícone + texto — Pendente `secondary`, Vence hoje `warning`, Vencido `danger`, Pago/Recebido `success`, Cancelado `outline`.

### 3.4 Rotas e telas (frontend)

Em `src/app/(app)/`, Server Components, `loading.tsx` com `Skeleton`, `error.tsx` do grupo, filtros na URL, formulários pela ADR-0017 e pelo padrão `Field` + `Controller`. `SubNav` "Lançamentos (`/transacoes`) · Compromissos (`/compromissos`) · Recorrências (`/recorrencias`)" no topo das três seções.

| Rota | Conteúdo e estados |
|---|---|
| `/compromissos` | `PageHeader` "Contas a pagar e receber" + "Novo compromisso". Resumo (`getBillsSummary`): "A pagar em aberto", "A receber em aberto", "Vencidos (n)". `FiltersPanel`: tipo, situação, vencimento de/até; `?serie=` mostra o nome da série com "Limpar". `ResponsiveList`: vencimento (+ "vence em 5 dias", "vence hoje", "venceu há 3 dias"), descrição + `CategoryIcon` + conta, responsável, `Money`, status (`Badge` + ícone + texto), selo "Recorrente". Ações por linha conforme `can*`: "Marcar como pago"/"Marcar como recebido" (`Dialog`: Data do pagamento `DatePicker` padrão hoje e `max` hoje; Valor `MoneyInput` padrão previsto; Conta `Select` padrão a prevista; texto "O lançamento passa a contar no saldo e nos totais na data do pagamento."; "Confirmar pagamento" com `loading`), Editar, Cancelar (`AlertDialog`: "O compromisso fica no histórico e deixa de aparecer como previsto."). Pago leva a `/transacoes/[id]`. Vazio: "Nenhuma conta a pagar ou receber" → "Novo compromisso"; filtro sem resultado → "Limpar filtros" |
| `/compromissos/novo` | `SegmentedControl` **A pagar \| A receber**; Descrição, Categoria (do tipo), Valor previsto, Vencimento (`DatePicker`, sem `max`), "Conta ou cartão", Responsável, Observações; `Switch` "Repetir" revela Frequência (`Select` Toda semana/Todo mês/Todo ano), "A cada" (1..12 + unidade), "Termina em" (opcional, "Sem data para terminar") e a dica "Nos meses sem o dia 31, o vencimento cai no último dia do mês." (dia ≥ 29, mensal). Botão "Salvar conta a pagar" / "Salvar conta a receber" / "Salvar recorrência". Sucesso → toast → `/compromissos` |
| `/compromissos/[id]` | detalhe de `pending`/`canceled` (pago → `redirect('/transacoes/[id]')`): valor previsto, vencimento, status, categoria, conta, responsável, observações, quem criou, série (link) e histórico (owner/admin). Ações como na lista. Inexistente ou de outra família → `notFound()` |
| `/compromissos/[id]/editar` | formulário sem "Repetir" e com tipo fixo. Ocorrência de série: `Alert` "Esta alteração vale só para esta ocorrência. Para mudar as próximas, edite a série." com link. Sem permissão ou não `pending` → `notFound()` |
| `/recorrencias` | `Tabs` Ativas \| Pausadas \| Encerradas. Cada série: descrição + `CategoryIcon`, `Money`, `label`, "Próxima: dd/mm/aaaa", "Termina em …"/"Sem término", responsável. `attention` → `Alert` warning com a mensagem e a ação "Editar série". Ações (`canManage`): Ver ocorrências (`/compromissos?serie=<id>&situacao=abertos`), Editar série, Pausar/Reativar, Encerrar (`AlertDialog` com `DatePicker` "Última ocorrência em", padrão hoje: "As próximas ocorrências que você não alterou deixam de existir. As pagas e as alteradas ficam."). Vazio: "Nenhuma recorrência" → "Novo compromisso" |
| `/recorrencias/[id]/editar` | descrição, valor, categoria, conta, responsável, término; `Alert` info: "Muda as próximas ocorrências que ainda não foram alteradas. Ocorrências passadas, pagas ou editadas ficam como estão." Frequência e início só para leitura, com a orientação "Para mudar a frequência, encerre esta série e crie outra." Sem permissão → `notFound()` |
| `/orcamentos` | `PageHeader` "Orçamentos" + "Novo orçamento" (owner/admin). Navegação de mês (‹ outubro de 2026 ›, `?mes=`), `Tabs` Ativos \| Arquivados. Cartão por orçamento: `CategoryIcon` + nome ou "Todas as despesas"; selo "Categoria arquivada"; "R$ 400,00 de R$ 500,00"; `ProgressMeter`; "Disponível R$ 100,00" ou "Acima do limite em R$ 60,00"; "Previsto em compromissos R$ 80,00"; estado em `Badge` + ícone + texto ("Dentro do limite", "Atenção", "Limite estourado"); "Meses anteriores": tabela compacta Mês \| Realizado \| % do limite. Ações: Editar, Arquivar/Reativar. Vazio: "Nenhum orçamento para {mês}" → "Criar orçamento" (member: orientação) |
| `/orcamentos/novo`, `/orcamentos/[id]/editar` | Categoria (`Select`: "Todas as despesas" + categorias de despesa ativas; travada na edição), "Limite mensal" (`MoneyInput`), "A partir de" e "Até (opcional)" (`Select` de meses, 12 para trás e 24 para a frente; início travado na edição). Member → `notFound()` |
| `/transacoes`, `/transacoes/[id]` | `SubNav`; selo "Recorrente" quando `recurrenceId`; no detalhe, "Vencimento: dd/mm/aaaa" quando `dueDate` existir e link para a série; `status` diferente de `paid` → `redirect('/compromissos/[id]')` |
| `/inicio` | "Próximos vencimentos" ligado: até 5 de `upcomingBills` (descrição, `CategoryIcon`, vencimento, `Money`, status) com link ao item, "Ver todos" → `/compromissos`. Vazio: "Nenhum vencimento nos próximos 30 dias" → "Novo compromisso" |

`src/config/navigation.ts`: Transações fica ativo também em `/compromissos` e `/recorrencias` (`activePrefixes`); novo item Orçamentos (`/orcamentos`, `PiggyBankIcon`, `mobile: "more"`), depois de Contas (spec §9).

### 3.5 Dependências novas

Nenhuma. `switch` e `progress` são arquivos do shadcn sobre `@base-ui/react`, que já está instalado. Se o `shadcn add` exigir pacote, abrir pedido §8. Atualização de dependências atrasadas só em A-ds.

## 4. Fluxos (resumo)

- **Criar compromisso:** formulário → `billFormSchema` → `createBill` → insert `pending` (o trigger fixa `due_date`) ou série + `materialize_recurrences()`.
- **Pagar:** `Dialog` → `payBillSchema` → `payBill` → RPC (lock, autorização, transição) → trigger (conta, datas, `due_date`) → auditoria `transaction.paid` → a **mesma linha** passa a contar em `account_balances`/`period_summary`.
- **Ler:** página → query → `ensureRecurrencesMaterialized()` (idempotente, falha silenciosa e registrada) → funções `text` → `Cents` → RSC.

## 5. Entregas e aceite por agente

### 5.1 database
Migrations da §3.1, sem SQL destrutivo sobre dados existentes: colunas novas anuláveis e CHECK `not valid` + `validate` tolerante. pgTAP 300–370 e `pnpm db:types`.
Aceite: `pnpm db:reset && pnpm db:test` 100% verde do zero (inclusive 010 e 100–210); `pnpm db:lint` sem erro; CA-E5-01..17; toda função `security definer` nova com `search_path=''`; `budget_progress` e `pending_summary` com `prosecdef = false`.

### 5.2 backend
A-be: interfaces e domínio com testes. B: repositories, services, actions, queries, `ensureRecurrencesMaterialized`, mudanças em `transactions` e `reports`, códigos de erro, `proxy`/`safe-redirect`, integração.
Aceite: CA-E5-30..39; `pnpm lint`, `typecheck`, `test`, `test:integration` verdes; `grep -rnE "parseFloat|toFixed\("` em `src/modules/{bills,recurrences,budgets}` vazio; `grep -rn "status" src/modules/*/repository.ts` sem update de status fora das RPCs; `server-only` nos arquivos de servidor.

### 5.3 design-system
A-ds: `shadcn add` e conferências; `ProgressMeter`, `SubNav`, testes RTL e `docs/design-system.md`.
Aceite: CA-E5-70..72; diff de `package.json` vazio (salvo atualização de dependências atrasadas); nenhum hex em `.tsx`.

### 5.4 frontend
Telas da §3.4, componentes de módulo, navegação, E2E (`compromissos`, `recorrencias`, `orcamentos`, atualizações de `inicio` e `transacoes`; desktop e mobile).
Aceite: CA-E5-50..62; RTL do `BillForm` (troca A pagar/A receber, "Repetir" revela e valida os campos da série, `fieldErrors`, dados mantidos em falha), do `PayBillDialog` (padrões, `max` hoje, `loading`) e do `BudgetForm`; nenhum cálculo de percentual, disponível ou vencido em componente.

## 6. Integração (Fase C)

Ordem: `pnpm install` → `pnpm db:reset` → `pnpm db:types` (sem diff) → `pnpm check` → `pnpm build` → `pnpm db:test` → `pnpm test:integration` → `pnpm test:e2e` → `pnpm outdated`/`audit` → `node ~/.claude/factory/security/gate.mjs "<projeto>"` → revisão (reviewer + security; mudança `structural`: tabelas novas, RLS, três RPCs `security definer`, redefinição do trigger de lançamentos).
Etapa 5 concluída = CA-E5-* verdes + regra de conclusão. O architect atualiza o `data-model.md` (§2, §5.3–5.5, catálogo de auditoria com `transaction.paid` e `recurrence.*`) e o roadmap.

## 7. Bloqueadores e riscos

| Item | Impacto | Mitigação |
|---|---|---|
| Docker Desktop rodando | sem `db:test`, integração e E2E | bloqueante |
| Redefinição do trigger de lançamentos perder regra da Etapa 3 | regressão de integridade | regra 6; pgTAP 120–170 obrigatório na A-db; o reviewer compara com `20261024100400` |
| Materialização em render de Server Component (escrita num GET) | latência no primeiro acesso do mês; prefetch | idempotente, tetos de 60/500, `skip locked`; falha não derruba a página; medir na Etapa 9 |
| Propagação de série gera um `transaction.updated` por ocorrência | auditoria mais volumosa | aceito (horizonte de ~2 meses = poucas linhas) |
| Testes dependentes de "hoje" (vencido, horizonte) | intermitência perto da virada do mês | dados relativos a `private.today()`/`today()`; casos de virada de mês (dia 1, dia 31) com datas fixas só em `recurrence_occurrence` (função pura) |
| Concorrência de edição de série e pagamento da mesma ocorrência | ocorrência paga no meio da propagação | a propagação só toca `pending` e o pagamento trava a linha; a última gravação vence; os dois ficam auditados |
| Spec §7.6 "lembretes" | dependem das notificações | Etapa 7 (`bill_due_soon`, `bill_overdue`); a Etapa 5 mostra "vence hoje"/"vencido" na UI |
| Spec truncada na §15 | — | segue aberto |

## 8. Pedido de mudança

Formato no handoff: `CR-<agente>-<n>: <arquivo/interface> — <mudança> — <motivo> — <impacto em quem>`.
O orchestrator decide. Se uma interface da §3 muda, este documento sobe de versão (1.1) antes da implementação.
