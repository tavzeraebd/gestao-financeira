import { PlusIcon, TargetIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { GoalIcon } from "@/components/shared/goal-icon";
import { Money } from "@/components/shared/money";
import { ProgressMeter } from "@/components/shared/progress-meter";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { goalPercentText } from "@/modules/goals/components/goal-card";
import { GoalStatusBadge } from "@/modules/goals/components/goal-status-badge";
import type { GoalReport } from "@/modules/reports/types";

type ReportGoalsProps = {
  report: GoalReport;
  /** Owner/admin recebem o atalho para criar a primeira meta. */
  canManage: boolean;
};

/** Progresso de cada meta e os aportes e retiradas feitos dentro do período. */
export function ReportGoals({ report, canManage }: ReportGoalsProps) {
  if (report.goals.length === 0) {
    return (
      <EmptyState
        icon={TargetIcon}
        title="Nenhuma meta cadastrada"
        description={
          canManage
            ? "Crie uma meta para acompanhar quanto a família já guardou."
            : "Peça a quem administra a família para criar a primeira meta."
        }
        action={
          canManage ? (
            <Link href="/metas/nova" className={buttonVariants()}>
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              Criar meta
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {report.goals.map((goal) => {
        const percent = goalPercentText(goal.percent);
        return (
          <li key={goal.id} className="min-w-0">
            <Card className="h-full" data-testid="meta-relatorio">
              <CardContent className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <GoalIcon icon={goal.icon} />
                    <h2 className="min-w-0 text-base font-semibold break-words">
                      <Link
                        href={`/metas/${goal.id}`}
                        className="hover:underline"
                      >
                        {goal.name}
                      </Link>
                    </h2>
                  </div>
                  <GoalStatusBadge status={goal.status} />
                </div>

                <div className="flex flex-col gap-2">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span>
                      <Money cents={goal.saved} className="font-semibold" /> de{" "}
                      <Money cents={goal.target} />
                    </span>
                    <span className="font-semibold tabular-nums">
                      {percent}
                    </span>
                  </p>
                  <ProgressMeter
                    value={goal.percent}
                    tone="default"
                    label={`Progresso da meta ${goal.name}`}
                    valueText={`${percent} da meta`}
                  />
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground">
                      Aportes no período
                    </dt>
                    <dd className="font-medium">
                      <Money cents={goal.deposits} />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground">
                      Retiradas no período
                    </dt>
                    <dd className="font-medium">
                      <Money cents={goal.withdrawals} />
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
