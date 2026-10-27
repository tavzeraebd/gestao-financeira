import "server-only";
import { addDays, today } from "@/lib/dates";
import { asCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { selectAccounts } from "@/modules/accounts/repository";
import { PACE_WINDOW_DAYS } from "@/modules/goals/constants";
import { ensureRecurrencesMaterialized } from "@/modules/recurrences/materialize";
import {
  rpcBalancesAsOf,
  rpcCategoryTotals,
  rpcMonthlyCashFlow,
} from "@/modules/reports/repository";
import { requireMembership } from "@/server/auth";
import { PROJECTION_MONTHS_MAX } from "./constants";
import {
  rpcGoalSummary,
  rpcProjectedCashFlow,
  selectActiveGoals,
  selectCategoryRows,
} from "./repository";
import { averageWindow, buildPlanningBaseline } from "./service";
import type { PlanningBaseline } from "./types";

/**
 * Base conhecida do planejamento (D15). Somente leitura: o planejamento não persiste nada (ADR-0027).
 * Materializa as recorrências antes e consulta as funções existentes em paralelo.
 */
export async function getPlanningBaseline(): Promise<PlanningBaseline> {
  await requireMembership();
  await ensureRecurrencesMaterialized();
  const supabase = await createClient();
  const now = today();
  const window = averageWindow(now);

  const [
    accounts,
    balances,
    cashFlow,
    expenseTotals,
    goals,
    goalSummary,
    projection,
  ] = await Promise.all([
    selectAccounts(supabase),
    rpcBalancesAsOf(supabase, now),
    rpcMonthlyCashFlow(supabase, window.from, window.to),
    rpcCategoryTotals(supabase, window.from, window.to, "expense"),
    selectActiveGoals(supabase),
    rpcGoalSummary(supabase, addDays(now, -(PACE_WINDOW_DAYS - 1)), now),
    rpcProjectedCashFlow(supabase, PROJECTION_MONTHS_MAX),
  ]);
  const categories = await selectCategoryRows(
    supabase,
    expenseTotals.map((t) => t.categoryId),
  );

  return buildPlanningBaseline({
    today: now,
    accounts: accounts.map((a) => ({
      type: a.type,
      isActive: a.isActive,
      balance: balances.get(a.id) ?? asCents(0),
    })),
    cashFlow,
    expenseTotals,
    categories,
    goals,
    goalSummary,
    projection,
  });
}
