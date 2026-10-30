import "server-only";
import {
  addDays,
  addMonths,
  startOfMonth,
  today,
  type ISODate,
} from "@/lib/dates";
import { asCents, fromDbNumeric, sumCents, type Cents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { toGoalIcon, type GoalStatus } from "@/modules/goals/constants";
import { goalProgress } from "@/modules/goals/domain/progress";
import {
  rpcGoalSummary,
  selectActiveMembers,
  selectGoals,
} from "@/modules/goals/repository";
import { MAX_PROGRESS_MONTHS } from "@/modules/budgets/constants";
import { rpcBudgetProgress, selectBudgets } from "@/modules/budgets/repository";
import {
  toCategoryColor,
  toCategoryIcon,
} from "@/modules/categories/constants";
import {
  consolidatedBalance,
  openCardDebt,
} from "@/modules/accounts/domain/balances";
import {
  selectAccounts,
  type AccountBase,
} from "@/modules/accounts/repository";
import { UPCOMING_LIMIT } from "@/modules/bills/constants";
import { listUpcomingBills } from "@/modules/bills/queries";
import { listCategories } from "@/modules/categories/queries";
import { ensureRecurrencesMaterialized } from "@/modules/recurrences/materialize";
import { listRecentTransactions } from "@/modules/transactions/queries";
import { rpcPeriodSummary } from "@/modules/transactions/repository";
import { requireMembership } from "@/server/auth";
import { AppError } from "@/server/errors";
import {
  COMMITMENT_HORIZON_MONTHS,
  DASHBOARD_GOALS_LIMIT,
  RECENT_TRANSACTIONS_LIMIT,
} from "./constants";
import { buildCategoryBreakdown } from "./domain/breakdown";
import { buildCashFlowMonths } from "./domain/cash-flow";
import {
  buildAccountRows,
  buildCommitmentDetails,
  categoryNames,
} from "./domain/commitment-details";
import { openPurchaseEntries, type CardTerms } from "./domain/card-invoices";
import {
  buildCommitments,
  entriesOfMonth,
  totalsByCategory,
} from "./domain/commitments";
import { buildProjectedBalance } from "./domain/projected-balance";
import { compare } from "./domain/comparison";
import { cashFlowWindow, resolvePeriod } from "./domain/period";
import { resolveReportPeriod } from "./domain/report-period";
import {
  buildAccountReport,
  buildBudgetReportMonths,
  buildCategoryReportRows,
  buildGoalReportRows,
  buildMemberReportRows,
} from "./domain/report-rows";
import {
  rpcAccountFlows,
  rpcBalancesAsOf,
  rpcCategoryTotals,
  rpcMemberExpenseTotals,
  rpcMonthlyCashFlow,
  selectActiveCommitmentSeries,
  selectCardPurchases,
  selectHasPaidTransaction,
  selectPendingCommitments,
} from "./repository";
import type {
  AccountReport,
  BalanceSnapshot,
  BudgetReport,
  CategoryReport,
  CategoryReportFilters,
  CommitmentDashboard,
  Dashboard,
  DashboardFilters,
  DashboardGoal,
  GoalReport,
  MemberReport,
  ReportFilters,
  ReportOverview,
} from "./types";

const ZERO = asCents(0);

function withBalances(
  accounts: readonly AccountBase[],
  balances: ReadonlyMap<string, Cents>,
) {
  return accounts.map((a) => ({
    type: a.type,
    balance: balances.get(a.id) ?? ZERO,
  }));
}

/** Saldo consolidado, variação contra `previousAsOf` e faturas em aberto: a mesma regra (D3/D8) para os dois painéis. */
function buildBalanceSnapshot(
  accounts: readonly AccountBase[],
  balances: ReadonlyMap<string, Cents>,
  previousBalances: ReadonlyMap<string, Cents>,
  previousAsOf: ISODate,
): BalanceSnapshot {
  return {
    previousAsOf,
    consolidated: compare(
      consolidatedBalance(withBalances(accounts, balances)),
      consolidatedBalance(withBalances(accounts, previousBalances)),
    ),
    openCardDebt: openCardDebt(withBalances(accounts, balances)),
    hasCreditCards: accounts.some((a) => a.type === "credit_card"),
  };
}

/** D9: até 3 metas ativas com o acumulado de `goal_summary` (uma chamada). */
async function selectDashboardGoals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  now: ISODate,
): Promise<DashboardGoal[]> {
  const [rows, summaries] = await Promise.all([
    selectGoals(supabase, ["active"]),
    rpcGoalSummary(supabase, now, now),
  ]);
  const saved = new Map(summaries.map((s) => [s.goalId, s.saved]));
  return rows.slice(0, DASHBOARD_GOALS_LIMIT).map((row) => {
    const target = fromDbNumeric(row.target_amount);
    const total = saved.get(row.id) ?? ZERO;
    return {
      id: row.id,
      name: row.name,
      icon: toGoalIcon(row.icon),
      saved: total,
      target,
      percent: goalProgress(target, total).percent,
    };
  });
}

