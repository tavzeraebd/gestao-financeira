# Contrato de execução — Etapa 6 (metas, divisão de contas e planejamento de cenários)

Versão 1.0 (2026-10-24) · Dono: orchestrator/architect · Alteração só por pedido ao orchestrator (§8).
Referências: spec §7.9, §7.10, §7.12, §8, §9, §11 Etapa 6, §12 F, §13; mockups **4** (Metas), **6** (Divisão de contas), **7** (Planejamento) e **10** (Metas no celular)
de `docs/reference/mockups.png`; `financial-definitions.md` v1.2 (D9, D10, D13, D15; R15–R19); `permissions.md` §2 (linhas Metas, Divisão,
Planejamento, aprovadas); `acceptance-criteria.md` (CA-E6-*); `threat-model.md` §3.11 (AB-100..109); ADRs 0003, 0004, 0015, 0018, 0020, 0022,
0023, **0025**, **0026**, **0027**; contratos `etapa-3.md`, `etapa-4.md` e `etapa-5.md` v1.0 (regras e interfaces herdadas).
**Onde este contrato e o `data-model.md` §5.6–5.8 divergirem, vale este contrato.**

**Dependência:** as Etapas 4 e 5 estão **contratadas, não implementadas**. Tudo o que este documento cita delas (`reports/**`, `charts/**`,
`ProgressMeter`, `SubNav`, `budget_progress`, `ensureRecurrencesMaterialized`, `pay_pending_transaction`, `canPayBill`, `BillListItem`,
rotas `/compromissos`) é interface **a ser entregue** por aqueles contratos, e esta etapa só começa com elas integradas.

## 0. Regras do contrato

1. Valem as regras do `etapa-3.md` §0, do `etapa-4.md` §0 e do `etapa-5.md` §0 (um arquivo, um dono; dinheiro sem ponto flutuante; "hoje" em
   São Paulo; uma fórmula, um lugar; sem cache de dados de família; nenhum `family_id` em action ou schema; status de lançamento só pelas RPCs da Etapa 5).
2. **Nenhuma regra desta etapa altera saldo, consolidado, receitas, despesas, orçamento ou fluxo de caixa** (ADR-0025, ADR-0026). As funções
   `account_balances`, `period_summary`, `monthly_cash_flow`, `category_totals`, `pending_summary` e `budget_progress` não são tocadas e não
   leem as tabelas novas. Regressão R1–R14 continua exata.
3. Parcelas de divisão só são gravadas por `set_transaction_splits` e pelo trigger de reescala. Nenhum código do app escreve em `expense_splits`.
4. Planejamento **não persiste nada** e não chama action nem RPC de escrita (ADR-0027). Entradas do simulador não vão para URL, storage nem log.
5. **Pré-condição de dados:** o trigger `private.transactions_before_write` e o `after` de auditoria da Etapa 5 **não** são redefinidos. A reescala
   é um trigger **separado** (§3.1). O pgTAP 120–170 (E3), 200–210 (E4) e 300–370 (E5) continua verde.
6. Fora do escopo: notificações (Etapa 7, inclusive "meta perto de ser alcançada"); relatórios (Etapa 7); aporte ligado a transferência
   (removido, ADR-0025); upload de imagem de meta; rendimento presumido em metas; cenário salvo; sugestões "inteligentes" do mockup
   (fase 3 do roadmap visual, sem requisito na spec); "Dica do Núcleo"; juros sugeridos. Não criar rota, tabela, coluna ou componente para eles.

## 1. Fases e sequência

Pré-condição: Etapa 5 integrada (CA-E5-* verdes, gate `PASSA`). A-db da Etapa 6 pode começar quando as migrations da Etapa 5 estiverem prontas
(só os timestamps precisam vir depois); as demais fases esperam a Etapa 5 concluída, porque `/inicio`, `reports`, `navigation.ts` e as telas de
`/transacoes` e `/compromissos` mudam de novo.

| Fase | Quem | O quê | Pode começar quando |
|---|---|---|---|
| A-db | database | migrations, triggers, RPC, funções e pgTAP da §3.1; `pnpm db:types` assim que as tabelas existirem | pré-condição de A-db |
| A-be | backend | **interfaces publicadas primeiro**: `modules/{goals,splits,planning}/{constants,types,schemas}.ts`, `domain/**` completo e testado (TS puro), `family/domain/member-name.ts`, extensão de `ErrorCode`, `family/permissions.ts` | pré-condição |
| A-ds | design-system | `pnpm dlx shadcn@latest add checkbox` **sem** `--overwrite`; conferir que `package.json` **não mudou** (Base UI já instalado; se mudar, parar e abrir pedido §8); `pnpm outdated`/`audit` e atualização do que estiver atrás (único momento em que `package.json` pode mudar). Depois, `shared/value-source-badge.tsx` (independente) e `shared/goal-icon.tsx` (depende de `goals/constants.ts` de A-be) | pré-condição (`goal-icon` após A-be publicar `constants`) |
| B | backend + frontend em paralelo (DS termina testes e doc; database termina pgTAP) | backend: repositories, services, actions, queries, mudanças em `reports`, integração. Frontend: telas da §3.4 | A-ds e A-be concluídas (backend: também `database.ts`) |
| C | orchestrator (+ QA, reviewer, security) | integração (§6); architect atualiza `data-model.md` §5.6–5.8 e o catálogo de auditoria; roadmap | todos de B entregues |

Paralelismo: A-db, A-be e A-ds rodam juntas. Em B, backend e frontend rodam juntos contra as interfaces congeladas da §3.2.

