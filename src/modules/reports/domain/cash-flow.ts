import { formatMonthBR, parseISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type { CashFlowMonth } from "../types";

/**
 * D17: linhas de `monthly_cash_flow` (já em ordem e com todos os meses) -> `CashFlowMonth`.
 * Só rotula; as somas vêm do SQL.
 */
export function buildCashFlowMonths(
  rows: readonly {
    month: string;
    income: Cents;
    expense: Cents;
    result: Cents;
  }[],
): CashFlowMonth[] {
  return rows.map((row) => {
    const month = parseISODate(row.month);
    if (!month) throw new RangeError("Mês inválido no fluxo de caixa.");
    return {
      month,
      label: formatMonthBR(month, "short"),
      longLabel: formatMonthBR(month, "long"),
      income: row.income,
      expense: row.expense,
      result: row.result,
    };
  });
}
