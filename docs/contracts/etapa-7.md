# Contrato de execução — Etapa 7 (relatórios, notificações, família e auditoria)

Versão 1.0 (2026-10-24) · Dono: orchestrator/architect · Alteração só por pedido ao orchestrator (§8).
Referências: spec §6, §7.11, §7.13, §7.14, §8, §9, §11 Etapa 7, §12 B/E/F, §13, §14; mockups **5** (Relatórios), **8** (Família), **9** (Notificações)
e **2** (sino no cabeçalho) de `docs/reference/mockups.png`; `financial-definitions.md` v1.2 (D4, D10, D14, D16, D17, D21, D22; R20);
`permissions.md` §2 e §4 (linhas Integrantes, Auditoria, Relatórios, Notificações, aprovadas); `acceptance-criteria.md` (CA-E7-*);
`threat-model.md` §3.12 (AB-110..119); ADRs 0006, 0007, 0008, 0015, 0020, 0021, **0028**, **0029**, **0030**; contratos `etapa-4.md`, `etapa-5.md`
e `etapa-6.md` v1.0. **Onde este contrato e o `data-model.md` §4.8 e §5.9 divergirem, vale este contrato.**

**Dependência:** as Etapas 4, 5 e 6 estão **contratadas, não implementadas**. `reports/**` (`period_summary` via `getPeriodSummary`, `monthly_cash_flow`,
`category_totals`, `buildCategoryBreakdown`, `compare`, `previousPeriod`), `charts/**`, `budget_progress`, `ProgressMeter`, `SubNav`, `goal_summary`,
`member_balances`, `private.allocate_cents`, `private.current_member_id`, `memberDisplayName` e as rotas `/compromissos`, `/metas`, `/divisao` são
interfaces **a ser entregues** por aqueles contratos. Já existem no código: `family/{actions,queries,repository,permissions}.ts`, `requireMembership`,
`/familia`, `/convite/[token]`, as RPCs de convite e `private.log_audit`.

## 0. Regras do contrato

1. Valem as regras do `etapa-3.md` §0 ao `etapa-6.md` §0.
2. **Relatório não tem fórmula própria** (ADR-0028): só chama as funções SQL existentes e as duas novas da §3.1, e a composição de `reports/domain`.
   Nenhum componente soma, subtrai ou calcula percentual.
3. **Papel e vínculo só mudam pelas quatro RPCs** da §3.1. `family_members` continua sem grant de escrita.
4. **Notificação só é criada por `refresh_notifications()`**; o app só lê, marca como lida e monta texto e link por lista fechada (ADR-0029).
5. Auditoria: os eventos novos da §3.1 entram no catálogo fechado (`data-model.md` §4.6); metadata sem nome, e-mail, descrição ou observação.
   **SEC-4 e SEC-10 continuam adiados para a Etapa 9.**
6. Fora do escopo: e-mail, push e preferências de notificação; notificação "convite recebido" (ADR-0029 §5); exportação de relatório; evolução do
   patrimônio mês a mês; excluir família; reentrada automática; "Dica do Núcleo" e "Conquistas" além de "meta perto de ser alcançada"; recusa de
   convite persistida (§3.4). Não criar rota, tabela, coluna ou componente para eles.

## 1. Fases e sequência

Pré-condição: Etapa 6 integrada (CA-E6-* verdes, gate `PASSA`). A-db pode começar quando as migrations da Etapa 6 estiverem prontas; as demais fases
esperam a Etapa 6 concluída (`reports`, `navigation.ts`, `/inicio` e `/familia` mudam de novo).

| Fase | Quem | O quê | Pode começar quando |
|---|---|---|---|
| A-db | database | migrations, RPCs, funções, trigger de `families` e pgTAP da §3.1; `pnpm db:types` assim que `notifications` existir | pré-condição de A-db |
| A-be | backend | **interfaces primeiro**: `modules/{notifications,activity}/{constants,types,schemas}.ts` e `domain/**` (TS puro, testados); `reports/{types,schemas}.ts` e `reports/domain/report-period.ts`; `family/{schemas,types,permissions}.ts`; `ErrorCode` | pré-condição |
| A-ds | design-system | `pnpm outdated`/`audit` e atualização do que estiver atrás (único momento em que `package.json` pode mudar); `charts/horizontal-bar-chart.tsx` e `LazyHorizontalBarChart` | pré-condição |
| B | backend + frontend em paralelo (DS termina testes e doc; database termina pgTAP) | backend: repositories, services, actions, queries, `ensureNotificationsRefreshed`, `memberDisplayName` nos módulos antigos, integração. Frontend: telas da §3.4 | A-ds e A-be concluídas (backend: também `database.ts`) |
| C | orchestrator (+ QA, reviewer, security) | integração (§6); architect atualiza `data-model.md` §4.8, §5.9 e catálogo; roadmap | todos de B entregues |