## 2. Mapa de donos (acréscimos; os mapas anteriores continuam valendo)

| Caminho | Dono |
|---|---|
| `supabase/migrations/2026*_etapa6_*.sql`, `supabase/tests/database/4[0-9]0_*.test.sql`, `src/types/database.ts` | database |
| `src/modules/{goals,splits,planning}/**` **exceto** `components/` | backend |
| `src/modules/reports/**` exceto `components/` (metas no dashboard), `src/modules/family/{permissions.ts,domain/**}` | backend |
| `src/server/{action,errors,error-messages}.ts`, `src/proxy.ts`, `src/lib/safe-redirect.ts` | backend |
| `tests/integration/{goals,splits,planning,etapa6-regression}.test.ts` | backend |
| `src/components/ui/checkbox.tsx` (gerado), `src/components/shared/{goal-icon,value-source-badge}.tsx` e testes, `docs/design-system.md`, `package.json`/`pnpm-lock.yaml` (só A-ds) | design-system |
| `src/app/(app)/{metas,planejamento,divisao}/**`, `src/app/(app)/{transacoes,compromissos,recorrencias}/**` (item "Divisão" do `SubNav` e bloco "Divisão" nos detalhes), `src/app/(app)/inicio/**`, `src/config/navigation.ts`, `src/components/layout/**` | frontend |
| `src/modules/{goals,splits,planning,reports}/components/**` | frontend |
| `e2e/{metas,divisao,planejamento,inicio}.spec.ts`, `e2e/helpers/**` | frontend |
| `docs/**` (exceto `docs/design-system.md`), `.claude/**` | orchestrator/architect |

## 3. Interfaces

### 3.1 Database → backend

Convenções do `data-model.md` §1 e do `etapa-3.md` §3.1. Os nomes de constraint fazem parte do contrato. Ordem sugerida das migrations:
`etapa6_helpers` → `etapa6_goals` → `etapa6_splits` → `etapa6_settlements` → `etapa6_read_functions`.

**Helpers (`private`, `set search_path = ''`, `revoke ... from public, anon`)**
- `private.current_member_id() returns uuid` (`sql stable security definer`; `grant execute` a `authenticated`, usado em policies): `id` do vínculo `active` do chamador.
- `private.allocate_cents(p_total numeric, p_weights numeric[]) returns numeric[]` (`plpgsql immutable`, invoker, sem acesso a tabela; `grant execute` a `authenticated`): D13 em centavos; `p_total ≥ 0` com 2 casas, pesos ≥ 0 com soma > 0, senão `INVALID_INPUT`; empate pelo **índice** do array; Σ resultado = `p_total` exato.
- `private.rescale_splits(p_transaction_id uuid, p_new_amount numeric) returns void` (`security definer`, sem grant a `authenticated`): reescala as parcelas existentes na proporção atual (pesos = parcelas atuais, ordem `family_members.joined_at, id`).
- `grant execute on function private.recurrence_occurrence(...)` a `authenticated` (função pura da Etapa 5, exigida pela função invoker `projected_cash_flow`).

**`goals`** (ADR-0025)

| Coluna | Regra |
|---|---|
| `id`, `family_id` | `goals_family_id_id_key unique (family_id, id)`; FK families restrict |
| `name` | 1..80 após `btrim` |
| `description` | null ou ≤ 500 |
| `target_amount numeric(14,2)` | `> 0`, `<> 'NaN'`, `<= 99999999.99` |
| `target_date date` | null ou `>= '2000-01-01'` |
| `icon text not null default 'target'` | `goals_icon_check`: `in ('target','plane','house','car','shield','graduation-cap','heart-pulse','gift','baby','briefcase','laptop','piggy-bank')` |
| `status text not null default 'active'` | `in ('active','paused','completed','canceled')` |
| `completed_at timestamptz` | do banco; `goals_completed_shape_check ((status = 'completed') = (completed_at is not null))` |
| `idempotency_key uuid` | `goals_family_idempotency_key unique (family_id, idempotency_key)` |
| `created_by uuid not null default auth.uid()` | FK profiles restrict |
| `created_at`, `updated_at` | |

Grants: `select`; `insert (family_id, name, description, target_amount, target_date, icon, idempotency_key)`; `update (name, description, target_amount, target_date, icon, status)`. Sem delete.
Policies: `goals_select` `is_family_member(family_id)`; `goals_insert` `with check (has_family_role(family_id,'{owner,admin}') and created_by = auth.uid())`; `goals_update` `using`/`with check` `has_family_role(family_id,'{owner,admin}')`.
Trigger `before update` (invoker): `old.status in ('completed','canceled')` → qualquer update `INVALID_STATUS_TRANSITION`; transições válidas `active→paused|completed|canceled`, `paused→active|completed|canceled`, senão `INVALID_STATUS_TRANSITION`; `→ completed` fixa `completed_at = now()`.
Auditoria (`after`, `security definer`): `goal.status_changed { "from", "to" }`; `goal.updated { "changed", "old", "new" }` só quando muda `target_amount` ou `target_date` (nome, descrição e ícone não são auditados).

**`goal_contributions`**

| Coluna | Regra |
|---|---|
| `id`, `family_id` | FK families |
| `goal_id` | not null; `goal_contributions_goal_fk (family_id, goal_id) → goals (family_id, id)` restrict |
| `member_id` | not null; `goal_contributions_member_fk (family_id, member_id) → family_members (family_id, id)` restrict |
| `kind` | `in ('deposit','withdrawal')` |
| `amount numeric(14,2)` | `> 0`, `<> 'NaN'`, `<= 99999999.99` |
| `contribution_date date not null` | `>= '2000-01-01'`; ≤ hoje (trigger) |
| `notes` | null ou ≤ 500 |
| `idempotency_key uuid` | `goal_contributions_family_idempotency_key unique (family_id, idempotency_key)` |
| `created_by uuid not null default auth.uid()` | FK profiles |
| `deleted_at`, `deleted_by` | `((deleted_at is null) = (deleted_by is null))` |
| `created_at`, `updated_at` | |

