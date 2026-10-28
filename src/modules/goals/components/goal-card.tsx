import Link from "next/link";

import { GoalIcon } from "@/components/shared/goal-icon";
import { Money } from "@/components/shared/money";
import { ProgressMeter } from "@/components/shared/progress-meter";
import { Card, CardContent } from "@/components/ui/card";
import type { GoalView } from "@/modules/goals/types";
import { GoalStatusBadge } from "./goal-status-badge";

/** Só formata o percentual que já vem calculado (`goalProgress`). */
export function goalPercentText(percent: number | null): string {
  return percent === null ? "0%" : `${Math.round(percent)}%`;
}

function estimateText(goal: GoalView): string {
  if (goal.status === "completed") return "Concluída";
  const { months } = goal.estimate;
  if (months === null) return "Sem estimativa";
  return months === 1 ? "1 mês" : `${months} meses`;
}

export function GoalCard({ goal }: { goal: GoalView }) {
  const percent = goalPercentText(goal.percent);
  return (
    <Card
      className="hover:bg-muted/40 relative transition-colors [--card-spacing:--spacing(5)]"
      data-testid="meta"
    >
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <GoalIcon icon={goal.icon} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="truncate text-base font-semibold">
              <Link
                href={`/metas/${goal.id}`}
                className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring"
              >
                {goal.name}
              </Link>
            </h2>
            <p className="text-sm">
              <Money cents={goal.saved} className="font-semibold" /> /{" "}
              <Money cents={goal.targetAmount} />
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-base font-semibold tabular-nums">
              {percent}
            </span>
            <span className="text-muted-foreground text-xs">
              {estimateText(goal)}
            </span>
          </div>
        </div>
        <ProgressMeter
          value={goal.percent}
          tone="default"
          label={`Progresso da meta ${goal.name}`}
          valueText={`${percent} da meta`}
        />
        {goal.status !== "active" ? (
          <div>
            <GoalStatusBadge status={goal.status} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
