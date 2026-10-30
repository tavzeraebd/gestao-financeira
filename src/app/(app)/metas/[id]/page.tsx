import { ChevronLeftIcon, HistoryIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { InfoHint } from "@/components/shared/info-hint";
import { GoalIcon } from "@/components/shared/goal-icon";
import { Money } from "@/components/shared/money";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { ProgressMeter } from "@/components/shared/progress-meter";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateBR, today } from "@/lib/dates";
import { ContributionHistory } from "@/modules/goals/components/contribution-history";
import { GoalActions } from "@/modules/goals/components/goal-actions";
import { goalPercentText } from "@/modules/goals/components/goal-card";
import { GoalEstimateCard } from "@/modules/goals/components/goal-estimate-card";
import { GoalStatusBadge } from "@/modules/goals/components/goal-status-badge";
import { getGoal } from "@/modules/goals/queries";
import { goalFiltersSchema } from "@/modules/goals/schemas";

export const metadata: Metadata = { title: "Meta" };

export default async function GoalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { pagina } = goalFiltersSchema.parse(await searchParams);
  const goal = await getGoal(id, { page: pagina });
  if (!goal) notFound();

  const percent = goalPercentText(goal.percent);
  const { contributions } = goal;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/metas"
        className={buttonVariants({
          variant: "ghost",
          className: "self-start",
        })}
      >
        <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
        Metas
      </Link>

      <header className="flex items-center gap-3">
        <GoalIcon icon={goal.icon} size="lg" />
        <div className="flex min-w-0 flex-col items-start gap-1">
          <h1 className="text-xl font-bold break-words">{goal.name}</h1>
          <GoalStatusBadge status={goal.status} />
        </div>
      </header>
      {goal.description ? (
        <p className="text-muted-foreground -mt-3 text-sm">
          {goal.description}
        </p>
      ) : null}

      <GoalActions goal={goal} today={today()} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="progresso">
          <CardHeader>
            <h2 className="text-base font-semibold">Progresso</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-muted-foreground">Guardado</dt>
                <dd className="text-base font-semibold">
                  <Money cents={goal.saved} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Meta</dt>
                <dd className="text-base font-semibold">
                  <Money cents={goal.targetAmount} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Falta</dt>
                <dd className="text-base font-semibold">
                  <Money cents={goal.remaining} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Concluído</dt>
                <dd className="text-base font-semibold tabular-nums">
                  {percent}
                </dd>
              </div>
            </dl>
            <ProgressMeter
              value={goal.percent}
              tone="default"
              label={`Progresso da meta ${goal.name}`}
              valueText={`${percent} da meta`}
            />
            {goal.targetDate ? (
              <p className="text-muted-foreground">
                Data-alvo: {formatDateBR(goal.targetDate)}
              </p>
            ) : null}
            <p className="text-muted-foreground flex items-center gap-1">
              Valor guardado
              <InfoHint label="valor guardado">
                O valor guardado é uma reserva registrada aqui. Ele não sai das
                contas nem muda o saldo total.
              </InfoHint>
            </p>
          </CardContent>
        </Card>
        <GoalEstimateCard goal={goal} />
      </div>

      <section
        aria-labelledby="historico-titulo"
        className="flex flex-col gap-3"
      >
        <h2 id="historico-titulo" className="text-base font-semibold">
          Histórico de aportes
        </h2>
        {contributions.items.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="Nenhum aporte registrado"
            description={
              goal.canContribute && goal.status === "active"
                ? "Use Registrar aporte para começar a guardar para esta meta."
                : "Os aportes e retiradas desta meta aparecem aqui."
            }
          />
        ) : (
          <>
            <ContributionHistory items={contributions.items} />
            {contributions.pageCount > 1 ? (
              <PaginationNav
                page={contributions.page}
                pageCount={contributions.pageCount}
                hrefForPage={(p) => `/metas/${goal.id}?pagina=${p}`}
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