**Não existe `transaction_id`** (ADR-0025). Índice `goal_contributions_goal_date_idx (goal_id, contribution_date desc) where deleted_at is null`.
Grants: `select`; `insert (family_id, goal_id, member_id, kind, amount, contribution_date, notes, idempotency_key)`; `update (deleted_at)`. Sem delete.
Policies: select `is_family_member`; insert `with check (is_family_member(family_id) and created_by = auth.uid())`; update `using ((has_family_role(family_id,'{owner,admin}') or created_by = auth.uid()) and deleted_at is null)` e `with check` igual sem a condição de `deleted_at`.
Trigger `before insert or update` (invoker; `pg_advisory_xact_lock(hashtextextended('goal:' || goal_id::text, 0))` antes de somar; `P0001` com o código):

| Regra | Código |
|---|---|
| insert: meta `active` | `GOAL_NOT_ACTIVE` |
| insert: `member_id` com vínculo `active` | `INVALID_INPUT` |
| insert: chamador não é owner/admin e `member_id <> private.current_member_id()` | `FORBIDDEN` (`42501`) |
| insert: `contribution_date > today` | `FUTURE_DATE_NOT_ALLOWED` |
| insert de `withdrawal`: acumulado − `amount` < 0 | `GOAL_NEGATIVE_PROGRESS` |
| update: só `deleted_at` de nulo para não nulo; o trigger fixa `deleted_at = now()` e `deleted_by = auth.uid()` | — |
| exclusão de `deposit`: acumulado − `amount` < 0 | `GOAL_NEGATIVE_PROGRESS` |

Auditoria: `goal_contribution.deleted { "goal_id", "kind", "amount" }`. Criação não é auditada (como a criação de lançamentos).

**`expense_splits`** (ADR-0026)

| Coluna | Regra |
|---|---|
| `id`, `family_id` | FK families |
| `transaction_id` | `expense_splits_transaction_fk (family_id, transaction_id) → transactions (family_id, id)` restrict |
| `member_id` | `expense_splits_member_fk (family_id, member_id) → family_members (family_id, id)` restrict |
| `amount numeric(14,2)` | `> 0`, `<> 'NaN'` |
| `created_by`, `created_at`, `updated_at` | |

`expense_splits_transaction_member_key unique (transaction_id, member_id)`. Grants: **só `select`** (nenhum insert, update ou delete para `authenticated`). Policy select `is_family_member`.
Constraint trigger `expense_splits_sum_check` (`after insert or update or delete`, `deferrable initially deferred`, `for each row`): se a transação tem parcelas, Σ = `transactions.amount` → senão `SPLIT_SUM_MISMATCH`.
Trigger `transactions_rescale_splits` em `transactions` (`after update of amount`, `when (old.amount is distinct from new.amount)`, `security definer`): `private.rescale_splits(new.id, new.amount)` se houver parcelas. Cobre `pay_pending_transaction` com valor real e a edição de valor.

**RPC `set_transaction_splits(p_transaction_id uuid, p_mode text, p_shares jsonb) returns void`** (`plpgsql security definer`, `search_path = ''`, `revoke ... from public, anon`, `grant execute` a `authenticated`). Regras, em ordem:
1. `auth.uid()` nulo → `NOT_AUTHENTICATED`; família = `private.current_family_id()` nula → `FORBIDDEN` (`42501`).
2. Lançamento por `id` **e** família, `for update`; inexistente, de outra família ou excluído → `NOT_FOUND`.
3. `type <> 'expense'`, `status = 'canceled'` ou `reversal_of_id is not null` → `SPLIT_NOT_ALLOWED`.
4. Chamador não é owner/admin nem `created_by` → `FORBIDDEN` (`42501`).
5. `p_mode not in ('equal','amounts','none')` → `INVALID_INPUT`. `none` → apaga as parcelas e audita.
6. `p_shares`: array de 2 a 20 objetos, `member_id` uuid distintos; em `amounts`, `amount` texto `^\d{1,8}(\.\d{1,2})?$` e > 0. Fora disso → `INVALID_INPUT`.
7. Cada `member_id` é vínculo **desta** família (senão `INVALID_INPUT`, sem distinguir "não existe" de "outra família") e está `active` **ou** já está na divisão atual deste lançamento (senão `MEMBER_INACTIVE`).
8. `equal` → valores por `private.allocate_cents(amount, pesos 1)`, integrantes em ordem `joined_at, id`. `amounts` → Σ ≠ `amount` → `SPLIT_SUM_MISMATCH`.
9. Substitui o conjunto (delete + insert) e grava `transaction.splits_changed { "mode", "parts" }`.

**`settlements`**

| Coluna | Regra |
|---|---|
| `id`, `family_id` | FK families |
| `from_member_id`, `to_member_id` | FKs compostas → `family_members`; `settlements_members_check (from_member_id <> to_member_id)` |
| `amount numeric(14,2)` | `> 0`, `<> 'NaN'`, `<= 99999999.99` |
| `settlement_date date not null` | `>= '2000-01-01'`; ≤ hoje (trigger `FUTURE_DATE_NOT_ALLOWED`) |
| `notes` | null ou ≤ 500 |
| `idempotency_key uuid` | `settlements_family_idempotency_key unique (family_id, idempotency_key)` |
| `created_by`, `deleted_at`, `deleted_by`, `created_at`, `updated_at` | como em `goal_contributions` |

