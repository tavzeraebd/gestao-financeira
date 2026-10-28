import { Money } from "@/components/shared/money";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateBR, formatMonthBR } from "@/lib/dates";
import type { GoalView } from "@/modules/goals/types";

/** Exibe a estimativa já calculada (`estimateGoal`); nenhuma conta é feita aqui. */
export function GoalEstimateCard({ goal }: { goal: GoalView }) {
  const { estimate } = goal;
  const reached = goal.status === "completed" || goal.remaining === 0;
  return (
    <Card data-testid="estimativa">
      <CardHeader>
        <h2 className="text-base font-semibold">Estimativa</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {reached ? (
          <p>O valor da meta já foi alcançado.</p>
        ) : estimate.estimatedMonth ? (
          <p>
            Previsão de conclusão:{" "}
            <strong className="capitalize">
              {formatMonthBR(estimate.estimatedMonth, "long")}
            </strong>
          </p>
        ) : (
          <p>Sem estimativa: registre aportes para calcularmos um ritmo.</p>
        )}
        {!reached && goal.targetDate ? (
          estimate.targetDatePassed ? (
            <p>A data-alvo já passou.</p>
          ) : estimate.requiredMonthly !== null ? (
            <p>
              Para chegar até {formatDateBR(goal.targetDate)}:{" "}
              <Money
                cents={estimate.requiredMonthly}
                className="font-semibold"
              />{" "}
              por mês
            </p>
          ) : null
        ) : null}
        {!reached ? (
          <p className="text-muted-foreground">{estimate.premise}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