Paralelismo: A-db, A-be e A-ds juntas; em B, backend e frontend juntos. As três frentes (relatórios, notificações, família) não compartilham arquivo
dentro do mesmo agente, então podem ser feitas em qualquer ordem pelo dono.

## 2. Mapa de donos (acréscimos; os mapas anteriores continuam valendo)

| Caminho | Dono |
|---|---|
| `supabase/migrations/2026*_etapa7_*.sql`, `supabase/tests/database/5[0-9]0_*.test.sql`, `src/types/database.ts` | database |
| `src/modules/{notifications,activity}/**` **exceto** `components/` | backend |
| `src/modules/family/**` exceto `components/`; `src/modules/reports/**` exceto `components/` | backend |
| `src/modules/{transactions,bills,recurrences}/{queries,repository}.ts` (só a troca para `memberDisplayName`) | backend |
| `src/server/{action,errors,error-messages}.ts`, `src/proxy.ts`, `src/lib/safe-redirect.ts` | backend |
| `tests/integration/{reports,notifications,family-members,activity,etapa7-regression}.test.ts` | backend |
| `src/components/charts/{horizontal-bar-chart,lazy}.tsx` e testes, `docs/design-system.md`, `package.json`/`pnpm-lock.yaml` (só A-ds) | design-system |
| `src/app/(app)/{relatorios,notificacoes}/**`, `src/app/(app)/familia/**`, `src/app/(app)/layout.tsx` (contador), `src/app/(public)/convite/**`, `src/config/navigation.ts`, `src/components/layout/**` (sino) | frontend |
| `src/modules/{notifications,activity,family,reports}/components/**` | frontend |
| `e2e/{relatorios,notificacoes,familia,atividade}.spec.ts`, `e2e/helpers/**` | frontend |
| `docs/**` (exceto `docs/design-system.md`), `.claude/**` | orchestrator/architect |

## 3. Interfaces

### 3.1 Database → backend

Convenções do `data-model.md` §1. Ordem sugerida: `etapa7_member_management` → `etapa7_family_audit` → `etapa7_notifications` → `etapa7_report_functions`.

**RPCs de integrantes** (`public`, `plpgsql`, `security definer`, `set search_path = ''`, `revoke ... from public, anon`, `grant execute` a `authenticated`; ADR-0030).
Todas começam com `auth.uid()` nulo → `NOT_AUTHENTICATED`; família = `private.current_family_id()` (nula → `FORBIDDEN` `42501`); o vínculo do
chamador e o do alvo são travados `for update` (em ordem de `id`, contra deadlock); o alvo é buscado por `id` **e** família **e** `status = 'active'`
(senão `NOT_FOUND`, sem distinguir inexistente, de outra família ou encerrado). O papel do chamador é sempre lido do banco **antes** de buscar o alvo.

| RPC | Regras (em ordem) |
|---|---|
| `change_member_role(p_member_id uuid, p_role text) returns void` | chamador não é owner → `FORBIDDEN`; `p_role not in ('admin','member')` → `INVALID_INPUT`; alvo → `NOT_FOUND`; alvo = chamador → `CANNOT_TARGET_SELF`; papel igual → retorna sem evento; `update role`; `member.role_changed { "member_id", "from_role", "to_role" }` |
| `transfer_ownership(p_member_id uuid) returns void` | chamador não é owner → `FORBIDDEN`; alvo → `NOT_FOUND`; alvo = chamador → `CANNOT_TARGET_SELF`; `update` do chamador para `admin` **e depois** do alvo para `owner` (o índice `family_members_one_owner` nunca vê dois); `family.ownership_transferred { "member_id", "previous_owner_member_id", "from_role" }` |
| `remove_family_member(p_member_id uuid) returns void` | chamador `member` → `FORBIDDEN`; alvo → `NOT_FOUND`; alvo = chamador → `CANNOT_TARGET_SELF`; alvo `owner` → `FORBIDDEN`; chamador `admin` e alvo `admin` → `FORBIDDEN`; `status = 'removed'`, `ended_at = now()`; revoga os convites pendentes (`accepted_at` e `revoked_at` nulos, `expires_at > now()`) com `created_by` = usuário do alvo nesta família (`revoked_by = auth.uid()`; `invite.revoked { "invite_id", "reason": "member_ended" }` cada); `member.removed { "member_id", "from_role", "revoked_invites" }` |
| `leave_family() returns void` | vínculo ativo do chamador (`for update`); `owner` → `OWNER_MUST_TRANSFER`; `status = 'left'`, `ended_at = now()`; revoga os convites pendentes que ele criou (como acima); `member.left { "member_id", "from_role", "revoked_invites" }` |

