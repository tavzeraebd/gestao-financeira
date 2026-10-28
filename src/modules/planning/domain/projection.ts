import { asAggregateCents, type Cents } from "@/lib/money";
import { PROJECTION_MONTHS_MAX, PROJECTION_MONTHS_MIN } from "../constants";
import type {
  PlanningBaseline,
  ProjectionResult,
  ProjectionRow,
} from "../types";
import { isIntegerInRange } from "./rounding";

export type ProjectionInput = {
  months: number;
  /** Ajuste mensal informado (pode ser negativo), somado a cada mês. */
  monthlyAdjustment: Cents;
  baseline: PlanningBaseline;
};

/**
 * D15 (saldo futuro): saldo do fim do mês k = saldo de hoje + Σ até k de (entradas − saídas previstas)
 * + ajuste mensal × k. Previsto do mês = pendentes + ocorrências recorrentes (`projected_cash_flow`).
 */
export function projectBalance(input: ProjectionInput): ProjectionResult {
  const { months, monthlyAdjustment, baseline } = input;
  if (
    !isIntegerInRange(months, PROJECTION_MONTHS_MIN, PROJECTION_MONTHS_MAX) ||
    !Number.isSafeInteger(monthlyAdjustment)
  ) {
    return { ok: false, error: "OUT_OF_RANGE" };
  }
  if (!baseline.hasAccounts) return { ok: false, error: "NO_BASELINE" };

  const source = baseline.projection.slice(0, months);
  if (source.length < months) return { ok: false, error: "NO_BASELINE" };

  let running: number = baseline.consolidatedBalance;
  const rows: ProjectionRow[] = source.map((item, index) => {
    const income = asAggregateCents(item.pendingIncome + item.recurringIncome);
    const expense = asAggregateCents(
      item.pendingExpense + item.recurringExpense,
    );
    running += income - expense;
    return {
      month: item.month,
      label: item.label,
      income,
      expense,
      balance: asAggregateCents(running + monthlyAdjustment * (index + 1)),
    };
  });

  const last = rows[rows.length - 1] as ProjectionRow;
  return {
    ok: true,
    headline: {
      label: `Saldo previsto no fim de ${last.label}`,
      value: last.balance,
      format: "brl",
      source: "estimated",
    },
    lines: [
      {
        label: "Saldo de hoje",
        value: baseline.consolidatedBalance,
        format: "brl",
        source: "known",
      },
      {
        label: "Ajuste mensal",
        value: monthlyAdjustment,
        format: "brl",
        source: "informed",
      },
      ...rows.map((row) => ({
        label: `Saldo no fim de ${row.label}`,
        value: row.balance,
        format: "brl" as const,
        source: "estimated" as const,
      })),
    ],
    premises: [
      "Considera só contas pendentes e recorrências ativas já cadastradas.",
      "Não inclui receitas ou despesas ainda não registradas; use o ajuste mensal para isso.",
    ],
    rows,
  };
}
