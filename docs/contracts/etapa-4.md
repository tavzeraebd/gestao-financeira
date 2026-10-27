# Contrato de execução — Etapa 4 (dashboard e experiência financeira básica)

Versão 1.0 (2026-10-24) · Dono: orchestrator/architect · Alteração só por pedido ao orchestrator (§8).
Referências: spec §7.2, §7.11 (mesmos serviços de cálculo), §9, §11 Etapa 4, §12 A/B/C/F/G, §14; mockup tela 2 (desktop) e tela 10 (celular);
`financial-definitions.md` v1.1 (D3, D4, D5, D8, D16–D18, D20; R1–R4, R9–R11); `permissions.md` (linha "Relatórios / Dashboard"); `acceptance-criteria.md` (CA-E4-*);
`threat-model.md` §3.9 (AB-80..85); ADRs 0003, 0004, 0015, 0018, 0019, **0020**, **0021**; contrato `etapa-3.md` v1.0 (regras gerais e interfaces herdadas).

## 0. Regras do contrato

1. Valem as regras 1–7 do `etapa-3.md` §0: um arquivo, um dono; interfaces congeladas; dinheiro nunca em ponto flutuante; "hoje" = `today()`/`private.today()`; entrega = arquivos + checagens + handoff.
2. **Uma fórmula, um lugar**: soma no SQL (`period_summary`, `account_balances`, `monthly_cash_flow`, `category_totals`); composição (variação, agrupamento, percentual, período) em `src/modules/reports/domain/*.ts`. Nenhum componente soma, subtrai ou calcula percentual: recebe `Cents`, `number` e strings prontas.
3. **Sem cache de dados de família** (ADR-0015): nada de `"use cache"`, `unstable_cache`, `revalidateTag`, cache de `fetch`, `localStorage`/`sessionStorage` com dados, SWR ou react-query. Os gráficos recebem dados só por props do RSC (ADR-0021).
4. `recharts` só é importado em `src/components/charts/*` (`"use client"`), e as telas usam `charts/lazy.tsx` (`next/dynamic`, `ssr: false`).
5. Fora do escopo: criar compromisso, recorrência, orçamento ou meta; relatórios (Etapa 7); atividade recente (Etapa 7, ADR-0020 §5); notificações; exportação; sparkline do saldo no celular (o mockup tela 10 mostra só um ícone de tendência: entra o ícone `TrendingUpIcon`, decorativo, sem série de dados). Não criar rota, tabela, coluna ou componente para eles.
6. Sem números fictícios: sem dados, o bloco mostra estado vazio com explicação e ação. Gráfico nunca é desenhado com zeros inventados para "preencher".

## 1. Fases e sequência

Pré-condição: Etapa 3 integrada e verificada (CA-E3-* verdes, gate `PASSA`).

| Fase | Quem | O quê | Pode começar quando |
|---|---|---|---|
| A-db | database | migration e pgTAP da §3.1; `pnpm db:types` assim que as funções existirem | pré-condição |
| A-ds | design-system | `pnpm add recharts@latest` (**único** momento em que `package.json`/`pnpm-lock.yaml` mudam); `pnpm outdated` e atualização do que estiver atrás (política de dependências); `pnpm audit`. Depois, os componentes de `src/components/charts/**` da §3.3 (dependem só de `lib/money`, que já existe, e de `categories/constants`) | pré-condição |
| A-be | backend | **interfaces publicadas primeiro**: `reports/{types,schemas,definitions,constants}.ts`, assinaturas de `reports/queries.ts`, acréscimos a `lib/dates` e `lib/format` (completos e testados) e `reports/domain/*` (completo e testado, é TS puro) | pré-condição |
| B | backend + frontend (+ DS termina testes e doc; database termina pgTAP) | backend: `reports/repository.ts`, `queries.ts`, `listRecentTransactions` e integração. Frontend: `/inicio` e componentes de `reports/components` (compila contra as interfaces de A-be e os gráficos de A-ds) | A-ds e A-be concluídas (backend: também `database.ts` de A-db) |
| C | orchestrator (+ QA, reviewer, security) | integração (§6), pedidos de mudança; architect atualiza `data-model.md` §2 (funções novas) | todos de B entregues |