Nenhuma RPC apaga ou altera lançamento, compromisso, série, meta, aporte, parcela, liquidação, orçamento ou notificação (ADR-0030 §2).

**Auditoria do nome da família**: trigger `families_after_update_audit` (`after update of name`, `when (old.name is distinct from new.name)`, `security definer`)
→ `family.updated { "fields": ["name"] }`. O update continua direto (grant `(name)` e policy owner da Etapa 2). Não existe `update_family`.

**`notifications`** (ADR-0029)

| Coluna | Regra |
|---|---|
| `id` | |
| `family_id` | not null; FK families restrict |
| `user_id` | not null; FK profiles restrict |
| `type` | `notifications_type_check`: `in ('bill_due_soon','bill_overdue','goal_near_target','budget_near_limit','member_joined','financial_event')` |
| `entity_type` | `in ('transaction','goal','budget','family_member','settlement')` |
| `entity_id uuid not null` | sem FK (a notificação não bloqueia nada; o app trata entidade ausente) |
| `data jsonb not null default '{}'` | `jsonb_typeof = 'object'` e `pg_column_size(data) <= 2048` |
| `dedupe_key text not null` | `~ '^[a-z_]{1,40}:[0-9a-f-]{36}(:[0-9a-z-]{1,20})?$'` |
| `read_at timestamptz` | |
| `created_at` | |

`notifications_user_dedupe_key unique (user_id, dedupe_key)`; índices `notifications_user_created_idx (user_id, created_at desc)` e `notifications_user_unread_idx (user_id) where read_at is null`.
Grants: `select`; `update (read_at)`. Sem insert e sem delete. Policies: `notifications_select` e `notifications_update` (`using` e `with check`): `user_id = (select auth.uid()) and private.is_family_member(family_id)`.
Trigger `before update`: `old.read_at` não nulo → `new.read_at := old.read_at` (não "desmarca"); senão, `new.read_at` não nulo → `now()`.

**RPC `refresh_notifications() returns integer`** (`security definer`, **sem parâmetros**). `NOT_AUTHENTICATED`; família nula → devolve 0. Gera **só para o chamador**,
na família dele, `insert ... on conflict (user_id, dedupe_key) do nothing`, até **100** inserções por chamada, na ordem da tabela. "Pode pagar" = owner/admin,
autor ou responsável (`assigned_member_id` = vínculo do chamador), a regra de `pay_pending_transaction`. "Desde" = `greatest(joined_at do chamador, now() − 30 dias)`.

| Tipo | Origem | `dedupe_key` | `data` |
|---|---|---|---|
| `bill_overdue` | `pending` não excluído, `income`/`expense`, data em `[today − 30, today − 1]`, chamador pode pagar | `bill_overdue:<tx>:<data>` | `{ "kind", "description", "amount", "due_date" }` |
| `bill_due_soon` | idem, data em `[today, today + 3]` | `bill_due_soon:<tx>:<data>` | idem |
| `budget_near_limit` | orçamento não arquivado vigente no mês de hoje com `spent ≥ 80%` do limite, por `budget_progress(mês, mês)` | `budget_near_limit:<budget>:<yyyy-mm>` | `{ "category_name" (ou null = todas), "month", "spent", "limit", "percent" (inteiro, piso) }` |
| `goal_near_target` | meta `active` com 80% ≤ % < 100%, por `goal_summary` | `goal_near_target:<goal>:<alvo em centavos>` | `{ "name", "saved", "target", "percent" }` |
| `financial_event` | (a) lançamento não excluído nem cancelado, `income`/`expense`, sem `recurrence_id`, com `assigned_member_id` = vínculo do chamador, `created_by <> auth.uid()`, criado "desde"; (b) liquidação não excluída em que o chamador é parte, `created_by <> auth.uid()`, criada "desde" | `financial_event:<tx>:assigned` / `financial_event:<settlement>:settlement` | (a) `{ "kind", "description", "amount", "date", "status" }`; (b) `{ "amount", "settlement_date", "direction": "to_me" \| "from_me" }` |
| `member_joined` | vínculos ativos ≠ chamador com `joined_at` "desde" | `member_joined:<member>` | `{ "role" }` |

