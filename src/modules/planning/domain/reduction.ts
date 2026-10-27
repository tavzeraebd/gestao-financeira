import { asAggregateCents, type Cents } from "@/lib/money";
import {
  AVERAGE_MONTHS,
  REDUCTION_PERCENT_MAX,
  REDUCTION_PERCENT_MAX_DECIMALS,
} from "../constants";
import type { PlanningBaseline, SimulationResult } from "../types";
import { isPositiveCents } from "./rounding";

export type ReductionInput = {
  categoryId: string;
  baseline: PlanningBaseline;
} & (
  | { percent: number; amount?: undefined }
  | { amount: Cents; percent?: undefined }
);

/** Economia = média × pontos-base / 10.000, em inteiros, com meio para cima (valores positivos). */
function percentOfAverage(average: number, percent: number): Cents | null {
  const scale = 10 ** REDUCTION_PERCENT_MAX_DECIMALS;
  const scaled = percent * scale;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) return null;
  const basisPoints = BigInt(Math.round(scaled));
  const divisor = BigInt(scale * 100);
  const product = BigInt(average) * basisPoints;
  const rounded = (product * BigInt(2) + divisor) / (divisor * BigInt(2));
  return asAggregateCents(Number(rounded));
}

/**
 * D15 (reduzir despesas): economia mensal = média da categoria × % informado (ou o valor informado, até a média);
 * em 12 meses = × 12. Exatamente um entre `percent` e `amount`.
 */
export function simulateReduction(input: ReductionInput): SimulationResult {
  const { categoryId, baseline } = input;
  if ((input.percent === undefined) === (input.amount === undefined)) {
    return { ok: false, error: "OUT_OF_RANGE" };
  }
  if (!baseline.hasAccounts) return { ok: false, error: "NO_BASELINE" };
  const category = baseline.categoryAverages.find(
    (c) => c.categoryId === categoryId,
  );
  if (!category) return { ok: false, error: "NO_BASELINE" };

  let monthlySaving: Cents;
  if (input.percent !== undefined) {
    if (
      !Number.isFinite(input.percent) ||
      input.percent <= 0 ||
      input.percent > REDUCTION_PERCENT_MAX
    ) {
      return { ok: false, error: "OUT_OF_RANGE" };
    }
    const computed = percentOfAverage(category.average, input.percent);
    if (computed === null) return { ok: false, error: "OUT_OF_RANGE" };
    monthlySaving = computed;
  } else {
    if (!isPositiveCents(input.amount) || input.amount > category.average) {
      return { ok: false, error: "OUT_OF_RANGE" };
    }
    monthlySaving = input.amount;
  }

  return {
    ok: true,
    headline: {
      label: "Economia mensal estimada",
      value: monthlySaving,
      format: "brl",
      source: "estimated",
    },
    lines: [
      {
        label: `Média mensal em ${category.name}`,
        value: category.average,
        format: "brl",
        source: "known",
      },
      input.percent !== undefined
        ? {
            label: "Redução informada",
            value: input.percent,
            format: "percent",
            source: "informed",
          }
        : {
            label: "Redução informada",
            value: input.amount,
            format: "brl",
            source: "informed",
          },
      {
        label: "Economia em 12 meses",
        value: asAggregateCents(monthlySaving * 12),
        format: "brl",
        source: "estimated",
      },
    ],
    premises: [
      `A média considera os últimos ${AVERAGE_MONTHS} meses completos da categoria.`,
      "A economia é a mesma todos os meses; o dinheiro economizado não é reservado automaticamente.",
    ],
  };
}
