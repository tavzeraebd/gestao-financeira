import "server-only";
import {
  addMonths,
  endOfMonth,
  formatMonthBR,
  startOfMonth,
  type ISODate,
} from "@/lib/dates";
import { asCents, subCents, sumCents, type Cents } from "@/lib/money";
import { estimateGoal } from "@/modules/goals/domain/estimate";
import { AVERAGE_MONTHS } from "./constants";
import type { GoalBaseRow, ProjectedMonth } from "./repository";
import type { PlanningBaseline } from "./types";

/** Divisão inteira com meio para longe do zero (só inteiros; divisor > 0). */
function roundedDiv(value: number, divisor: number): Cents {
  const abs = Math.abs(value);
  const quotient = Math.floor((2 * abs + divisor) / (2 * divisor));
  return asCents(value < 0 ? -quotient : quotient);
}

/** D15: os 3 meses civis completos anteriores ao mês de `today`. */
export function averageWindow(today: ISODate): { from: ISODate; to: ISODate } {
  return {
    from: startOfMonth(addMonths(today, -AVERAGE_MONTHS)),
    to: endOfMonth(addMonths(today, -1)),
  };
}

export type BaselineInput = {
  today: ISODate;
  accounts: { type: string; isActive: boolean; balance: Cents }[];
  cashFlow: { income: Cents; expense: Cents; result: Cents }[];
  expenseTotals: { categoryId: string; amount: Cents }[];
  categories: Map<string, { name: string; color: string; icon: string }>;
  goals: GoalBaseRow[];
  goalSummary: Map<
    string,
    { saved: Cents; deposits: Cents; withdrawals: Cents }
  >;
  projection: ProjectedMonth[];
};

/**
 * D15: monta a base conhecida (nenhum cálculo em componente). Médias = soma dos 3 meses ÷ 3 com meio para
 * longe do zero; ritmo de cada meta = D9 (`estimateGoal`, janela de 90 dias).
 */
export function buildPlanningBaseline(input: BaselineInput): PlanningBaseline {
  const { today } = input;
  const sum = (pick: "income" | "expense" | "result") =>
    sumCents(input.cashFlow.map((m) => m[pick]));
  const categoryAverages = input.expenseTotals
    .map((t) => ({
      categoryId: t.categoryId,
      average: roundedDiv(t.amount, AVERAGE_MONTHS),
    }))
    .filter((c) => c.average > 0 && input.categories.has(c.categoryId))
    .sort((a, b) => b.average - a.average)
    .map((c) => {
      const meta = input.categories.get(c.categoryId)!;
      return { ...c, name: meta.name, color: meta.color, icon: meta.icon };
    });

  return {
    today,
    hasAccounts: input.accounts.some((a) => a.isActive),
    consolidatedBalance: sumCents(
      input.accounts
        .filter((a) => a.type !== "credit_card")
        .map((a) => a.balance),
    ),
    averageWindow: averageWindow(today),
    averageMonthly: {
      income: roundedDiv(sum("income"), AVERAGE_MONTHS),
      expense: roundedDiv(sum("expense"), AVERAGE_MONTHS),
      result: roundedDiv(sum("result"), AVERAGE_MONTHS),
    },
    categoryAverages,
    goals: input.goals.map((g) => {
      const s = input.goalSummary.get(g.id);
      const saved = s?.saved ?? asCents(0);
      const estimate = estimateGoal({
        target: g.target,
        saved,
        netInWindow: s ? subCents(s.deposits, s.withdrawals) : asCents(0),
        targetDate: g.targetDate,
        today,
      });
      return {
        id: g.id,
        name: g.name,
        saved,
        target: g.target,
        pace: estimate.pace,
        targetDate: g.targetDate,
      };
    }),
    projection: input.projection.map((p) => ({
      ...p,
      label: formatMonthBR(p.month, "long"),
    })),
  };
}
