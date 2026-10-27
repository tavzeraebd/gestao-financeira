import type { ISODate } from "@/lib/dates";
import { estimateGoal } from "@/modules/goals/domain/estimate";
import { asAggregateCents, type Cents } from "@/lib/money";
import type { PlanningBaseline, ResultLine, SimulationResult } from "../types";
import { isPositiveCents } from "./rounding";

export type GoalDeadlineInput = {
  goal: PlanningBaseline["goals"][number];
  /** Aporte mensal informado; omitido = ritmo atual da meta. */
  monthly?: Cents;
  today: ISODate;
};

/** D15 (prazo de meta): D9 com o aporte mensal informado (padrão: o ritmo atual da meta). */
export function simulateGoalDeadline(input: GoalDeadlineInput): SimulationResult {
  const { goal, monthly, today } = input;
  if (monthly !== undefined && !isPositiveCents(monthly)) {
    return { ok: false, error: "OUT_OF_RANGE" };
  }
  if (monthly === undefined && goal.pace <= 0) {
    return { ok: false, error: "NO_BASELINE" };
  }

  const estimate = estimateGoal({
    target: goal.target,
    saved: goal.saved,
    // O ritmo da base já é mensal: ×3 devolve o mesmo valor após o ÷3 do D9.
    netInWindow: asAggregateCents(goal.pace * 3),
    targetDate: goal.targetDate,
    today,
    monthly,
  });
  const remaining = asAggregateCents(Math.max(goal.target - goal.saved, 0));

  const lines: ResultLine[] = [
    { label: "Valor da meta", value: goal.target, format: "brl", source: "known" },
    { label: "Já guardado", value: goal.saved, format: "brl", source: "known" },
    { label: "Falta", value: remaining, format: "brl", source: "known" },
    {
      label: monthly === undefined ? "Ritmo atual" : "Aporte mensal",
      value: estimate.pace,
      format: "brl",
      source: monthly === undefined ? "known" : "informed",
    },
  ];
  if (estimate.estimatedMonth !== null) {
    lines.push({
      label: "Mês previsto",
      value: estimate.estimatedMonth,
      format: "month",
      source: "estimated",
    });
  }
  if (goal.targetDate !== null) {
    lines.push({
      label: "Data-alvo",
      value: goal.targetDate,
      format: "text",
      source: "known",
    });
    if (estimate.requiredMonthly !== null) {
      lines.push({
        label: "Aporte mensal para chegar na data-alvo",
        value: estimate.requiredMonthly,
        format: "brl",
        source: "estimated",
      });
    }
  }

  const headline: ResultLine =
    estimate.months !== null
      ? {
          label: "Tempo para concluir a meta",
          value: estimate.months,
          format: "months",
          source: "estimated",
        }
      : {
          label: "Situação da meta",
          value: remaining === 0 ? "Meta já atingida" : "Sem estimativa",
          format: "text",
          source: "estimated",
        };

  const premises = [estimate.premise, "Sem rendimento sobre o valor guardado."];
  if (estimate.targetDatePassed) premises.push("A data-alvo já passou.");

  return { ok: true, headline, lines, premises };
}