/**
 * Dashboard da Etapa 4 (contrato `etapa-4.md` §3.2). Nenhuma consulta recebe `family_id`:
 * a RLS e as funções `invoker` decidem a família. Agregado acima do inteiro seguro -> `INTERNAL_ERROR`.
 */
export async function getDashboard(
  filters: DashboardFilters,
): Promise<Dashboard> {
  await requireMembership();
  await ensureRecurrencesMaterialized();
  const supabase = await createClient();
  const now = today();
  const period = resolvePeriod(filters, now);
  const asOf: ISODate = period.to < now ? period.to : now;
  const previousAsOf = period.previousTo;
  const window = cashFlowWindow(period.to);

  try {
    const [accounts, balances, previousBalances] = await Promise.all([
      selectAccounts(supabase),
      rpcBalancesAsOf(supabase, asOf),
      rpcBalancesAsOf(supabase, previousAsOf),
    ]);
    const base = {
      period,
      asOf,
      ...buildBalanceSnapshot(
        accounts,
        balances,
        previousBalances,
        previousAsOf,
      ),
    };

    if (!accounts.some((a) => a.isActive)) {
      const zero = compare(ZERO, ZERO);
      return {
        ...base,
        state: "no_accounts",
        income: zero,
        expense: zero,
        result: zero,
        expenseByCategory: buildCategoryBreakdown([], new Map(), ZERO),
        cashFlow: { from: window.from, to: window.to, months: [] },
        recentTransactions: [],
        upcomingBills: [],
        goals: [],
      };
    }

    const [
      summary,
      previousSummary,
      totals,
      cashFlowRows,
      categories,
      recentTransactions,
      hasPaid,
      upcomingBills,
      goals,
    ] = await Promise.all([
      rpcPeriodSummary(supabase, period.from, period.to),
      rpcPeriodSummary(supabase, period.previousFrom, period.previousTo),
      rpcCategoryTotals(supabase, period.from, period.to, "expense"),
      rpcMonthlyCashFlow(supabase, window.from, window.to),
      listCategories({ includeArchived: true }),
      listRecentTransactions(
        { from: period.from, to: period.to },
        RECENT_TRANSACTIONS_LIMIT,
      ),
      selectHasPaidTransaction(supabase),
      listUpcomingBills({ limit: UPCOMING_LIMIT }),
      selectDashboardGoals(supabase, now),
    ]);

    return {
      ...base,
      state: hasPaid ? "ready" : "no_transactions",
      income: compare(summary.income, previousSummary.income),
      expense: compare(summary.expense, previousSummary.expense),
      result: compare(summary.result, previousSummary.result),
      expenseByCategory: buildCategoryBreakdown(
        totals,
        new Map(categories.map((c) => [c.id, c])),
        summary.expense,
      ),
      cashFlow: {
        from: window.from,
        to: window.to,
        months: buildCashFlowMonths(cashFlowRows),
      },
      recentTransactions,
      upcomingBills,
      goals,
    };
  } catch (e) {
    // Agregado acima do inteiro seguro (SEC-18): erro explícito e tratado, nunca número errado.
    if (e instanceof RangeError) {
      throw new AppError("INTERNAL_ERROR", { cause: e });
    }
    throw e;
  }
}

/**
 * /inicio: acompanhamento do comprometimento (somente leitura). Só o gráfico mensal olha a janela de
 * `COMMITMENT_HORIZON_MONTHS` meses à frente; cards, rosca e próximos vencimentos são do mês corrente e saem
 * dos mesmos dados já lidos. Reaproveita as contas em aberto e as séries recorrentes ativas; a agregação
 * mensal é `buildCommitments` (domínio puro). Nenhuma consulta recebe `family_id`: a RLS decide a família.
 */