Grants: `select`; `insert (family_id, from_member_id, to_member_id, amount, settlement_date, notes, idempotency_key)`; `update (deleted_at)`.
Policies: select `is_family_member`; insert `with check (is_family_member(family_id) and created_by = auth.uid() and (has_family_role(family_id,'{owner,admin}') or from_member_id = private.current_member_id() or to_member_id = private.current_member_id()))`; update `using ((has_family_role(family_id,'{owner,admin}') or created_by = auth.uid()) and deleted_at is null)`.
Integrantes inativos são aceitos (dívida histórica, ADR-0026 §6). Auditoria: `settlement.created` e `settlement.deleted` `{ "amount", "settlement_date" }`.

**Funções de leitura (`public`, `stable`, `security invoker`, `search_path = ''`, montantes `text`, filtro `family_id = private.current_family_id()` + RLS; `grant execute` a `authenticated`)**

| Função | Contrato |
|---|---|
| `goal_summary(p_from date, p_to date) returns table (goal_id uuid, saved text, deposits text, withdrawals text)` | Uma linha por meta visível (todos os status). `saved` = D9 de todas as datas; `deposits`/`withdrawals` = Σ com `contribution_date ∈ [p_from, p_to]`; não excluídas. Datas nulas, `p_from > p_to` ou mais de 366 dias → `INVALID_INPUT` |
| `member_balances() returns table (debtor_member_id uuid, creditor_member_id uuid, amount text)` | D10 (saldo entre integrantes), todas as datas, só `amount > 0`, uma linha por par. Estorno com a proporção do original via `allocate_cents` |
| `projected_cash_flow(p_months integer) returns table (month date, pending_income text, pending_expense text, recurring_income text, recurring_expense text)` | D15 (saldo futuro). `p_months` 1..12 (senão `INVALID_INPUT`); meses a partir do mês de hoje, todos presentes. Pendente: `pending` não excluído, `income`/`expense`, data no mês (no 1º mês, também as anteriores a hoje). Recorrente: séries `is_active`, datas da agenda ≥ `greatest(next_occurrence_date, today)` e ≤ `end_date`, no mês (no máximo 60 por série) |

**pgTAP** (`supabase/tests/database/`): `400_etapa6_privileges` (RLS, grants exatos, nenhum grant de escrita em `expense_splits`, `prosecdef`/`proconfig`, `anon`), `410_goals`, `420_goal_contributions`, `430_splits`, `440_settlements_balances`, `450_projection`, `460_etapa6_regression` (R15–R18 + R1..R14 inalterados com metas, parcelas e liquidações no banco), `470_audit_etapa6`. Cobertura: CA-E6-01..16.

### 3.2 Backend → frontend e design-system

**Códigos novos de `ErrorCode`** (de `P0001`): `GOAL_NOT_ACTIVE` ("Esta meta não está ativa. Reative-a para registrar aportes."), `GOAL_NEGATIVE_PROGRESS` ("O valor guardado não pode ficar negativo. Confira o valor da retirada.", `fieldErrors.amount` na retirada), `SPLIT_NOT_ALLOWED` ("Só despesas não canceladas podem ser divididas."), `SPLIT_SUM_MISMATCH` ("A soma das partes precisa ser igual ao valor da despesa."), `MEMBER_INACTIVE` ("Um dos integrantes não faz mais parte da família. Atualize a página."). `INVALID_STATUS_TRANSITION` (Etapa 5) vale para metas.

**`family/permissions.ts`** (só UX): `can()` ganha `"goal.manage"` (owner, admin). Novas: `canContributeFor(role, myMemberId, memberId)` (owner/admin: qualquer; member: só o próprio), `canDeleteContribution(role, createdBy, userId)` e `canSetSplits(role, createdBy, userId)` (= regra de `canManageTransaction`), `canRegisterSettlement(role, myMemberId, fromId, toId)` (owner/admin ou parte).
**`family/domain/member-name.ts`** · `memberDisplayName(name: string | null): string` → `"Ex-integrante"` quando o perfil não é legível. Usado por todas as queries novas desta etapa.
**`proxy.ts`/`safe-redirect.ts`**: `/metas`, `/planejamento`, `/divisao`.

**Constantes e domínio (TS puro, testados)**

