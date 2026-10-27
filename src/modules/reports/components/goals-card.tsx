import { PlusIcon, TargetIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { GoalIcon } from "@/components/shared/goal-icon";
import { ProgressMeter } from "@/components/shared/progress-meter";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { goalPercentText } from "@/modules/goals/components/goal-card";
import type { DashboardGoal } from "@/modules/reports/types";

type GoalsCardProps = {
  goals: DashboardGoal[];
  /** Owner/admin podem criar a primeira meta; os demais recebem orientação. */
  canManage: boolean;
};

export function GoalsCard({ goals, canManage }: GoalsCardProps) {
  return (
    <Card className="h-full" data-testid="metas">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Metas</h2>
        {goals.length > 0 ? (
          <Link
            href="/metas"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Ver todas
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {goals.length === 0 ? (
          <EmptyState
            icon={TargetIcon}
            title="Nenhuma meta ativa"
            description={
              canManage
                ? "Crie uma meta para acompanhar quanto a família já guardou."
                : "Peça a um administrador para criar a primeira meta da família."
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
        ) : (
          <ul className="flex flex-col gap-4">
            {goals.map((goal) => {
              const percent = goalPercentText(goal.percent);
              return (
                <li key={goal.id} className="flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <GoalIcon icon={goal.icon} size="sm" />
                    <Link
                      href={`/metas/${goal.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                    >
                      {goal.name}
                    </Link>
                    <span className="text-sm font-semibold tabular-nums">
                      {percent}
                    </span>
                  </div>
                  <ProgressMeter
                    value={goal.percent}
                    tone="default"
                    label={`Progresso da meta ${goal.name}`}
                    valueText={`${percent} da meta`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