export async function getCommitmentDashboard(): Promise<CommitmentDashboard> {
  await requireMembership();
  await ensureRecurrencesMaterialized();
  const supabase = await createClient();
  const now = today();
  const firstOfMonth = startOfMonth(now);
  const end = startOfMonth(
    addMonths(firstOfMonth, COMMITMENT_HORIZON_MONTHS + 1),
  );
  const lastOfMonth = addDays(startOfMonth(addMonths(firstOfMonth, 1)), -1);

  return guardAggregates(async () => {
    // Saldo de hoje (só efetivados) contra o fim do mês anterior.
    const previousAsOf = addDays(firstOfMonth, -1);
    const [
      pending,
      series,
      categories,
      upcomingBills,
      accounts,
      balances,
      previousBalances,
    ] = await Promise.all([
      selectPendingCommitments(supabase, end),
      selectActiveCommitmentSeries(supabase),
      listCategories({ includeArchived: true }),
      listUpcomingBills({ limit: UPCOMING_LIMIT }),
      selectAccounts(supabase),
      rpcBalancesAsOf(supabase, now),
      rpcBalancesAsOf(supabase, previousAsOf),
    ]);
    const balance = buildBalanceSnapshot(
      accounts,
      balances,
      previousBalances,
      previousAsOf,
    );
    // D24: cartões com fechamento e vencimento; compra efetivada ainda não quitada conta no vencimento da fatura.
    const cards: CardTerms[] = accounts.flatMap((a) =>
      a.type === "credit_card" &&
      a.isActive &&
      a.statementClosingDay !== null &&
      a.statementDueDay !== null
        ? [
            {
              id: a.id,
              name: a.name,
              closingDay: a.statementClosingDay,
              dueDay: a.statementDueDay,
            },
          ]
        : [],
    );
    const purchases = await selectCardPurchases(
      supabase,
      cards.map((c) => c.id),
      now,
    );
    let cardCommitmentUnderestimated = false;
    const cardPurchases = cards.flatMap((card) => {
      const balance = balances.get(card.id) ?? ZERO;
      if (balance >= 0) return [];
      const result = openPurchaseEntries(
        purchases.filter((p) => p.accountId === card.id),
        card,
        asCents(-balance),
      );
      if (!result.covered) cardCommitmentUnderestimated = true;
      return result.entries;
    });
    const { overview, expenses, entries } = buildCommitments({
      today: now,
      horizon: COMMITMENT_HORIZON_MONTHS,
      pending,
      series,
      cards,
      cardPurchases,
    });
    // Rosca e detalhamento por categoria: só o mês corrente.
    const monthExpenses = entriesOfMonth(expenses, firstOfMonth);
    const total = sumCents(monthExpenses.map((e) => e.amount));
    const projection = buildProjectedBalance(
      balance.consolidated.current,
      overview.months,
    );
    const byCategory = buildCategoryBreakdown(
      totalsByCategory(monthExpenses),
      new Map(categories.map((c) => [c.id, c])),
      total,
    );
    return {
      overview,
      balance,
      projection,
      byCategory,
      details: buildCommitmentDetails({
        today: now,
        currentBalance: balance.consolidated.current,
        openCardDebt: balance.openCardDebt,
        months: overview.months,
        projection,
        entries,
        expenses: monthExpenses,
        slices: byCategory.slices,
        names: categoryNames(categories),
        accounts: buildAccountRows(accounts, balances),
      }),
      upcomingBills: upcomingBills.filter((b) => b.dueDate <= lastOfMonth),
      cardCommitmentUnderestimated,
    };
  });
}

// --- Relatórios (Etapa 7, ADR-0028): só chamam as funções SQL e a composição de `reports/domain`. ---

/** Agregado acima do inteiro seguro (SEC-18): erro explícito e tratado, nunca número errado. */
async function guardAggregates<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof RangeError) {
      throw new AppError("INTERNAL_ERROR", { cause: e });
    }
    throw e;
  }
}

export async function getReportOverview(
  filters: ReportFilters,
): Promise<ReportOverview> {
  await requireMembership();
  const supabase = await createClient();
  const period = resolveReportPeriod(filters, today());
  return guardAggregates(async () => {
    const [summary, previousSummary, cashFlowRows, totals, categories] =
      await Promise.all([
        rpcPeriodSummary(supabase, period.from, period.to),
        rpcPeriodSummary(supabase, period.previousFrom, period.previousTo),
        rpcMonthlyCashFlow(supabase, period.from, period.to),
        rpcCategoryTotals(supabase, period.from, period.to, "expense"),
        listCategories({ includeArchived: true }),
      ]);
    return {
      period,
      summary: {
        income: compare(summary.income, previousSummary.income),
        expense: compare(summary.expense, previousSummary.expense),
        result: compare(summary.result, previousSummary.result),
      },
      cashFlow: buildCashFlowMonths(cashFlowRows),
      expenseByCategory: buildCategoryBreakdown(
        totals,
        new Map(categories.map((c) => [c.id, c])),
        summary.expense,
      ),
    };
  });
}