| Arquivo · export | Contrato |
|---|---|
| `goals/constants.ts` | `GOAL_STATUSES`, `GOAL_ICONS` (as 12 chaves do banco, com rótulo pt-BR), `GoalIconName`, `NEAR_TARGET_PERCENT = 80`, `PACE_WINDOW_DAYS = 90`, `GOAL_FILTERS = ["ativas","concluidas","todas"]` |
| `goals/domain/progress.ts` · `goalProgress(target: Cents, saved: Cents): { percent: number \| null; remaining: Cents; reached: boolean }` | D9 |
| `goals/domain/estimate.ts` · `estimateGoal({ target, saved, netInWindow: Cents, targetDate: ISODate \| null, today: ISODate, monthly?: Cents }): GoalEstimate` | D9. `GoalEstimate` = `{ pace: Cents; paceSource: "history" \| "informed"; months: number \| null; estimatedMonth: ISODate \| null (1º dia); monthsToTarget: number \| null; requiredMonthly: Cents \| null; targetDatePassed: boolean; premise: string }`. `monthly` informado substitui o ritmo (cenário "prazo de meta") |
| `splits/constants.ts` | `SPLIT_MODES = ["equal","amounts"]`, `MIN_PARTS = 2`, `MAX_PARTS = 20`, `SPLIT_FILTERS = ["todas","pendentes","pagas"]` |
| `splits/domain/preview.ts` · `previewEqualSplit(total: Cents, memberIds: readonly string[]): { memberId: string; amount: Cents }[]`; `amountSplitDifference(total: Cents, parts: readonly Cents[]): Cents` | D13 pelo `allocate` (ids já em ordem `joined_at, id`); diferença = total − Σ (0 = fecha). Só prévia: o banco recalcula |
| `planning/constants.ts` | `SCENARIOS = ["financiamento","objetivo","prazo_meta","novo_compromisso","reducao_despesas","saldo_futuro"]` com rótulos ("Comprar um carro ou bem financiado", "Juntar para uma viagem ou objetivo", "Prazo de uma meta", "Novo compromisso mensal", "Reduzir despesas", "Saldo futuro"); limites de D15; `PLANNING_DISCLAIMER` = "Simulação para apoiar decisões. Não é recomendação nem aconselhamento financeiro." |
| `planning/domain/*.ts` (sem `server-only`; usável no cliente) | `simulateFinancing`, `simulateSaving`, `simulateGoalDeadline` (usa `estimateGoal`), `simulateNewCommitment`, `simulateReduction`, `projectBalance`. Cada uma recebe entradas em `Cents`/`number` e a `PlanningBaseline` quando precisa, e devolve `{ ok: true; headline: ResultLine; lines: ResultLine[]; premises: string[] } \| { ok: false; error: "OUT_OF_RANGE" \| "NO_BASELINE" }`, com `ResultLine = { label: string; value: Cents \| number \| string; format: "brl" \| "months" \| "percent" \| "month" \| "text"; source: "known" \| "informed" \| "estimated" }`. Nenhuma devolve `NaN`/`Infinity` (teste) |

**Schemas Zod** (nenhum com `family_id`; o frontend usa `zodResolver` e `z.input`):

| Arquivo · export | Campos |
|---|---|
| `goals/schemas.ts` · `goalInputSchema` | `name` 1..80, `description?` ≤ 500, `targetAmount` (positivo), `targetDate?` (`isoDate()`, ≥ hoje na criação), `icon` (enum `GOAL_ICONS`), `idempotencyKey` |
| `updateGoalSchema`, `goalIdSchema`, `goalStatusSchema` | `goalId` + campos de `goalInputSchema` sem `idempotencyKey` (sem a regra "≥ hoje") / `{ goalId }` / `{ goalId, to: "active" \| "paused" \| "completed" \| "canceled" }` |
| `contributionSchema` | `goalId`, `kind` (`deposit\|withdrawal`), `amount` (positivo), `contributionDate` (`isoDate({ notAfterToday: true })`), `memberId?` (omitido = o próprio vínculo, resolvido no servidor), `notes?` ≤ 500, `idempotencyKey` |
| `contributionIdSchema`, `goalFiltersSchema` | `{ contributionId }` / URL tolerante: `situacao` (`ativas` (padrão) `\|concluidas\|todas`), `pagina` |
| `splits/schemas.ts` · `setSplitSchema` | união discriminada por `mode`: `equal` `{ transactionId, memberIds }` (2..20, distintos); `amounts` `{ transactionId, shares: { memberId, amount }[] }` (2..20, distintos, positivos); `none` `{ transactionId }` |
| `settlementSchema`, `settlementIdSchema`, `splitFiltersSchema` | `fromMemberId`, `toMemberId` (≠, erro no campo), `amount`, `settlementDate` (`notAfterToday`), `notes?`, `idempotencyKey` / `{ settlementId }` / URL tolerante `situacao` (`todas` (padrão) `\|pendentes\|pagas`), `pagina`, `por_pagina` (20/50/100) |
| `planning/schemas.ts` | um schema por cenário, com os limites de D15 (validação no cliente; nada vai ao servidor) |

**Server Actions** (`runAction`, `auth: "required"`; `revalidatePath` de `/metas`, `/divisao`, `/inicio`, `/transacoes`, `/compromissos`, conforme o caso):

| Arquivo · função | Retorno | Comportamento |
|---|---|---|
| `goals/actions.ts` · `createGoal` / `updateGoal` / `changeGoalStatus` | `{ id }` / `null` / `null` | RLS; 0 linhas: visível → `FORBIDDEN`, senão `NOT_FOUND`; idempotente pela chave |
| `addContribution` / `deleteContribution` | `{ id }` / `null` | `memberId` omitido → `requireMembership().memberId`; `GOAL_NOT_ACTIVE`, `GOAL_NEGATIVE_PROGRESS`, `FORBIDDEN`; idempotente |
| `splits/actions.ts` · `setTransactionSplits(input)` | `null` | RPC `set_transaction_splits` (`amounts` com `toDbNumeric`) |
| `createSettlement` / `deleteSettlement` | `{ id }` / `null` | RLS; idempotente |

**Queries** (`server-only`; `Cents`, `ISODate`; nomes de integrante por `memberDisplayName`):