Regras: na B, `package.json` fica congelado (dependência nova = pedido §8). `src/types/database.ts` é regenerado pelo database, e o backend é avisado.

## 2. Mapa de donos (acréscimos aos mapas dos contratos E1–2 v1.1 e E3 v1.0, que continuam valendo)

| Caminho | Dono |
|---|---|
| `supabase/migrations/2026*_etapa4_*.sql`, `supabase/tests/database/2[0-9]0_*.test.sql`, `src/types/database.ts` | database |
| `src/modules/reports/**` **exceto** `components/` (`types.ts`, `schemas.ts`, `constants.ts`, `definitions.ts`, `queries.ts`, `repository.ts`, `domain/**`, `*.test.ts`) | backend |
| `src/lib/dates/**` (acréscimos), `src/lib/format/**` (novo) | backend |
| `src/modules/transactions/{queries,repository}.ts` (acréscimo de `listRecentTransactions`) | backend |
| `tests/integration/dashboard.test.ts` | backend |
| `src/components/charts/**` e testes; `docs/design-system.md`; `package.json`/`pnpm-lock.yaml` (só A-ds) | design-system |
| `src/app/(app)/inicio/**` (`page.tsx`, `loading.tsx`), `src/modules/reports/components/**` | frontend |
| `e2e/inicio.spec.ts`, `e2e/helpers/**` | frontend |
| `docs/**` (exceto `docs/design-system.md`), `.claude/**` | orchestrator/architect |

## 3. Interfaces

### 3.1 Database → backend

Uma migration `2026*_etapa4_dashboard_functions.sql` (timestamp posterior a `20261024100500`). Nenhuma tabela, coluna, índice, trigger ou policy nova. Convenções do `data-model.md` §1.

**Funções (`public`, `language plpgsql`, `stable`, `security invoker`, `set search_path = ''`; `revoke execute ... from public, anon`; `grant execute ... to authenticated`)**

| Função | Contrato |
|---|---|
| `monthly_cash_flow(p_from date, p_to date) returns table (month date, income text, expense text, result text)` | Meses civis de `date_trunc('month', p_from)` a `date_trunc('month', p_to)`, **todos** presentes (`generate_series`; mês sem movimento = `0.00`), em ordem crescente. Cada linha = D4 do mês **inteiro** (`[1º dia, último dia]`): só `paid`, não excluídos, `type in ('income','expense')`, estorno com sinal invertido, transferência fora. `p_from`/`p_to` nulos, `p_from > p_to` ou mais de 24 meses → `INVALID_INPUT` (`P0001`). Montantes `round(x, 2)::text`, acumuladores `numeric` sem typmod (como `period_summary`) |
| `category_totals(p_from date, p_to date, p_type text) returns table (category_id uuid, amount text)` | D4 por categoria no intervalo fechado, **subcategoria somada à categoria-pai** (`coalesce(c.parent_id, c.id)`). Mesmos filtros de `monthly_cash_flow`, com `t.type = p_type`. Inclui categorias arquivadas. Omite total `= 0`. Ordem: valor decrescente, depois `category_id`. `p_type not in ('income','expense')`, datas nulas ou `p_from > p_to` → `INVALID_INPUT`. O valor pode ser negativo (estorno maior que o gasto no período, D5) |

Nas duas funções, `where t.family_id = (select private.current_family_id())`, além da RLS (índice `transactions_family_date_idx`). Sem parâmetro de família. As duas devolvem `text`, nunca `numeric`/`number`.

**pgTAP** (`supabase/tests/database/`):
- `200_dashboard_functions`: `prosecdef = false`, `proconfig` com `search_path=""`, `anon` sem EXECUTE, `INVALID_INPUT` nos casos acima, isolamento (B e C não veem nada de A, nem com intervalo amplo).
- `210_dashboard_regression`: R9, R10 (pelo `period_summary`), R11; propriedade Σ meses = `period_summary` do intervalo; dois lançamentos no teto (99.999.999,99) somados sem erro e exatos.