export async function getCategoryReport(
  filters: CategoryReportFilters,
): Promise<CategoryReport> {
  await requireMembership();
  const supabase = await createClient();
  const period = resolveReportPeriod(filters, today());
  const type = filters.tipo === "receitas" ? "income" : "expense";
  return guardAggregates(async () => {
    const [summary, previousSummary, totals, previousTotals, categories] =
      await Promise.all([
        rpcPeriodSummary(supabase, period.from, period.to),
        rpcPeriodSummary(supabase, period.previousFrom, period.previousTo),
        rpcCategoryTotals(supabase, period.from, period.to, type),
        rpcCategoryTotals(
          supabase,
          period.previousFrom,
          period.previousTo,
          type,
        ),
        listCategories({ includeArchived: true }),
      ]);
    const byId = new Map(categories.map((c) => [c.id, c]));
    const breakdown = buildCategoryBreakdown(
      totals,
      byId,
      type === "income" ? summary.income : summary.expense,
    );
    const previous = buildCategoryBreakdown(
      previousTotals,
      byId,
      type === "income" ? previousSummary.income : previousSummary.expense,
    );
    return {
      period,
      type,
      breakdown,
      rows: buildCategoryReportRows(breakdown, previous),
    };
  });
}

export async function getAccountReport(
  filters: ReportFilters,
): Promise<AccountReport> {
  await requireMembership();
  const supabase = await createClient();
  const period = resolveReportPeriod(filters, today());
  return guardAggregates(async () => {
    const [flows, accounts] = await Promise.all([
      rpcAccountFlows(supabase, period.from, period.to),
      selectAccounts(supabase),
    ]);
    return {
      period,
      ...buildAccountReport(flows, new Map(accounts.map((a) => [a.id, a]))),
    };
  });
}

export async function getMemberReport(
  filters: ReportFilters,
): Promise<MemberReport> {
  await requireMembership();
  const supabase = await createClient();
  const period = resolveReportPeriod(filters, today());
  return guardAggregates(async () => {
    const [totals, summary, members] = await Promise.all([
      rpcMemberExpenseTotals(supabase, period.from, period.to),
      rpcPeriodSummary(supabase, period.from, period.to),
      selectActiveMembers(supabase),
    ]);
    const names = new Map(
      members.map((m) => [m.id, m.profiles?.display_name ?? null]),
    );
    return {
      period,
      total: summary.expense,
      rows: buildMemberReportRows(totals, names, summary.expense),
    };
  });
}

export async function getBudgetReport(
  filters: ReportFilters,
): Promise<BudgetReport> {
  await requireMembership();
  const supabase = await createClient();
  const period = resolveReportPeriod(filters, today());
  const months = period.months.slice(-MAX_PROGRESS_MONTHS);
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return { period, months: [] };
  return guardAggregates(async () => {
    const [rows, progress] = await Promise.all([
      selectBudgets(supabase, false),
      rpcBudgetProgress(supabase, first, last),
    ]);
    const budgets = rows.map((row) => ({
      id: row.id,
      limit: fromDbNumeric(row.amount_limit),
      category: row.category
        ? {
            id: row.category.id,
            name: row.category.name,
            color: toCategoryColor(row.category.color),
            icon: toCategoryIcon(row.category.icon),
            archived: row.category.archived_at !== null,
          }
        : null,
    }));
    return {
      period,
      months: buildBudgetReportMonths(months, budgets, progress),
    };
  });
}

export async function getGoalReport(
  filters: ReportFilters,
): Promise<GoalReport> {
  await requireMembership();
  const supabase = await createClient();
  const period = resolveReportPeriod(filters, today());
  return guardAggregates(async () => {
    const [rows, summaries] = await Promise.all([
      selectGoals(supabase, null),
      rpcGoalSummary(supabase, period.from, period.to),
    ]);
    return {
      period,
      goals: buildGoalReportRows(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          icon: toGoalIcon(r.icon),
          status: r.status as GoalStatus,
          target: fromDbNumeric(r.target_amount),
        })),
        new Map(summaries.map((s) => [s.goalId, s])),
      ),
    };
  });
}
