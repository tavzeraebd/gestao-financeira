import { PencilIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { ISODate } from "@/lib/dates";
import type { GoalDetail } from "@/modules/goals/types";
import { ContributionDialog } from "./contribution-dialog";
import { GoalStatusButton } from "./goal-status-button";

/** Ações da meta conforme situação e permissão (a regra final é do servidor/RLS). */
export function GoalActions({
  goal,
  today,
}: {
  goal: GoalDetail;
  today: ISODate;
}) {
  const open = goal.status === "active" || goal.status === "paused";
  const showContribute = goal.canContribute && goal.status === "active";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {showContribute ? (
          <>
            <ContributionDialog
              goalId={goal.id}
              kind="deposit"
              today={today}
              members={goal.members}
              canChooseMember={goal.canManage}
            />
            <ContributionDialog
              goalId={goal.id}
              kind="withdrawal"
              today={today}
              members={goal.members}
              canChooseMember={goal.canManage}
            />
          </>
        ) : null}
        {goal.canManage && open ? (
          <>
            <Link
              href={`/metas/${goal.id}/editar`}
              className={buttonVariants({ variant: "outline" })}
              aria-label={`Editar meta ${goal.name}`}
            >
              <PencilIcon aria-hidden="true" data-icon="inline-start" />
              Editar
            </Link>
            <GoalStatusButton
              goalId={goal.id}
              name={goal.name}
              to={goal.status === "active" ? "paused" : "active"}
            />
            <GoalStatusButton
              goalId={goal.id}
              name={goal.name}
              to="completed"
            />
            <GoalStatusButton
              goalId={goal.id}
              name={goal.name}
              to="canceled"
            />
          </>
        ) : null}
      </div>
      {goal.status === "paused" ? (
        <p className="text-muted-foreground text-sm">
          Esta meta está pausada. Reative-a para registrar aportes.
        </p>
      ) : null}
    </div>
  );
}