| Função | Retorno |
|---|---|
| `goals/queries.ts` · `listGoals(filters)` | `GoalView[]` = `{ id; name; description; icon: GoalIconName; status; targetAmount; saved; remaining: Cents; percent: number \| null; targetDate: ISODate \| null; estimate: GoalEstimate; completedAt: string \| null; canManage; canContribute: boolean }`. `ativas` = `active` + `paused`; `concluidas` = `completed`; `todas` inclui `canceled`. Uma chamada a `goal_summary(hoje − 89, hoje)` |
| `getGoal(id, { page })` | `GoalDetail \| null` = `GoalView` + `contributions: { items: ContributionView[]; total; page; pageCount }` (20 por página, data desc) + `members: { id; displayName }[]` (ativos, para o `Select`). `ContributionView` = `{ id; kind; amount; date; member: { id; displayName }; notes; canDelete }` |
| `listGoalOptions()` | metas `active` (para o planejamento) |
| `splits/queries.ts` · `listSharedExpenses(filters)` | `{ items: SharedExpenseItem[]; total; page; pageSize; pageCount }`. Despesas com divisão, não canceladas nem excluídas; `pendentes` = `pending`, `pagas` = `paid`; data desc. `SharedExpenseItem` = `{ id; description; amount; date: ISODate; status: "pending" \| "paid"; payer: { id; displayName } \| null; category: { id; name; color; icon }; parts: { member: { id; displayName }; amount: Cents }[]; myShare: Cents \| null }` |
| `getTransactionSplit(transactionId)` | `SplitDetail \| null` = `{ transaction: { id; description; amount; status; date; payer \| null; isPending: boolean }; splittable: boolean; parts; mode: "equal" \| "amounts" \| null (derivado: igual a `previewEqualSplit` → `equal`); candidates: { id; displayName; active: boolean }[] (ativos + ex-integrantes já na divisão); canEdit }`. Inexistente, de outra família, excluído, transferência ou receita → `null` |
| `getMemberBalances()` | `{ pairs: { debtor; creditor: { id; displayName }; amount: Cents }[]; myMemberId: string }` (via `member_balances`) |
| `listSettlements({ page })` | `{ items: { id; from; to: { id; displayName }; amount; date; notes; canDelete }[]; total; page; pageCount }` |
| `planning/queries.ts` · `getPlanningBaseline()` | `PlanningBaseline` = `{ today; hasAccounts: boolean; consolidatedBalance: Cents; averageWindow: { from; to: ISODate }; averageMonthly: { income; expense; result: Cents }; categoryAverages: { categoryId; name; color; icon; average: Cents }[] (despesa, > 0, decrescente); goals: { id; name; saved; target; pace: Cents; targetDate }[]; projection: { month: ISODate; label; pendingIncome; pendingExpense; recurringIncome; recurringExpense: Cents }[] (12) }`. Chama `ensureRecurrencesMaterialized()` primeiro; usa `account_balances`, `monthly_cash_flow` (3 meses completos), `category_totals`, `goal_summary` e `projected_cash_flow(12)` em paralelo |

**Mudanças em módulos existentes**
- `reports`: `Dashboard` ganha `goals: DashboardGoal[]` = até 3 metas `active` (data-alvo crescente, sem data por último, depois `created_at`), `{ id; name; icon; saved; target: Cents; percent: number \| null }`, via `goal_summary`. `INDICATOR_DEFINITIONS.goals` → D9 ("Soma dos aportes menos as retiradas. É uma reserva registrada: não muda o saldo das contas.").
- `transactions`, `bills`: nenhuma mudança de interface. A reescala de parcelas no pagamento é do banco.

### 3.3 Design-system → frontend

**A-ds:** `shadcn add checkbox` (§1). `Checkbox` com rótulo associado e alvo ≥ 40px.

| Arquivo · export | Contrato |
|---|---|
| `shared/goal-icon.tsx` · `GoalIcon` (sem `"use client"`) | `{ icon: GoalIconName; size?: "sm" \| "md" \| "lg"; label?: string }`. Ícone Lucide da chave dentro de um bloco arredondado em `bg-primary/10 text-primary` (tokens; substitui a foto do mockup 4). Decorativo (`aria-hidden`) sem `label` |
| `shared/value-source-badge.tsx` · `ValueSourceBadge` (sem `"use client"`) | `{ source: "known" \| "informed" \| "estimated" }` → `Badge` + ícone + texto: Conhecido (`outline`, `DatabaseIcon`), Informado (`secondary`, `PencilIcon`), Estimado (`outline`, `CalculatorIcon`, texto em itálico). Nunca só cor |

Tokens: nenhum novo. `docs/design-system.md` ganha `Checkbox`, `GoalIcon`, `ValueSourceBadge` e o padrão de status de meta: `Badge` + ícone + texto — Ativa `default`, Pausada `secondary`, Concluída `success`, Cancelada `outline`.

### 3.4 Rotas e telas (frontend)

Em `src/app/(app)/`, Server Components, `loading.tsx` com `Skeleton`, `error.tsx` do grupo, filtros na URL, formulários pela ADR-0017 e pelo padrão `Field` + `Controller`. Fidelidade visual: mockups 4, 6, 7 e 10.