Limpeza na mesma chamada (só do chamador): apaga `bill_*` cujo lançamento não está mais `pending` ou foi excluído, e qualquer notificação com mais de 90 dias.
Devolve quantas criou.

**Funções de leitura (`public`, `stable`, `security invoker`, `search_path = ''`, `text`, filtro `family_id = private.current_family_id()` + RLS; `grant execute` a `authenticated`)**

| Função | Contrato |
|---|---|
| `account_flows(p_from date, p_to date) returns table (account_id uuid, opening text, inflow text, outflow text, closing text)` | D22. Contas visíveis (ativas e arquivadas); omite conta sem movimento no período e com `opening = closing = 0`. Datas nulas, `p_from > p_to` ou mais de 366 dias → `INVALID_INPUT` |
| `member_expense_totals(p_from date, p_to date) returns table (member_id uuid, amount text)` | D10 (relatório por integrante); `member_id` nulo = sem responsável; omite 0; Σ = `period_summary.expense` do intervalo. Mesmas validações |

**pgTAP** (`supabase/tests/database/`): `500_etapa7_privileges` (RLS de `notifications`, grants exatos, `prosecdef`/`proconfig`, `anon`, nenhum grant de escrita
em `family_members`), `510_member_management`, `520_member_exit_effects`, `530_notifications`, `540_report_functions`, `550_etapa7_regression` (R20 + R1..R19 inalterados),
`560_audit_etapa7`. Cobertura: CA-E7-01..16.

### 3.2 Backend → frontend e design-system

**Códigos novos de `ErrorCode`** (de `P0001`): `OWNER_MUST_TRANSFER` ("Transfira a propriedade da família para outro integrante antes de sair."),
`CANNOT_TARGET_SELF` ("Você não pode fazer isso com o seu próprio vínculo."). `NOT_FOUND` de integrante: "Este integrante não faz mais parte da família. Atualize a página."
**`family/permissions.ts`** (só UX): `can()` ganha `"member.change_role"`, `"member.transfer_ownership"`, `"family.rename"` (owner) e `"family.leave"` (admin, member);
nova `canRemoveMember(myRole, targetRole): boolean` (owner: admin e member; admin: member). `"audit.read"` (já existe) controla a atividade.
**`proxy.ts`/`safe-redirect.ts`**: `/relatorios`, `/notificacoes` (`/familia` já existe; `/familia/atividade` é subrota).
**`memberDisplayName`** (Etapa 6) passa a ser usado em `transactions`, `bills` e `recurrences` para responsável e autor: perfil ilegível → "Ex-integrante".

**Constantes e domínio (TS puro, testados)**

| Arquivo · export | Contrato |
|---|---|
| `reports/domain/report-period.ts` · `resolveReportPeriod(f: ReportFilters, today: ISODate): ReportPeriod` | D21. `ReportPeriod` = `{ preset: ReportPreset; from; to; previousFrom; previousTo: ISODate; label; previousLabel: string; months: ISODate[] }` (`months` = 1º dia de cada mês civil que toca P). Personalizado inválido → `30_dias` |
| `notifications/constants.ts` | `NOTIFICATION_TYPES`; `NOTIFICATION_TABS = { todas: all, lembretes: ["bill_due_soon","bill_overdue","budget_near_limit"], conquistas: ["goal_near_target"] }` |
| `notifications/domain/render.ts` · `renderNotification(n: NotificationRow, ctx: { today: ISODate; memberName: (id: string) => string }): { title: string; message: string; href: string \| null; icon: "bill" \| "overdue" \| "budget" \| "goal" \| "member" \| "event" }` | Texto pt-BR com `formatBRL`/`formatDateBR` (ex.: "Conta a vencer" · "Aluguel vence em 3 dias · R$ 1.200,00"; "Meta próxima" · "Sua meta Reserva de emergência atingiu 80%"; "Despesa registrada" · "Supermercado · R$ 342,50"). `href` **só** da lista fechada: `transaction` pendente → `/compromissos/<id>`, efetivado → `/transacoes/<id>`; `goal` → `/metas/<id>`; `budget` → `/orcamentos?mes=<yyyy-mm>`; `family_member` → `/familia`; `settlement` → `/divisao/acertos`. `id` validado como uuid; fora disso, `null` |
| `activity/constants.ts` | `ACTIVITY_GROUPS = { familia: ["family.","member.","invite."], lancamentos: ["transaction.","account.","category."], compromissos: ["recurrence.","transaction.paid","transaction.canceled"], metas: ["goal.","goal_contribution."], divisao: ["transaction.splits_changed","settlement."] }` |
| `activity/domain/describe.ts` · `describeAuditEvent(e: { action; entityType; entityId; metadata }, ctx: { memberName }): { title: string; detail: string \| null; href: string \| null }` | Catálogo **fechado** de todas as ações do `data-model.md` §4.6 (ex.: "Papel alterado" · "Integrante → Administrador"; "Lançamento editado" · "Valor R$ 200,00 → R$ 250,00"); ação desconhecida → "Alteração registrada", sem mostrar metadata crua |