O `010_security_baseline` precisa continuar verde. Cobertura: CA-E4-01..07.

### 3.2 Backend → frontend e design-system

**`src/lib/dates`** (acréscimos; TS puro): `addMonths(d: ISODate, n: number): ISODate` (dia âncora maior que o mês → último dia, como o Postgres) · `diffInDays(a: ISODate, b: ISODate): number` (`b − a`) · `formatMonthBR(d: ISODate, style: "short" | "long"): string` (`"out."` / `"outubro de 2026"`).
**`src/lib/format/percent.ts`** (novo; TS puro, usável no cliente): `formatPercent(value: number, opts?: { signDisplay?: "auto" | "exceptZero"; maximumFractionDigits?: number }): string`. `value` em pontos percentuais (`12.5` → `"12,5%"`; padrão 1 casa). Só exibição, nunca persistido.

**`src/modules/reports/schemas.ts`**: `dashboardFiltersSchema` lê os parâmetros de URL, **tolerante**: valor inválido vira o padrão, nunca erro. `periodo` (`mes_atual` (padrão) `| mes_anterior | personalizado`), `de`, `ate` (ISODate). Saída: `DashboardFilters`.

**`src/modules/reports/domain/`** (TS puro, testes obrigatórios; ids das definições em `describe`):

| Arquivo · export | Contrato |
|---|---|
| `period.ts` · `resolvePeriod(f: DashboardFilters, today: ISODate): DashboardPeriod` | D20. `mes_atual` = mês de `today`; `mes_anterior` = mês civil anterior. `personalizado` exige `de` e `ate`, `de ≤ ate`, `de ≥ 2000-01-01`, `ate ≤ endOfMonth(today)` e até 366 dias; senão, cai em `mes_atual` (`preset` volta a `mes_atual`) |
| `period.ts` · `previousPeriod(from, to): { from; to }` | D4: período que é um mês civil inteiro → mês civil anterior; senão, os N dias imediatamente anteriores |
| `period.ts` · `cashFlowWindow(to: ISODate): { from: ISODate; to: ISODate }` | D17: 6 meses civis terminando no mês de `to` (`from` = 1º dia, 5 meses antes; `to` = último dia do mês de `to`) |
| `comparison.ts` · `compare(current: Cents, previous: Cents): Comparison` | `delta = current − previous`; `percent = delta / |previous| × 100` (`percentOf`); `previous = 0` → `null` |
| `breakdown.ts` · `buildCategoryBreakdown(rows: { categoryId: string; amount: Cents }[], categories: ReadonlyMap<string, CategoryView>, total: Cents): CategoryBreakdown` | D16: fatias = categorias com valor > 0 em ordem decrescente; até 6 fatias (com 7 ou mais, as 5 maiores + "Outras categorias" com a soma das demais, `categoryId: null`, cor `chart-6`, ícone `null`); `percent` = valor / Σ positivos × 100; `negative` = categorias com valor < 0; `rows` = todas (para a tabela); categoria ausente do mapa → "Categoria removida" |

**`src/modules/reports/types.ts`**

| Tipo | Forma |
|---|---|
| `PeriodPreset` | `"mes_atual" \| "mes_anterior" \| "personalizado"` |
| `DashboardFilters` | `{ periodo: PeriodPreset; de?: ISODate; ate?: ISODate }` |
| `DashboardPeriod` | `{ preset: PeriodPreset; from; to; previousFrom; previousTo: ISODate; label: string; previousLabel: string }`. `label`: `"outubro de 2026"` para mês inteiro, senão `"01/10/2026 a 15/10/2026"` |
| `Comparison` | `{ current: Cents; previous: Cents; delta: Cents; percent: number \| null }` |
| `CategorySlice` | `{ key: string; categoryId: string \| null; name: string; color: CategoryColor; icon: CategoryIconName \| null; amount: Cents; percent: number; archived: boolean }` (`percent` só nas fatias; `0` em `negative`) |
| `CategoryBreakdown` | `{ total: Cents; slices: CategorySlice[]; negative: CategorySlice[]; rows: CategorySlice[] }`. `total` = despesas(P) (D4) |
| `CashFlowMonth` | `{ month: ISODate; label: string; longLabel: string; income: Cents; expense: Cents; result: Cents }` |
| `DashboardState` | `"no_accounts"` (nenhuma conta ativa) `\| "no_transactions"` (nenhum lançamento `paid` não excluído, em toda a história) `\| "ready"` |
| `Dashboard` | `{ state; period: DashboardPeriod; asOf: ISODate; previousAsOf: ISODate; consolidated: Comparison; openCardDebt: Cents; hasCreditCards: boolean; income: Comparison; expense: Comparison; result: Comparison; expenseByCategory: CategoryBreakdown; cashFlow: { from: ISODate; to: ISODate; months: CashFlowMonth[] }; recentTransactions: TransactionListItem[] }` |