| Rota | Conteúdo e estados |
|---|---|
| `/metas` (mockup 4) | `PageHeader` "Metas" + "Nova meta" (owner/admin). `Tabs` **Ativas \| Concluídas \| Todas** (`?situacao=`). Lista de cartões: `GoalIcon` (lugar da foto), nome, "R$ 2.400,00 / R$ 5.000,00", percentual em texto ("48%"), `ProgressMeter` (`valueText` "48% da meta"), à direita a estimativa ("12 meses", "Sem estimativa" ou "Concluída") e `Badge` de status quando não ativa. Cada cartão → `/metas/[id]`. Vazio: "Nenhuma meta ainda" + "Criar meta" (member: "Peça a um administrador para criar a primeira meta da família.") |
| `/metas/nova`, `/metas/[id]/editar` | Nome, Ícone (grade de `RadioGroup` com `GoalIcon` e rótulo), "Valor da meta" (`MoneyInput`), "Data-alvo (opcional)" (`DatePicker`, `min` hoje na criação), Descrição. "Salvar meta". Member, meta concluída ou cancelada → `notFound()` |
| `/metas/[id]` | Cabeçalho com nome, `GoalIcon` e status. Card "Progresso": Guardado, Meta, Falta, %, `ProgressMeter`; texto fixo "O valor guardado é uma reserva registrada aqui. Ele não sai das contas nem muda o saldo total." Card "Estimativa": mês previsto ("dezembro de 2027") **com a premissa** (`estimate.premise`) ou "Sem estimativa: registre aportes para calcularmos um ritmo."; com data-alvo, "Para chegar até 30/06/2027: R$ 500,00 por mês" ou "A data-alvo já passou". Ações: "Registrar aporte" e "Registrar retirada" (`Dialog`: Valor, Data `max` hoje, Integrante — `Select` para owner/admin, fixo no próprio para member —, Observação; "Salvar aporte"/"Salvar retirada" com `loading`), Editar, Pausar/Reativar, Concluir e Cancelar (`AlertDialog`: "A meta deixa de receber aportes. Isso não pode ser desfeito."). "Histórico de aportes": `ResponsiveList` (data, integrante, `Badge` Aporte/Retirada com ícone, `Money` com `direction`, observação, "Excluir" com `AlertDialog`), paginado. Inexistente ou de outra família → `notFound()` |
| `/divisao` (mockup 6) | `PageHeader` "Divisão de contas" + "Adicionar conta" (→ `/compromissos/novo`). Card "Quem deve a quem": frases "Bianca deve R$ 20,00 a Ana" (de `getMemberBalances`), "Ninguém deve nada" no vazio, e "Registrar acerto". `Tabs` **Todas \| Pendentes \| Pagas** (o mockup diz "Penduradas"; "Pendentes" segue o vocabulário da Etapa 5). `ResponsiveList`: `CategoryIcon`, descrição, "Responsável: João" (ou "Sem responsável"), "Dividida entre 3", "Sua parte R$ 66,67", `Money`, status (`Badge` + ícone + texto: Pendente, Pago). Cada item → `/divisao/[transactionId]`. Vazio: "Nenhuma despesa dividida" + "Para dividir, abra uma despesa ou conta a pagar e escolha Dividir despesa." Link "Ver acertos" → `/divisao/acertos` |
| `/divisao/[transactionId]` | Card da despesa (descrição, valor, data, status, responsável). Texto fixo: "A divisão só registra quanto cabe a cada um. A despesa continua contando uma vez no saldo e nos totais." Sem permissão: leitura das partes. Com permissão: `SegmentedControl` **Igualmente \| Por valores**; lista de `Checkbox` dos `candidates` ("Ex-integrante" rotulado); Igualmente → prévia por integrante (`previewEqualSplit`); Por valores → `MoneyInput` por integrante e "Faltam R$ X"/"Passou R$ X"/"Fecha com o valor da despesa" (`amountSplitDifference`). "Salvar divisão" (habilitado só com 2+ integrantes e diferença 0) e "Remover divisão" (`AlertDialog`). Não divisível ou inexistente → `notFound()` |
| `/divisao/acertos`, `/divisao/acertos/novo` | Lista paginada (data, "De → Para", `Money`, observação, quem registrou, "Excluir" conforme `canDelete`). Formulário: De, Para (`Select`; member: um dos dois é ele, o outro lado fica travado nele), Valor, Data (`max` hoje), Observação; texto "O acerto registra um pagamento entre integrantes. Não altera contas nem o saldo total." "Salvar acerto" |
| `/planejamento` (mockup 7) | `PageHeader` "Planejamento" + `Alert` info com `PLANNING_DISCLAIMER` (sempre visível). Duas colunas (empilham no celular). Esquerda "Simulador de cenários": `Select` "Qual objetivo você quer simular?" (6 cenários) e os campos do cenário (`MoneyInput`, número de meses, taxa mensal em % com a ajuda "Use a taxa da proposta ou do contrato. O Núcleo não sugere taxas."; `Select` de meta ou categoria). Botão "Simular". Direita "Resultado estimado": `headline` grande (ex.: "Valor da parcela aproximada R$ 1.792,87"), linhas com `ValueSourceBadge`, lista "Premissas" e um card de contexto conhecido (ex.: "Seu resultado médio nos últimos 3 meses foi R$ 2.583,00."). Saldo futuro: tabela Mês \| Entradas previstas \| Saídas previstas \| Saldo projetado. Sem contas: cenários que dependem de base mostram `EmptyState` ("Cadastre uma conta para simular com seus dados"); financiamento e objetivo funcionam. Estado do formulário só em memória |
| `/transacoes/[id]`, `/compromissos/[id]` | Para despesa: bloco "Divisão" com as partes ou o link "Dividir despesa" (`canSetSplits`) → `/divisao/[id]` |
| `/inicio` | Card "Metas" ligado (mockups 2 e 10): até 3 de `goals` com `GoalIcon`, nome, % e `ProgressMeter`; "Ver todas" → `/metas`. Vazio: "Nenhuma meta ativa" + "Criar meta" (owner/admin) ou orientação (member) |