**Schemas Zod** (nenhum com `family_id`):

| Arquivo · export | Campos |
|---|---|
| `reports/schemas.ts` · `reportFiltersSchema` | URL, tolerante: `periodo` (`7_dias \| 30_dias` (padrão) `\| 3_meses \| 12_meses \| personalizado`), `de`, `ate`; `categoryReportSchema` acrescenta `tipo` (`despesas` (padrão) `\| receitas`) |
| `family/schemas.ts` · `changeRoleSchema`, `memberIdSchema`, `renameFamilySchema` | `{ memberId, role: "admin" \| "member" }` / `{ memberId }` / `{ name }` (1..80 após trim) |
| `notifications/schemas.ts` · `notificationIdSchema`, `notificationFiltersSchema` | `{ notificationId }` / URL tolerante `aba` (`todas` (padrão) `\| lembretes \| conquistas`), `pagina` |
| `activity/schemas.ts` · `activityFiltersSchema` | URL tolerante: `grupo` (chaves de `ACTIVITY_GROUPS`), `de`, `ate`, `pagina`, `por_pagina` (20/50) |

**Server Actions** (`runAction`, `auth: "required"`):

| Arquivo · função | Retorno | Comportamento |
|---|---|---|
| `family/actions.ts` · `changeMemberRole`, `transferOwnership`, `removeMember` | `ActionResult<null>` | RPCs; `revalidatePath("/familia")` |
| `leaveFamily()` | `ActionResult<null>` | RPC `leave_family`; o cliente navega para `/onboarding` |
| `renameFamily({ name })` | `ActionResult<null>` | `update families set name` (RLS); 0 linhas → `FORBIDDEN` |
| `notifications/actions.ts` · `openNotification({ notificationId })` | `ActionResult<{ href: string \| null }>` | `update read_at` (RLS); 0 linhas → `NOT_FOUND` (igual para inexistente e alheia); `href` por `renderNotification` no servidor |
| `markAllNotificationsRead()` | `ActionResult<{ count: number }>` | `update ... where read_at is null` (RLS) |

**Serviço**: `notifications/service.ts` · `ensureNotificationsRefreshed(): Promise<void>` — `server-only`, `React.cache` por requisição; chama `refresh_notifications()`;
em erro registra (`module: "notifications"`, código, `requestId`) e **não lança**. Chamado no início de `listNotifications` e `getUnreadNotificationCount`.

**Queries** (`server-only`; `Cents`, `ISODate`; nomes por `memberDisplayName`):