**`src/modules/reports/definitions.ts`**: `INDICATOR_DEFINITIONS: Record<IndicatorId, { title: string; description: string; ref: string }>`, com `IndicatorId = "consolidatedBalance" | "openCardDebt" | "income" | "expense" | "result" | "expenseByCategory" | "cashFlow" | "recentTransactions" | "upcomingBills" | "goals"`. Textos pt-BR curtos que repetem a definição (`ref` = `"D3"`, `"D4"` etc. de `financial-definitions.md`). Exemplo para `consolidatedBalance`: "Soma dos saldos das contas, sem cartões de crédito. A variação compara com o saldo no fim do período anterior e considera só lançamentos efetivados."

**`src/modules/reports/queries.ts`** (`server-only`; montantes `Cents`; datas `ISODate`):

| Função | Comportamento |
|---|---|
| `getDashboard(filters: DashboardFilters): Promise<Dashboard>` | `requireMembership()`; `period = resolvePeriod(filters, today())`; `asOf = min(period.to, today)`, `previousAsOf = period.previousTo`. Em paralelo: contas (tipos), `account_balances(asOf)`, `account_balances(previousAsOf)`, `period_summary` atual e anterior, `category_totals(from, to, 'expense')`, `monthly_cash_flow(cashFlowWindow(to))`, `listCategories({ includeArchived: true })`, `listRecentTransactions(period, 5)`, existência de algum `paid`. `consolidated` = D3 (`consolidatedBalance` de `accounts/domain/balances.ts`) nas duas datas; `openCardDebt` = D8 hoje. Com `state = "no_accounts"`, as consultas de movimento não rodam. Agregado acima do inteiro seguro (`RangeError`) → `AppError("INTERNAL_ERROR")`, nunca número errado |

**`src/modules/transactions/queries.ts`** (acréscimo): `listRecentTransactions(period: { from: ISODate; to: ISODate }, limit: number): Promise<TransactionListItem[]>`: efetivados não excluídos com data no período, ordem `transaction_date desc, created_at desc, id`; `limit` entre 1 e 20. Reusa `toListItem`.

Sem códigos de erro novos (`INVALID_INPUT` já mapeia para `VALIDATION_ERROR`). `proxy`/`safe-redirect`: sem rotas novas.

### 3.3 Design-system → frontend

**A-ds:** `pnpm add recharts@latest`. Conferir que o `package.json` ganhou só `recharts` (e `react-is` apenas se o pnpm exigir como peer), que o lockfile mudou só o esperado e que o `pnpm audit` está limpo. `pnpm outdated` antes e depois: atualizar o que estiver atrás (inclusive major), corrigindo o que quebrar; exceção só no `.depsignore`, decidida pelo usuário. **Não** rodar `shadcn add chart` (ADR-0021).

**`src/components/charts/`** — tokens apenas, nenhum hex; foco visível; pt-BR. Nenhum arquivo daqui importa `server-only`, `repository`, `service` ou `@/lib/supabase/*`.

