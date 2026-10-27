import { asAggregateCents, type Cents } from "@/lib/money";
import { AVERAGE_MONTHS } from "../constants";
import type { PlanningBaseline, SimulationResult } from "../types";
import { isPositiveCents } from "./rounding";

export type NewCommitmentInput = { monthly: Cents; baseline: PlanningBaseline };

/** D15 (novo compromisso mensal): novo resultado médio = resultado médio − valor; efeito em 12 meses = valor × 12. */
export function simulateNewCommitment(
  input: NewCommitmentInput,
): SimulationResult {
  const { monthly, baseline } = input;
  if (!isPositiveCents(monthly)) return { ok: false, error: "OUT_OF_RANGE" };
  if (!baseline.hasAccounts) return { ok: false, error: "NO_BASELINE" };

  const current = baseline.averageMonthly.result;
  return {
    ok: true,
    headline: {
      label: "Novo resultado médio mensal",
      value: asAggregateCents(current - monthly),
      format: "brl",
      source: "estimated",
    },
    lines: [
      {
        label: "Resultado médio mensal atual",
        value: current,
        format: "brl",
        source: "known",
      },
      {
        label: "Novo compromisso por mês",
        value: monthly,
        format: "brl",
        source: "informed",
      },
      {
        label: "Efeito em 12 meses",
        value: asAggregateCents(monthly * 12),
        format: "brl",
        source: "estimated",
      },
    ],
    premises: [
      `O resultado médio considera os últimos ${AVERAGE_MONTHS} meses completos (receitas menos despesas).`,
      "O compromisso é o mesmo todos os meses, sem reajuste.",
    ],
  };
}
