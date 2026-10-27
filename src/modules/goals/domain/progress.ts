import { percentOf, subCents, type Cents } from "@/lib/money";

export type GoalProgress = {
  percent: number | null;
  remaining: Cents;
  reached: boolean;
};

/**
 * D9: % = acumulado / alvo × 100 (só exibição; pode passar de 100); restante = max(alvo − acumulado, 0);
 * atingida = acumulado ≥ alvo. Alvo 0 (inválido no banco) → % `null`.
 */
export function goalProgress(target: Cents, saved: Cents): GoalProgress {
  const missing = subCents(target, saved);
  const remaining = (missing > 0 ? missing : 0) as Cents;
  return {
    percent: percentOf(saved, target),
    remaining,
    reached: target > 0 && saved >= target,
  };
}
