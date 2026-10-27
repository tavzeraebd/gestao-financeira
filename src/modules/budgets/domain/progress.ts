import { percentOf, subCents, type Cents } from "@/lib/money";
import { ATTENTION_PERCENT, type BudgetStatus } from "../constants";

export type BudgetProgress = {
  available: Cents;
  percent: number | null;
  status: BudgetStatus;
};

/**
 * D14: disponível = limite − realizado (negativo = acima do limite); % = realizado / limite × 100 (só
 * exibição); `ok` < 80; `attention` de 80 a 100, inclusive; `exceeded` > 100; realizado ≤ 0 → `ok`.
 * O estado compara inteiros (sem ponto flutuante), então exatamente 80% e 100% não sofrem arredondamento.
 * `committed` (previsto) é informativo: não muda disponível, percentual nem estado.
 */
export function budgetProgress(
  limit: Cents,
  spent: Cents,
  committed: Cents,
): BudgetProgress {
  void committed;
  const available = subCents(limit, spent);
  const percent = percentOf(spent, limit);

  let status: BudgetStatus = "ok";
  if (spent > 0) {
    const spentTimes100 = BigInt(spent) * BigInt(100);
    const limitBig = BigInt(limit);
    if (spentTimes100 > limitBig * BigInt(100)) {
      status = "exceeded";
    } else if (spentTimes100 >= limitBig * BigInt(ATTENTION_PERCENT)) {
      status = "attention";
    }
  }
  return { available, percent, status };
}
