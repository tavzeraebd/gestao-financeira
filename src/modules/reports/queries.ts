import "server-only";
import { today, type ISODate } from "@/lib/dates";
import { asCents, fromDbNumeric, type Cents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { toGoalIcon } from "@/modules/goals/constants";
import { goalProgress } from "@/modules/goals/domain/progress";
import { rpcGoalSummary, selectGoals } from "@/modules/goals/repository";
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
import { DASHBOARD_GOALS_LIMIT, RECENT_TRANSACTIONS_LIMIT } from "./constants";
import { buildCategoryBreakdown } from "./domain/breakdown";
import { buildCashFlowMonths } from "./domain/cash-flow";
import { compare } from "./domain/comparison";
import { cashFlowWindow, resolvePeriod } from "./domain/period";
import {
  rpcBalancesAsOf,
  rpcCategoryTotals,
  rpcMonthlyCashFlow,
  selectHasPaidTransaction,
} from "./repository";
import type { Dashboard, DashboardFilters, DashboardGoal } from "./types";

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
      previousAsOf,
      consolidated: compare(
        consolidatedBalance(withBalances(accounts, balances)),
        consolidatedBalance(withBalances(accounts, previousBalances)),
      ),
      openCardDebt: openCardDebt(withBalances(accounts, balances)),
      hasCreditCards: accounts.some((a) => a.type === "credit_card"),
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
