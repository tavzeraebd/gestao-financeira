import { addMonths, startOfMonth, type ISODate } from "@/lib/dates";
import { asAggregateCents, formatBRL, type Cents } from "@/lib/money";
import { PACE_WINDOW_MONTHS } from "../constants";
import type { GoalEstimate } from "../types";

export type EstimateGoalInput = {
  target: Cents;
  saved: Cents;
  /** Aportes − retiradas com data na janela de 90 dias (hoje − 89 .. hoje). */
  netInWindow: Cents;
  targetDate: ISODate | null;
  today: ISODate;
  /** Aporte mensal informado: substitui o ritmo atual (cenário "prazo de meta"). */
  monthly?: Cents;
};

/** Divisão inteira por `divisor` > 0 com meio para longe do zero (só inteiros). */
function roundedDiv(value: number, divisor: number): number {
  const abs = Math.abs(value);
  const quotient = Math.floor((2 * abs + divisor) / (2 * divisor));
  return value < 0 ? -quotient : quotient;
}

function ceilDiv(value: number, divisor: number): number {
  return Math.floor((value + divisor - 1) / divisor);
}

function monthIndex(d: ISODate): number {
  return Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1;
}

/**
 * D9: ritmo = líquido da janela ÷ 3 (meio para longe do zero); ritmo ≤ 0 ou restante 0 → sem estimativa;
 * meses = ceil(restante / ritmo), mês previsto = mês de `addMonths(hoje, meses)`; com data-alvo, meses até o
 * alvo = diferença de meses civis (≤ 0 → "já passou", só enquanto falta valor) e aporte necessário =
 * ceil(restante / meses). Tudo em centavos inteiros; a premissa acompanha sempre o resultado.
 */
export function estimateGoal(input: EstimateGoalInput): GoalEstimate {
  const { target, saved, netInWindow, targetDate, today, monthly } = input;
  const informed = monthly !== undefined;
  const pace = informed
    ? monthly
    : asAggregateCents(roundedDiv(netInWindow, PACE_WINDOW_MONTHS));
  const remaining = Math.max(target - saved, 0);

  let months: number | null = null;
  let estimatedMonth: ISODate | null = null;
  if (remaining > 0 && pace > 0) {
    months = ceilDiv(remaining, pace);
    estimatedMonth = startOfMonth(addMonths(today, months));
  }

  let monthsToTarget: number | null = null;
  let requiredMonthly: Cents | null = null;
  let targetDatePassed = false;
  if (targetDate !== null && remaining > 0) {
    const diff = monthIndex(targetDate) - monthIndex(today);
    if (diff <= 0) {
      targetDatePassed = true;
    } else {
      monthsToTarget = diff;
      requiredMonthly = asAggregateCents(ceilDiv(remaining, diff));
    }
  }

  let premise: string;
  if (informed) {
    premise = `Considerando ${formatBRL(pace)} por mês (valor informado).`;
  } else if (pace > 0) {
    premise = `Mantendo ${formatBRL(pace)} por mês (média de aportes menos retiradas dos últimos 90 dias).`;
  } else {
    premise =
      "Sem aportes líquidos nos últimos 90 dias: não há ritmo para estimar.";
  }

  return {
    pace,
    paceSource: informed ? "informed" : "history",
    months,
    estimatedMonth,
    monthsToTarget,
    requiredMonthly,
    targetDatePassed,
    premise,
  };
}
