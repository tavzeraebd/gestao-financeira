import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { toBRLInput } from "@/lib/money";
import { can } from "@/modules/family/permissions";
import { GoalForm } from "@/modules/goals/components/goal-form";
import { getGoal } from "@/modules/goals/queries";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Editar meta" };

export default async function EditGoalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const membership = await requireMembership();
  if (!can(membership.role, "goal.manage")) notFound();
  const goal = await getGoal(id);
  if (!goal || (goal.status !== "active" && goal.status !== "paused")) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href={`/metas/${goal.id}`}
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        {goal.name}
      </Link>
      <h1 className="text-xl font-bold">Editar meta</h1>
      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <GoalForm
            mode="edit"
            goalId={goal.id}
            today={today()}
            initial={{
              name: goal.name,
              icon: goal.icon,
              targetAmount: toBRLInput(goal.targetAmount),
              targetDate: goal.targetDate ?? "",
              description: goal.description ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