| Função | Retorno |
|---|---|
| `reports/queries.ts` · `getReportOverview(f)` | `{ period: ReportPeriod; summary: { income; expense; result: Comparison }; cashFlow: CashFlowMonth[] (meses de P, `monthly_cash_flow`); expenseByCategory: CategoryBreakdown }`. `period_summary` atual e anterior + `monthly_cash_flow` + `category_totals` + categorias, em paralelo |
| `getCategoryReport(f)` | `{ period; type: "expense" \| "income"; breakdown: CategoryBreakdown; rows: { categoryId; name; color; icon; archived; current; previous: Cents; comparison: Comparison }[] }` (`category_totals` atual e anterior) |
| `getAccountReport(f)` | `{ period; accounts: { id; name; type; archived: boolean; opening; inflow; outflow; net; closing: Cents }[]; assetNet: Cents; consolidated: Comparison }` (`account_flows` + `account_balances` nas duas pontas; `assetNet` = Σ `net` das contas de ativo = `consolidated.delta`) |
| `getMemberReport(f)` | `{ period; total: Cents (= despesas(P)); rows: { member: { id; displayName } \| null; amount: Cents; percent: number \| null }[] }` (`member_expense_totals`; `null` = "Família (sem responsável)") |
| `getBudgetReport(f)` | `{ period; months: { month: ISODate; label; rows: { budgetId; category \| null; limit; spent: Cents; percent: number \| null; status }[] }[] }` (`budget_progress` dos últimos ≤ 12 meses de P; estado por `budgetProgress` da Etapa 5) |
| `getGoalReport(f)` | `{ period; goals: { id; name; icon; status; target; saved; deposits; withdrawals: Cents; percent: number \| null }[] }` (`goal_summary(P)`) |
| `notifications/queries.ts` · `listNotifications(filters)` | `{ items: NotificationView[]; unread: number; page; pageCount }` (20 por página, `created_at desc`); `NotificationView` = `{ id; type; title; message; icon; createdAt; read: boolean; hasLink: boolean }` |
| `getUnreadNotificationCount()` | `number` (count `head` com RLS) |
| `activity/queries.ts` · `listActivity(filters)` | `null` para member (a página dá `notFound()`); senão `{ items: { id; createdAt; actor: string ("Sistema" se nulo; "Ex-integrante" se ilegível); title; detail; href }[]; total; page; pageSize; pageCount }`. Lê `audit_events` com RLS, filtrado por prefixos do grupo e período; nomes por uma única consulta de perfis |
| `family/queries.ts` · `getFamilyOverview()` (mudança) | `FamilyOverview` ganha `memberCount`, `permissions: { canRename; canLeave; canViewActivity: boolean }` e, por `MemberView`, `actions: { makeAdmin; makeMember; transferOwnership; remove: boolean }` |

### 3.3 Design-system → frontend

| Arquivo · export | Contrato |
|---|---|
| `charts/horizontal-bar-chart.tsx` · `HorizontalBarChart` (`"use client"`, `export default`) | `{ data: { key: string; label: string; value: Cents; color: ChartColor }[]; ariaLabel: string }`. Barras horizontais com rótulo no eixo Y, linha do zero quando há negativos, tooltip em JSX com `formatBRL`, `role="img"` + `aria-label`, `isAnimationActive={false}` com `prefers-reduced-motion`. Cor só por `chartColorVar` |
| `charts/lazy.tsx` · `LazyHorizontalBarChart` | `dynamic(..., { ssr: false, loading: Skeleton })`, como os outros |

Tokens: nenhum novo. `docs/design-system.md` ganha o `HorizontalBarChart` e o padrão de notificação não lida: ponto + título em `font-semibold` + texto `sr-only` "Não lida" (nunca só cor).

### 3.4 Rotas e telas (frontend)

Em `src/app/(app)/`, Server Components, `loading.tsx` com `Skeleton`, `error.tsx` do grupo, filtros na URL, gráficos por `@/components/charts/lazy` dentro de `ChartCard`
(título, período, legenda, "Ver tabela", estado vazio). Fidelidade visual: mockups 5, 8, 9 e o sino do mockup 2.

