import { PlusIcon, TargetIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/modules/family/permissions";
import { GoalCard } from "@/modules/goals/components/goal-card";
import {
  GOAL_FILTER_LABELS,
  GOAL_FILTERS,
  type GoalFilter,
} from "@/modules/goals/constants";
import { listGoals } from "@/modules/goals/queries";
import { goalFiltersSchema } from "@/modules/goals/schemas";
import { SituationTabs } from "@/modules/recurrences/components/situation-tabs";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Metas" };

const EMPTY_TITLE: Record<GoalFilter, string> = {
  ativas: "Nenhuma meta ainda",
  concluidas: "Nenhuma meta concluída",
  todas: "Nenhuma meta ainda",
};

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = goalFiltersSchema.parse(await searchParams);
  const [membership, goals] = await Promise.all([
    requireMembership(),
    listGoals(filters),
  ]);
  const canManage = can(membership.role, "goal.manage");

  const newGoal = canManage ? (
    <Link href="/metas/nova" className={buttonVariants()}>
      <PlusIcon aria-hidden="true" data-icon="inline-start" />
      Nova meta
    </Link>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Metas"
        description="Quanto a família já guardou para cada objetivo."
        actions={newGoal}
      />

      <SituationTabs
        aria-label="Situação das metas"
        items={GOAL_FILTERS.map((f) => ({
          href: `/metas?situacao=${f}`,
          label: GOAL_FILTER_LABELS[f],
          active: filters.situacao === f,
        }))}
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={TargetIcon}
          title={EMPTY_TITLE[filters.situacao]}
          description={
            filters.situacao === "concluidas"
              ? "As metas que a família concluir aparecem aqui."
              : canManage
                ? "Crie uma meta para acompanhar quanto a família já guardou."
                : "Peça a um administrador para criar a primeira meta da família."
          }
          action={
            canManage && filters.situacao !== "concluidas" ? (
              <Link href="/metas/nova" className={buttonVariants()}>
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                Criar meta
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {goals.map((goal) => (
            <li key={goal.id} className="min-w-0">
              <GoalCard goal={goal} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