| Arquivo · export | Contrato |
|---|---|
| `colors.ts` · `type ChartColor = CategoryColor \| "chart-income" \| "chart-expense"`, `chartColorVar(c: ChartColor): string` | `"chart-3"` → `"var(--color-chart-3)"`. Única forma de dar cor a um gráfico |
| `chart-card.tsx` · `ChartCard` (`"use client"`) | `{ title: string; period: string; info?: ReactNode; isEmpty: boolean; empty: { title: string; description?: string; action?: ReactNode }; table: { caption: string; columns: { id: string; header: string; align?: "start" \| "end" }[]; rows: { key: string; cells: string[] }[] }; legend?: ReactNode; children: ReactNode }`. `Card` com título (`h2`) e período visíveis; `info` ao lado do título (slot do "Como calculamos"). Botão "Ver tabela"/"Ver gráfico" (`aria-expanded`, `aria-controls`) que troca o gráfico pela `Table` com `caption`. Vazio → `EmptyState` compacto no lugar do gráfico, sem botão de tabela |
| `chart-legend.tsx` · `ChartLegend` (sem `"use client"`) | `{ items: { key: string; label: string; color: ChartColor; value?: string }[]; "aria-label"?: string }`. Lista com marcador de cor (decorativo), nome e valor em texto; quebra no celular |
| `donut-chart.tsx` · `DonutChart` (`"use client"`, `export default`) | `{ data: { key: string; label: string; value: Cents; color: ChartColor }[]; centerLabel: string; centerValue: string; ariaLabel: string }`. `PieChart` em rosca; separador entre fatias com `var(--color-card)`; tooltip em JSX com `formatBRL`; `role="img"` + `aria-label` no contêiner; responsivo (altura fixa e largura fluida) |
| `cash-flow-bar-chart.tsx` · `CashFlowBarChart` (`"use client"`, `export default`) | `{ data: { key: string; label: string; income: Cents; expense: Cents }[]; ariaLabel: string }`. Barras agrupadas Receitas (`chart-income`) e Despesas (`chart-expense`), eixo Y em BRL compacto ("R$ 1,2 mil"), eixo X com `label`, tooltip com os dois valores em `formatBRL`, legenda "Receitas"/"Despesas" (`ChartLegend`) |
| `lazy.tsx` · `LazyDonutChart`, `LazyCashFlowBarChart` (`"use client"`) | `dynamic(() => import("./donut-chart"), { ssr: false, loading: () => <Skeleton className="h-56 w-full" /> })` e equivalente. **Única** porta de entrada das telas |
| `charts.test.tsx` | RTL (com `ResizeObserver` simulado) |

Regras comuns: `isAnimationActive={false}` quando `prefers-reduced-motion: reduce`; valores do SVG sempre convertidos de `Cents` para reais só na formatação (`formatBRL`); nenhum `dangerouslySetInnerHTML`. **Tokens novos: nenhum.** `docs/design-system.md` ganha a seção "Gráficos" (componentes, padrão de acessibilidade, carga sob demanda) e as medições de `chart-income`, `chart-expense` e `chart-1..6` sobre `card` como componente gráfico (mínimo 3:1, dois temas). Abaixo de 3:1, a exceção vai documentada com a mitigação (legenda e tabela).

### 3.4 Rotas e telas (frontend)

`/inicio` (`src/app/(app)/inicio/page.tsx`, Server Component; `loading.tsx` com `Skeleton` dos blocos; `error.tsx` do grupo). Lê `searchParams` → `dashboardFiltersSchema` → `getDashboard`. Fidelidade ao mockup tela 2 (desktop) e tela 10 (celular).