| Rota | Conteúdo e estados |
|---|---|
| `/relatorios` (mockup 5) | `PageHeader` "Relatórios". `ReportPeriodFilter` (client): `SegmentedControl` **7 dias \| 30 dias \| 3 meses \| 12 meses \| Personalizado** (De/Até), `router.replace`. `SubNav` Visão geral · Categorias · Contas · Integrantes · Orçamentos · Metas, com os links preservando `periodo`/`de`/`ate`. "Resumo do período": Receitas, Despesas e Resultado com `Money` e variação em texto contra `previousLabel`. "Por categoria": `LazyDonutChart` + legenda com % + "Ver detalhes" → `/relatorios/categorias`. "Receitas x despesas por mês" (evolução mensal): `LazyCashFlowBarChart`, tabela Mês \| Receitas \| Despesas \| Resultado. Vazio: "Sem movimentações em {período}" + "Nova transação" |
| `/relatorios/categorias` | `SegmentedControl` Despesas \| Receitas (`?tipo=`); rosca e tabela Categoria \| {período} \| Anterior \| Variação (texto com sinal) |
| `/relatorios/contas` | `LazyHorizontalBarChart` do líquido por conta; tabela Conta \| Saldo inicial \| Entradas \| Saídas \| Saldo final; nota fixa "Transferências entre contas aparecem aqui. No saldo total elas se anulam."; linha final "Variação do saldo total" |
| `/relatorios/integrantes` | `LazyHorizontalBarChart` + tabela Integrante \| Despesas \| %, com linha Total = despesas do período; nota fixa: "Despesas divididas entram pela parte de cada um; sem divisão, pelo responsável; sem responsável, em Família." |
| `/relatorios/orcamentos` | Por mês: tabela Orçamento \| Limite \| Realizado \| % e `ProgressMeter` + `Badge` de estado (padrão da Etapa 5). Vazio → "Criar orçamento" (owner/admin) |
| `/relatorios/metas` | Lista com `GoalIcon`, `ProgressMeter`, "Aportes no período" e "Retiradas no período". Vazio → "Criar meta" (owner/admin) |
| `/notificacoes` (mockup 9) | `PageHeader` "Notificações" + "Marcar todas como lidas" (`loading`). `Tabs` **Todas \| Lembretes \| Conquistas** (`?aba=`). Itens: ícone em bloco (por `icon`), título, mensagem, data à direita (dd/mm), não lida = ponto + título em `font-semibold` + `sr-only` "Não lida". Clique → `openNotification` → `router.push(href)` (sem `href`: só marca como lida e avisa "Este item não está mais disponível."). Vazio: "Nenhuma notificação" + "Avisos de vencimentos, metas, orçamentos e da família aparecem aqui." |
| Cabeçalho (`app-header`) | Sino (mockup 2) antes do menu do usuário: link para `/notificacoes` com `aria-label` "Notificações, 3 não lidas" e selo com o número (9+); contador vindo de `getUnreadNotificationCount()` no `(app)/layout.tsx` |
| `/familia` (mockup 8) | Cabeçalho "Família" com "Editar" (owner → `Dialog` "Nome da família", "Salvar nome"); nome, "{n} membros" e avatares. "Membros": `Avatar`, nome ("(Você)"), `Badge` do papel (Proprietário, Administrador, Integrante) e `DropdownMenu` com as ações permitidas: "Tornar administrador"/"Tornar integrante", "Transferir propriedade" (`AlertDialog`: "Você passa a ser administrador. {nome} passa a ser o proprietário e pode alterar o seu papel."), "Remover da família" (`AlertDialog`: "{nome} perde o acesso aos dados da família na hora. O que foi registrado por {nome} continua na família. Convites criados por {nome} são revogados."). "Sair da família" para admin/member (`AlertDialog`: "Você perde o acesso aos dados desta família. O que você registrou continua com a família.") → `/onboarding`; owner vê "Para sair, transfira a propriedade antes." Convites (Etapa 2) continuam. Link "Ver atividade" (owner/admin) |
| `/familia/atividade` | `PageHeader` "Atividade da família" + "Alterações, exclusões, pagamentos e mudanças na família. A criação de lançamentos não aparece aqui." `FiltersPanel`: grupo, de/até. `ResponsiveList`: data e hora, quem, o quê, detalhe, link ao recurso. Paginação. Vazio: "Nenhuma atividade registrada". Member → `notFound()` |
| `/convite/[token]` | Acrescenta "Agora não" (`secondary`) ao lado de "Aceitar convite": volta a `/inicio` (com família) ou `/onboarding`, **sem persistir** recusa (o convite expira em 7 dias ou é revogado por quem convidou) |

`src/config/navigation.ts`: novos itens **Relatórios** (`/relatorios`, `ChartColumnIcon`, `mobile: "more"`) e **Notificações** (`/notificacoes`, `BellIcon`, `mobile: "more"`), na ordem da spec §9.
A "atividade recente da família" não volta ao dashboard (ADR-0020 §5): fica em `/familia/atividade`.

### 3.5 Dependências novas

Nenhuma. Atualização de dependências atrasadas só em A-ds.

## 4. Fluxos (resumo)

- **Relatório:** URL → `reportFiltersSchema` → `resolveReportPeriod` → funções `text` em paralelo → `reports/domain` → RSC → gráficos por props.
- **Notificação:** layout/página → `ensureNotificationsRefreshed()` (idempotente, falha silenciosa) → leitura com RLS → `renderNotification` → clique → `openNotification` → `href` da lista fechada.
- **Remover integrante:** `AlertDialog` → `removeMember` → RPC (papéis, alvo da família, locks) → `status='removed'` + convites revogados + auditoria → na próxima requisição do removido, `requireMembership` → `/onboarding`.