`SubNav` de `/transacoes`, `/compromissos`, `/recorrencias` e `/divisao`: Lançamentos · Compromissos · Recorrências · **Divisão**. `src/config/navigation.ts`: Transações ativo também em `/divisao`; novos itens **Metas** (`/metas`, `TargetIcon`, `mobile: "primary"`, como no mockup 10) e **Planejamento** (`/planejamento`, `CalculatorIcon`, `mobile: "more"`), na ordem da spec §9 (Início, Transações, Contas, Orçamentos, Metas, Planejamento, …). No celular, Família passa para "Mais" (mockup 10: Início, Transações, Metas, Mais; Contas segue na barra se couber em 360px, senão também vai para "Mais" — decisão do frontend, registrada no handoff).

### 3.5 Dependências novas

Nenhuma. `checkbox` é arquivo do shadcn sobre `@base-ui/react`. Atualização de dependências atrasadas só em A-ds.

## 4. Fluxos (resumo)

- **Aporte:** `Dialog` → `contributionSchema` → `addContribution` → insert (RLS) → trigger (meta ativa, integrante, data, lock e acumulado ≥ 0) → `goal_summary` muda; nenhum saldo muda.
- **Dividir:** `/divisao/[id]` → prévia no cliente → `setTransactionSplits` → RPC (lock, autorização, integrantes, D13 ou Σ exata) → constraint trigger no commit → auditoria.
- **Pagar compromisso dividido:** `payBill` (Etapa 5) com valor real → `transactions_rescale_splits` reescala na proporção → Σ = novo valor.
- **Simular:** página → `getPlanningBaseline` (RSC) → props → formulário cliente → `planning/domain` → resultado na tela. Nenhuma escrita.

## 5. Entregas e aceite por agente

### 5.1 database
Migrations da §3.1, sem SQL destrutivo sobre dados existentes. pgTAP 400–470 e `pnpm db:types`.
Aceite: `pnpm db:reset && pnpm db:test` 100% verde do zero (inclusive 010, 100–210 e 300–370); `pnpm db:lint` sem erro; CA-E6-01..16; toda função `security definer` nova com `search_path=''`; `goal_summary`, `member_balances` e `projected_cash_flow` com `prosecdef = false`.

### 5.2 backend
A-be: interfaces, domínio e `member-name` com testes. B: repositories, services, actions, queries, `reports` (metas), códigos de erro, `proxy`/`safe-redirect`, integração.
Aceite: CA-E6-30..39; `pnpm lint`, `typecheck`, `test`, `test:integration` verdes; `grep -rnE "parseFloat|toFixed\("` em `src/modules/{goals,splits,planning}` vazio (o planejamento usa `number` só dentro de `planning/domain`, com conversão por função testada); `grep -rn "expense_splits" src` só em leitura (`select`); `server-only` nos arquivos de servidor, nunca em `planning/domain`.

### 5.3 design-system
A-ds: `shadcn add` e conferências; `GoalIcon`, `ValueSourceBadge`, testes RTL e `docs/design-system.md`.
Aceite: CA-E6-70..72; diff de `package.json` vazio (salvo atualização de dependências atrasadas); nenhum hex em `.tsx`.

### 5.4 frontend
Telas da §3.4, componentes de módulo, navegação, E2E (`metas`, `divisao`, `planejamento`, atualização de `inicio`; desktop e mobile).
Aceite: CA-E6-50..62; RTL do `GoalForm`, do `ContributionDialog` (member com integrante fixo, `max` hoje, `loading`), do `SplitForm` (troca de modo, prévia, diferença, botão desabilitado) e do simulador (cada cenário mostra as três origens e o aviso); nenhum cálculo de percentual, estimativa, parcela ou saldo em componente (só chamadas às funções de domínio).

## 6. Integração (Fase C)

Ordem: `pnpm install` → `pnpm db:reset` → `pnpm db:types` (sem diff) → `pnpm check` → `pnpm build` → `pnpm db:test` → `pnpm test:integration` → `pnpm test:e2e` → `pnpm outdated`/`audit` → `node ~/.claude/factory/security/gate.mjs "<projeto>"` → revisão (reviewer + security; mudança `structural`: 4 tabelas, RLS, RPC `security definer`, trigger novo em `transactions`).
Etapa 6 concluída = CA-E6-* verdes + regra de conclusão. O architect atualiza `data-model.md` §5.6–5.8 e o catálogo de auditoria, e o roadmap.

## 7. Bloqueadores e riscos

| Item | Impacto | Mitigação |
|---|---|---|
| Etapas 4 e 5 não implementadas | esta etapa não compila (interfaces citadas) | pré-condição §1; nenhuma fase além de A-db começa antes |
| Docker Desktop rodando | sem `db:test`, integração e E2E | bloqueante |
| D13 em SQL e em TS divergirem | prévia diferente do gravado | mesma tabela de casos nos dois (CA-E6-08, CA-E6-31); a tela recarrega o gravado depois de salvar |
| Trigger de reescala interagir com o `before` da Etapa 5 (estorno trava `amount`) | reescala inesperada | trigger separado, `after update of amount`; pgTAP R17 e pagamento sem mudança de valor (nenhuma reescala) |
| Usuário entender a meta como dinheiro separado | expectativa errada | texto fixo na meta e em "Como calculamos" (ADR-0025) |
| Simulação com `number` | arredondamento | conversão única por meio para longe do zero, totais do valor exato (D15), R19 |
| Bottom nav com 5 itens em 360px | rolagem horizontal | decisão do frontend registrada; CA-E6-58 |
| Spec truncada na §15 | — | segue aberto |

## 8. Pedido de mudança

Formato no handoff: `CR-<agente>-<n>: <arquivo/interface> — <mudança> — <motivo> — <impacto em quem>`.
O orchestrator decide. Se uma interface da §3 muda, este documento sobe de versão (1.1) antes da implementação.