| Bloco | Conteúdo e estados |
|---|---|
| Cabeçalho | `PageHeader` "Olá, {primeiro nome}!" + "Aqui está um resumo das finanças da sua família."; à direita, `DashboardPeriodFilter` (client): `SegmentedControl` "Este mês \| Mês anterior \| Personalizado"; em Personalizado, dois `DatePicker` (De/Até, `max` = fim do mês atual) e "Aplicar". Usa `router.replace` com `?periodo=&de=&ate=`. Rótulo do período (`period.label`) visível |
| `state = "no_accounts"` | Mantém o `EmptyState` atual da Etapa 3 (owner/admin → `/contas/nova`; member: orientação). Nenhum número |
| Saldo total | `Card`: "Saldo total" + `IndicatorInfo` (`Popover` "Como calculamos", texto de `INDICATOR_DEFINITIONS`); `Money` grande; linha de variação: ícone (`TrendingUp`/`TrendingDown`/`Minus`, decorativo) + texto "+12,0% em relação a 30/09/2026" (sinal em texto) ou "Sem base de comparação". Com cartão: "Faturas em aberto R$ X" (D8) |
| Receitas, Despesas, Resultado | três indicadores (no celular, Receitas e Despesas lado a lado, como na tela 10) com `Money`, variação contra `previousLabel` e o mesmo padrão de texto; Resultado com `direction` pelo sinal |
| Categorias de gastos | `ChartCard` "Categorias de gastos" + período; `LazyDonutChart` com `centerLabel` "Total" e `centerValue` = `formatBRL(total)`; `ChartLegend` com nome e percentual (como no mockup); tabela: Categoria, Valor, % (as negativas entram na tabela com a nota "Estornos maiores que os gastos no período"). Vazio: "Sem despesas em {período}" + "Nova transação" |
| Fluxo de caixa mensal | `ChartCard` "Fluxo de caixa mensal" + "{mês inicial} a {mês final}"; `LazyCashFlowBarChart`; tabela: Mês, Receitas, Despesas, Resultado. Vazio (todos os meses com 0): "Sem movimentações nos últimos 6 meses" |
| Próximos vencimentos | `Card` com estado vazio fixo: "Os vencimentos de contas a pagar e receber aparecem aqui quando esse recurso estiver disponível." Sem número e sem ação (a Etapa 5 liga o bloco) |
| Últimas transações | lista compacta (`CategoryIcon`, descrição, data, `Money` com `direction`), até 5, cada uma com link a `/transacoes/[id]`; "Ver todas" → `/transacoes?de={from}&ate={to}`. Vazio: "Nenhum lançamento em {período}" + "Nova transação" |
| Metas | `Card` com estado vazio fixo: "As metas da família aparecem aqui quando esse recurso estiver disponível." (Etapa 6) |
| `state = "no_transactions"` | Saldo total real (saldos iniciais); os demais indicadores mostram R$ 0,00 **só** onde a definição dá zero (receitas e despesas do período), sem gráfico desenhado; banner `EmptyState` "Registre seu primeiro lançamento" → `/transacoes/nova` acima dos gráficos |

Grade: ≥ `lg`, 3 colunas (linha 1: Saldo total, Receitas/Despesas/Resultado, Categorias; linha 2: Fluxo de caixa em 2 colunas, Próximos vencimentos; linha 3: Últimas transações em 2 colunas, Metas). < `md`, uma coluna na ordem da tela 10: Saldo total, Receitas+Despesas, Resultado, Metas, Próximos vencimentos, Categorias, Fluxo de caixa, Últimas transações. Sem rolagem horizontal em 360px.
Componentes de módulo (frontend, em `src/modules/reports/components/`): `dashboard-period-filter.tsx`, `indicator-info.tsx`, `balance-card.tsx`, `summary-indicators.tsx`, `expense-by-category-card.tsx`, `cash-flow-card.tsx`, `recent-transactions-card.tsx`, `upcoming-bills-card.tsx`, `goals-card.tsx`. Eles só formatam (`Money`, `formatBRL`, `formatPercent`, `formatDateBR`) o que vem de `Dashboard`.

### 3.5 Dependências novas

| Pacote | Quem instala | Quando |
|---|---|---|
| `recharts` (última estável) | design-system | A-ds |
| atualizações de dependências existentes que estiverem atrás | design-system | A-ds |
| qualquer outra | proibida; pedido §8 | — |

## 4. Fluxo de dados

URL (`?periodo=&de=&ate=`) → `dashboardFiltersSchema` (tolerante) → `getDashboard` → `resolvePeriod` (domínio) → repository (RPCs `text`, em paralelo) → `fromDbNumeric` → domínio (`compare`, `buildCategoryBreakdown`, D3) → `Dashboard` (`Cents`) → RSC → props serializáveis → `LazyDonutChart`/`LazyCashFlowBarChart` (cliente, só formatação).

