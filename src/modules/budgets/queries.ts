import "server-only";
import {
  addMonths,
  formatMonthBR,
  startOfMonth,
  type ISODate,
} from "@/lib/dates";
import { fromDbNumeric } from "@/lib/money";
import { dbDate } from "@/lib/supabase/db-values";
import { createClient } from "@/lib/supabase/server";
import { HISTORY_MONTHS } from "@/modules/budgets/constants";
import { budgetProgress } from "@/modules/budgets/domain/progress";
import {
  rpcBudgetProgress,
  selectBudgetById,
  selectBudgets,
  type BudgetProgressRow,
} from "@/modules/budgets/repository";
import type {
  BudgetEditData,
  BudgetHistoryEntry,
  BudgetsOverview,
  BudgetView,
} from "@/modules/budgets/types";
import {
  toCategoryColor,
  toCategoryIcon,
} from "@/modules/categories/constants";
import { can } from "@/modules/family/permissions";
import { ensureRecurrencesMaterialized } from "@/modules/recurrences/materialize";
import { requireMembership } from "@/server/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** D14: realizado e comprometido de cada orçamento/mês (`budget_progress(mês − 3, mês)`). */
export async function getBudgetsOverview(opts: {
  month: ISODate;
  archived: boolean;
}): Promise<BudgetsOverview> {
  const membership = await requireMembership();
  await ensureRecurrencesMaterialized();
  const supabase = await createClient();
  const month = startOfMonth(opts.month);

  const [rows, progress] = await Promise.all([
    selectBudgets(supabase, opts.archived),
    rpcBudgetProgress(supabase, addMonths(month, -HISTORY_MONTHS), month),
  ]);
  const byKey = new Map<string, BudgetProgressRow>(
    progress.map((p) => [`${p.budgetId}|${p.month}`, p]),
  );
  const canManage = can(membership.role, "budget.manage");

  const budgets: BudgetView[] = [];
  for (const row of rows) {
    const current = byKey.get(`${row.id}|${month}`);
    // Fora da vigência no mês escolhido: o orçamento não aparece.
    if (!current) continue;
    const limit = fromDbNumeric(row.amount_limit);
    const now = budgetProgress(limit, current.spent, current.committed);

    const history: BudgetHistoryEntry[] = [];
    for (let back = 1; back <= HISTORY_MONTHS; back++) {
      const m = addMonths(month, -back);
      const past = byKey.get(`${row.id}|${m}`);
      if (!past) continue;
      const p = budgetProgress(limit, past.spent, past.committed);
      history.push({
        month: m,
        label: formatMonthBR(m, "long"),
        spent: past.spent,
        percent: p.percent,
        status: p.status,
      });
    }

    budgets.push({
      id: row.id,
      category: row.category
        ? {
            id: row.category.id,
            name: row.category.name,
            color: toCategoryColor(row.category.color),
            icon: toCategoryIcon(row.category.icon),
            archived: row.category.archived_at !== null,
          }
        : null,
      amountLimit: limit,
      spent: current.spent,
      committed: current.committed,
      available: now.available,
      percent: now.percent,
      status: now.status,
      history,
      startMonth: dbDate(row.start_month),
      endMonth: row.end_month === null ? null : dbDate(row.end_month),
      archivedAt: row.archived_at,
      canManage,
    });
  }
  return { month, label: formatMonthBR(month, "long"), budgets };
}

export async function getBudget(id: string): Promise<BudgetEditData | null> {
  await requireMembership();
  // Id que não é uuid não existe (evita o erro 22P02 do Postgres).
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const row = await selectBudgetById(supabase, id);
  if (!row) return null;
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category?.name ?? null,
    amountLimit: fromDbNumeric(row.amount_limit),
    startMonth: dbDate(row.start_month),
    endMonth: row.end_month === null ? null : dbDate(row.end_month),
    archivedAt: row.archived_at,
  };
}