## 5. Entregas e aceite por agente

### 5.1 database
Migrations da §3.1, sem SQL destrutivo. pgTAP 500–560 e `pnpm db:types`.
Aceite: `pnpm db:reset && pnpm db:test` 100% verde do zero (010, 100–210, 300–370, 400–470 inclusive); `pnpm db:lint`; CA-E7-01..16; `account_flows` e `member_expense_totals` com `prosecdef = false`; as cinco funções definer com `search_path=''`.

### 5.2 backend
A-be: interfaces e domínio com testes. B: repositories, services, actions, queries, `memberDisplayName` nos módulos antigos, códigos, `proxy`/`safe-redirect`, integração.
Aceite: CA-E7-30..40; `pnpm lint`, `typecheck`, `test`, `test:integration` verdes; `grep -rnE "parseFloat|toFixed\("` em `src/modules/{reports,notifications,activity}` vazio; `grep -rn "from(\"notifications\").insert\|family_members\").update" src` vazio; nenhum `audit_events` fora de `src/modules/activity`.

### 5.3 design-system
A-ds: atualização de dependências; `HorizontalBarChart`, `LazyHorizontalBarChart`, testes RTL e `docs/design-system.md`.
Aceite: CA-E7-70..72.

### 5.4 frontend
Telas da §3.4, sino, navegação, E2E (`relatorios`, `notificacoes`, `familia`, `atividade`; desktop e mobile).
Aceite: CA-E7-50..63; RTL do `ReportPeriodFilter`, do `MemberActionsMenu` (só as ações permitidas aparecem) e da lista de notificações (não lida anunciada); nenhuma aritmética de dinheiro em componente (`grep` de CA-E4-37 estendido a `src/modules/{reports,notifications,activity,family}/components` e `src/app/(app)/{relatorios,notificacoes,familia}`).

## 6. Integração (Fase C)

Ordem: `pnpm install` → `pnpm db:reset` → `pnpm db:types` (sem diff) → `pnpm check` → `pnpm build` (o chunk do Recharts só em `/inicio` e `/relatorios/**`) → `pnpm db:test` → `pnpm test:integration` → `pnpm test:e2e` → `pnpm outdated`/`audit` → `node ~/.claude/factory/security/gate.mjs "<projeto>"` → revisão (reviewer + security; mudança `structural`: cinco RPCs `security definer` sobre papéis e vínculos, tabela nova com RLS).
Etapa 7 concluída = CA-E7-* verdes + regra de conclusão. O architect atualiza `data-model.md` §4.8, §5.9 e o catálogo, marca no roadmap o cenário B da spec §12 (relatório por categoria) e o cenário E (membros) como completos.

## 7. Bloqueadores e riscos

| Item | Impacto | Mitigação |
|---|---|---|
| Etapas 4, 5 e 6 não implementadas | relatórios e notificações dependem delas | pré-condição §1 |
| Docker Desktop rodando | sem `db:test`, integração e E2E | bloqueante |
| `refresh_notifications` em toda carga do layout | latência | idempotente, sem parâmetros, teto de 100, índices; `React.cache`; medir na Etapa 9 |
| Notificação é instantâneo (valor mudou depois) | texto desatualizado | data visível; o recurso aberto mostra o estado atual; limpeza de `bill_*` resolvidos |
| "Convite recebido" ausente | divergência da spec §7.14 | ADR-0029 §5; volta com e-mail (Etapa 9) |
| Série de ex-integrante deixa de gerar ocorrências | compromisso futuro some | Etapa 5 já mostra "Precisa de atenção" com o próximo passo; ADR-0030 §4 |
| Owner sozinho não pode sair | usuário preso a uma família | excluir família segue fora (matriz); documentado na tela |
| SEC-4 e SEC-10 | trilha sem IP e sem eventos de senha | Etapa 9 |
| Spec truncada na §15 | — | segue aberto |

## 8. Pedido de mudança

Formato no handoff: `CR-<agente>-<n>: <arquivo/interface> — <mudança> — <motivo> — <impacto em quem>`.
O orchestrator decide. Se uma interface da §3 muda, este documento sobe de versão (1.1) antes da implementação.
