import { addMonths, startOfMonth, type ISODate } from "@/lib/dates";
import { asAggregateCents, type Cents } from "@/lib/money";
import { SAVING_MONTHS_MAX, SAVING_MONTHS_MIN } from "../constants";
import type { ResultLine, SimulationResult } from "../types";
import { ceilDiv, isIntegerInRange, isPositiveCents } from "./rounding";

export type SavingInput = {
  target: Cents;
  /** Quanto já está guardado para o objetivo (≥ 0). */
  saved: Cents;
  today: ISODate;
} & (
  | { monthlyContribution: Cents; months?: undefined }
  | { months: number; monthlyContribution?: undefined }
);

/**
 * D15 (juntar para um objetivo, sem rendimento): com aporte mensal informado → meses = ceil(falta / aporte);
 * com prazo informado → aporte = ceil(falta / meses). Exatamente um dos dois deve vir informado.
 */
export function simulateSaving(input: SavingInput): SimulationResult {
  const { target, saved, today } = input;
  const hasContribution = input.monthlyContribution !== undefined;
  const hasMonths = input.months !== undefined;
  if (
    !isPositiveCents(target) ||
    !Number.isSafeInteger(saved) ||
    saved < 0 ||
    hasContribution === hasMonths ||
    (input.monthlyContribution !== undefined &&
      !isPositiveCents(input.monthlyContribution)) ||
    (input.months !== undefined &&
      !isIntegerInRange(input.months, SAVING_MONTHS_MIN, SAVING_MONTHS_MAX))
  ) {
    return { ok: false, error: "OUT_OF_RANGE" };
  }

  const missing = Math.max(target - saved, 0);
  const common: ResultLine[] = [
    { label: "Valor do objetivo", value: target, format: "brl", source: "informed" },
    { label: "Já guardado", value: saved, format: "brl", source: "informed" },
    {
      label: "Falta juntar",
      value: asAggregateCents(missing),
      format: "brl",
      source: "estimated",
    },
  ];
  const premises = [
    "Sem rendimento: o valor guardado não cresce sozinho.",
    "O aporte é o mesmo todo mês.",
  ];

  if (input.monthlyContribution !== undefined) {
    const contribution = input.monthlyContribution;
    const months = missing === 0 ? 0 : ceilDiv(missing, contribution);
    if (months > SAVING_MONTHS_MAX) return { ok: false, error: "OUT_OF_RANGE" };
    return {
      ok: true,
      headline: {
        label: "Tempo para juntar",
        value: months,
        format: "months",
        source: "estimated",
      },
      lines: [
        ...common,
        {
          label: "Aporte mensal",
          value: contribution,
          format: "brl",
          source: "informed",
        },
        {
          label: "Mês previsto",
          value: startOfMonth(addMonths(today, months)),
          format: "month",
          source: "estimated",
        },
      ],
      premises,
    };
  }

  const months = input.months as number;
  const contribution = asAggregateCents(
    missing === 0 ? 0 : ceilDiv(missing, months),
  );
  return {
    ok: true,
    headline: {
      label: "Aporte mensal necessário",
      value: contribution,
      format: "brl",
      source: "estimated",
    },
    lines: [
      ...common,
      { label: "Prazo", value: months, format: "months", source: "informed" },
      {
        label: "Mês previsto",
        value: startOfMonth(addMonths(today, months)),
        format: "month",
        source: "estimated",
      },
    ],
    premises: [
      ...premises,
      "O aporte arredonda para cima: é o mínimo para chegar ao valor no prazo.",
    ],
  };
}