## 5. Entregas e aceite por agente

### 5.1 database
Migration da §3.1 (só funções; sem SQL destrutivo); pgTAP `200`/`210`; `pnpm db:types`.
Aceite: `pnpm db:reset && pnpm db:test` 100% verde; `pnpm db:lint` sem erro; CA-E4-01..07.

### 5.2 backend
A-be: interfaces, `lib/dates`, `lib/format` e `reports/domain` completos com testes. B: `reports/repository.ts`, `queries.ts`, `listRecentTransactions`, `tests/integration/dashboard.test.ts`.
Aceite: CA-E4-30..39; `pnpm lint`, `typecheck`, `test`, `test:integration` verdes; `grep -rnE "parseFloat|toFixed\("` em `src/modules/reports` e `src/lib/format` vazio; arquivos de servidor com `import "server-only"`.

### 5.3 design-system
A-ds: instalação e conferências da §3.3. A/B: `src/components/charts/**` + testes + `docs/design-system.md`.
Aceite: CA-E4-70..74; `grep -rEn "#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(" src --include=*.tsx` vazio; `grep -rn "from \"recharts\"" src` só em `src/components/charts/`; `grep -rn dangerouslySetInnerHTML src` vazio.

### 5.4 frontend
`/inicio` da §3.4, componentes de `reports/components`, `e2e/inicio.spec.ts` (desktop e mobile).
Aceite: CA-E4-50..62; RTL do `DashboardPeriodFilter` (troca de preset, personalizado inválido não navega, URL); nenhum import de `recharts` fora de `charts/lazy.tsx` (via `@/components/charts/lazy`); nenhuma aritmética de dinheiro em componente (`grep -rnE "sumCents|addCents|subCents|percentOf|negCents" src/modules/reports/components src/app/\(app\)/inicio` vazio).

## 6. Integração (Fase C)

Ordem: `pnpm install` → `pnpm db:reset` → `pnpm db:types` (sem diff) → `pnpm check` → `pnpm build` (conferir no relatório do build que o chunk do Recharts não entra nas rotas que não são `/inicio`) → `pnpm db:test` → `pnpm test:integration` → `pnpm test:e2e` → `pnpm outdated` vazio e `pnpm audit` limpo (ou exceção) → `node ~/.claude/factory/security/gate.mjs "<projeto>"` → revisão (reviewer + security; mudança `standard`: funções `invoker`, sem tabela nova, dependência nova).
Etapa 4 concluída = CA-E4-* verdes + regra de conclusão do `acceptance-criteria.md`. O architect atualiza o `data-model.md` §2 (funções da Etapa 4) e marca o cenário A da spec §12 como completo.

## 7. Bloqueadores e riscos

| Item | Impacto | Mitigação |
|---|---|---|
| Docker Desktop rodando | sem `db:test`, integração e E2E | bloqueante (como na Etapa 3) |
| Recharts estável incompatível com React 19.3/Next 16.4 ou com jsdom | gráficos não montam ou testes quebram | DS reporta em A-ds; pedido §8; plano B (ADR-0021): SVG próprio sem pacote novo |
| `period_summary` sem filtro por `current_family_id()` (varre por RLS) | latência com muitas famílias | aceito; volume familiar; medir na Etapa 9 (fora do escopo) |
| Variação do saldo com conta criada no período (saldo inicial conta nas duas datas) | variação mostra só movimentações | decisão documentada (D3, ADR-0020 §4); texto do "Como calculamos" explica |
| Spec truncada na §15 | regras do autor podem faltar | segue aberto (roadmap) |
| `data-model.md` ainda sem a atualização da Fase C da Etapa 3 (cores, RPCs removidas) | leitor pode seguir o texto antigo | os contratos prevalecem (banner no `data-model.md`); architect atualiza na Fase C desta etapa |

## 8. Pedido de mudança

Formato no handoff: `CR-<agente>-<n>: <arquivo/interface> — <mudança> — <motivo> — <impacto em quem>`.
O orchestrator decide. Se uma interface da §3 muda, este documento sobe de versão (1.1) antes da implementação.
