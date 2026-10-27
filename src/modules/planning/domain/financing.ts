import type { Cents } from "@/lib/money";
import {
  FINANCING_MONTHS_MAX,
  FINANCING_MONTHS_MIN,
  RATE_MAX_DECIMALS,
  RATE_MAX_PERCENT,
  RATE_MIN_PERCENT,
} from "../constants";
import type { SimulationResult } from "../types";
import { isIntegerInRange, isPositiveCents, roundToCents } from "./rounding";

export type FinancingInput = {
  value: Cents;
  downPayment: Cents;
  months: number;
  /** Taxa mensal INFORMADA, em % (ex.: 1.5 = 1,5% ao mês); 0 = sem juros. */
  monthlyRatePercent: number;
};

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const scale = 10 ** decimals;
  return Math.abs(value * scale - Math.round(value * scale)) < 1e-6;
}

/**
 * D15 (Price): PV = valor − entrada; PMT = PV·i / (1 − (1+i)^−n), i = taxa/100; i = 0 → PV/n.
 * Parcela = round(PMT); total das parcelas = round(PMT_exato · n); juros = total − PV; custo = entrada + total.
 */
export function simulateFinancing(input: FinancingInput): SimulationResult {
  const { value, downPayment, months, monthlyRatePercent } = input;
  if (
    !isPositiveCents(value) ||
    !Number.isSafeInteger(downPayment) ||
    downPayment < 0 ||
    downPayment >= value ||
    !isIntegerInRange(months, FINANCING_MONTHS_MIN, FINANCING_MONTHS_MAX) ||
    !Number.isFinite(monthlyRatePercent) ||
    monthlyRatePercent < RATE_MIN_PERCENT ||
    monthlyRatePercent > RATE_MAX_PERCENT ||
    !hasAtMostDecimals(monthlyRatePercent, RATE_MAX_DECIMALS)
  ) {
    return { ok: false, error: "OUT_OF_RANGE" };
  }

  const principal = value - downPayment;
  const rate = monthlyRatePercent / 100;
  const exactPayment =
    rate === 0
      ? principal / months
      : (principal * rate) / (1 - Math.pow(1 + rate, -months));

  const payment = roundToCents(exactPayment);
  const totalPayments = roundToCents(exactPayment * months);
  if (payment === null || totalPayments === null) {
    return { ok: false, error: "OUT_OF_RANGE" };
  }
  const interest = roundToCents(totalPayments - principal);
  const totalCost = roundToCents(downPayment + totalPayments);
  if (interest === null || totalCost === null) {
    return { ok: false, error: "OUT_OF_RANGE" };
  }

  return {
    ok: true,
    headline: {
      label: "Valor da parcela aproximada",
      value: payment,
      format: "brl",
      source: "estimated",
    },
    lines: [
      { label: "Valor do bem", value, format: "brl", source: "informed" },
      {
        label: "Entrada",
        value: downPayment,
        format: "brl",
        source: "informed",
      },
      {
        label: "Valor financiado",
        value: roundToCents(principal) as Cents,
        format: "brl",
        source: "informed",
      },
      { label: "Prazo", value: months, format: "months", source: "informed" },
      {
        label: "Taxa mensal",
        value: monthlyRatePercent,
        format: "percent",
        source: "informed",
      },
      {
        label: "Total das parcelas",
        value: totalPayments,
        format: "brl",
        source: "estimated",
      },
      {
        label: "Juros pagos",
        value: interest,
        format: "brl",
        source: "estimated",
      },
      {
        label: "Custo total (entrada + parcelas)",
        value: totalCost,
        format: "brl",
        source: "estimated",
      },
    ],
    premises: [
      "A taxa mensal é a que você informou; o Núcleo não sugere taxas.",
      "Parcelas fixas e iguais (tabela Price), sem tarifas, seguros ou impostos.",
      "Valores arredondados ao centavo.",
    ],
  };
}
