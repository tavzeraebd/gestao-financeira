import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { today } from "@/lib/dates";
import { can } from "@/modules/family/permissions";
import { GoalForm } from "@/modules/goals/components/goal-form";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Nova meta" };

export default async function NewGoalPage() {
  const membership = await requireMembership();
  if (!can(membership.role, "goal.manage")) notFound();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href="/metas"
        className={buttonVariants({ variant: "ghost", className: "self-start" })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Metas
      </Link>
      <h1 className="text-xl font-bold">Nova meta</h1>
      <Card className="[--card-spacing:--spacing(5)]">
        <CardContent>
          <GoalForm mode="create" today={today()} />
        </CardContent>
      </Card>
    </div>
  );
}
