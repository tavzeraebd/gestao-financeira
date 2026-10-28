import { formatMonthBR, type ISODate } from "@/lib/dates";
import { percentOf, subCents, sumCents, type Cents } from "@/lib/money";
import type { AccountType } from "@/modules/accounts/constants";
import { MAX_PROGRESS_MONTHS } from "@/modules/budgets/constants";
import { budgetProgress } from "@/modules/budgets/domain/progress";
import { memberDisplayName } from "@/modules/family/domain/member-name";
import type { GoalIconName, GoalStatus } from "@/modules/goals/constants";
import { goalProgress } from "@/modules/goals/domain/progress";
import type {
  AccountReportRow,
  BudgetReportMonth,
  BudgetReportRow,
  CategoryBreakdown,
  CategoryReportRow,
  Comparison,
  GoalReportRow,
  MemberReportRow,
} from "../types";
import { compare } from "./comparison";

const ZERO = 0 as Cents;

/** Categorias do período atual (na ordem do breakdown) e depois as que só existiam no anterior. */
export function buildCategoryReportRows(
  current: CategoryBreakdown,
  previous: CategoryBreakdown,
): CategoryReportRow[] {
  const previousById = new Map(
    previous.rows.flatMap((r) => (r.categoryId ? [[r.categoryId, r]] : [])),
  );
  const rows: CategoryReportRow[] = [];
  const seen = new Set<string>();
  for (const slice of current.rows) {
    if (!slice.categoryId) continue;
    seen.add(slice.categoryId);
    const before = previousById.get(slice.categoryId)?.amount ?? ZERO;
    rows.push({
      categoryId: slice.categoryId,
      name: slice.name,
      color: slice.color,
      icon: slice.icon,
      archived: slice.archived,
      current: slice.amount,
      previous: before,
      comparison: compare(slice.amount, before),
    });
  }
  for (const slice of previous.rows) {
    if (!slice.categoryId || seen.has(slice.categoryId)) continue;
    rows.push({
      categoryId: slice.categoryId,
      name: slice.name,
      color: slice.color,
      icon: slice.icon,
      archived: slice.archived,
      current: ZERO,
      previous: slice.amount,
      comparison: compare(ZERO, slice.amount),
    });
  }
  return rows;
}

export type AccountInfo = {
  id: string;
  name: string;
  type: AccountType;
  isActive: boolean;
};

export type AccountFlow = {
  accountId: string;
  opening: Cents;
  inflow: Cents;
  outflow: Cents;
  closing: Cents;
};

/** D22: líquido = entradas − saídas; consolidado (D3) = só contas de ativo (cartões fora). */
export function buildAccountReport(
  flows: readonly AccountFlow[],
  accounts: ReadonlyMap<string, AccountInfo>,
): { accounts: AccountReportRow[]; assetNet: Cents; consolidated: Comparison } {
  const rows: AccountReportRow[] = flows.map((f) => {
    const info = accounts.get(f.accountId);
    return {
      id: f.accountId,
      name: info?.name ?? "Conta removida",
      type: info?.type ?? "other",
      archived: info ? !info.isActive : true,
      opening: f.opening,
      inflow: f.inflow,
      outflow: f.outflow,
      net: subCents(f.inflow, f.outflow),
      closing: f.closing,
    };
  });
  const assets = rows.filter((r) => r.type !== "credit_card");
  return {
    accounts: rows,
    assetNet: sumCents(assets.map((r) => r.net)),
    consolidated: compare(
      sumCents(assets.map((r) => r.closing)),
      sumCents(assets.map((r) => r.opening)),
    ),
  };
}

/** D10: linhas na ordem do banco; `memberId` nulo = sem responsável; fora da família = "Ex-integrante". */
export function buildMemberReportRows(
  totals: readonly { memberId: string | null; amount: Cents }[],
  names: ReadonlyMap<string, string | null>,
  total: Cents,
): MemberReportRow[] {
  return totals.map((t) => ({
    member:
      t.memberId === null
        ? null
        : {
            id: t.memberId,
            displayName: memberDisplayName(names.get(t.memberId) ?? null),
          },
    amount: t.amount,
    percent: percentOf(t.amount, total),
  }));
}

export type BudgetInfo = {
  id: string;
  limit: Cents;
  category: BudgetReportRow["category"];
};

/** D14: no máximo os 12 últimos meses do período; só orçamentos vigentes em cada mês. */
export function buildBudgetReportMonths(
  months: readonly ISODate[],
  budgets: readonly BudgetInfo[],
  progress: readonly {
    budgetId: string;
    month: string;
    spent: Cents;
    committed: Cents;
  }[],
): BudgetReportMonth[] {
  const byKey = new Map(progress.map((p) => [`${p.budgetId}|${p.month}`, p]));
  return months.slice(-MAX_PROGRESS_MONTHS).map((month) => {
    const rows: BudgetReportRow[] = [];
    for (const b of budgets) {
      const p = byKey.get(`${b.id}|${month}`);
      if (!p) continue;
      const result = budgetProgress(b.limit, p.spent, p.committed);
      rows.push({
        budgetId: b.id,
        category: b.category,
        limit: b.limit,
        spent: p.spent,
        percent: result.percent,
        status: result.status,
      });
    }
    return { month, label: formatMonthBR(month, "long"), rows };
  });
}

export function buildGoalReportRows(
  goals: readonly {
    id: string;
    name: string;
    icon: GoalIconName;
    status: GoalStatus;
    target: Cents;
  }[],
  summaries: ReadonlyMap<
    string,
    { saved: Cents; deposits: Cents; withdrawals: Cents }
  >,
): GoalReportRow[] {
  return goals.map((g) => {
    const s = summaries.get(g.id);
    const saved = s?.saved ?? ZERO;
    return {
      id: g.id,
      name: g.name,
      icon: g.icon,
      status: g.status,
      target: g.target,
      saved,
      deposits: s?.deposits ?? ZERO,
      withdrawals: s?.withdrawals ?? ZERO,
      percent: goalProgress(g.target, saved).percent,
    };
  });
}
