import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PiggyBankIcon,
  PlusIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { addMonths } from "@/lib/dates";
import { BudgetCard } from "@/modules/budgets/components/budget-card";
import { getBudgetsOverview } from "@/modules/budgets/queries";
import { budgetMonthSchema } from "@/modules/budgets/schemas";
import { can } from "@/modules/family/permissions";
import { SituationTabs } from "@/modules/recurrences/components/situation-tabs";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Orçamentos" };

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = budgetMonthSchema.parse(await searchParams);
  const [membership, overview] = await Promise.all([
    requireMembership(),
    getBudgetsOverview({ month: filters.mes, archived: filters.arquivados }),
  ]);
  const canManage = can(membership.role, "budget.manage");

  const href = (month: string, archived: boolean) =>
    `/orcamentos?mes=${month.slice(0, 7)}${archived ? "&arquivados=sim" : ""}`;
  const previous = addMonths(overview.month, -1);
  const next = addMonths(overview.month, 1);

  const newBudget = canManage ? (
    <Link href="/orcamentos/novo" className={buttonVariants()}>
      <PlusIcon aria-hidden="true" data-icon="inline-start" />
      Novo orçamento
    </Link>
  ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Orçamentos"
        description="Quanto a família pode gastar por mês, por categoria."
        actions={newBudget}
      />

      <nav
        aria-label="Mês dos orçamentos"
        className="flex items-center justify-between gap-2 sm:justify-start"
      >
        <Link
          href={href(previous, filters.arquivados)}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label="Mês anterior"
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Link>
        <p
          className="min-w-40 text-center text-base font-semibold capitalize"
          aria-live="polite"
        >
          {overview.label}
        </p>
        <Link
          href={href(next, filters.arquivados)}
          className={buttonVariants({ variant: "outline", size: "icon" })}
          aria-label="Próximo mês"
        >
          <ChevronRightIcon aria-hidden="true" />
        </Link>
      </nav>

      <SituationTabs
        aria-label="Situação dos orçamentos"
        items={[
          {
            href: href(overview.month, false),
            label: "Ativos",
            active: !filters.arquivados,
          },
          {
            href: href(overview.month, true),
            label: "Arquivados",
            active: filters.arquivados,
          },
        ]}
      />

      {overview.budgets.length === 0 ? (
        filters.arquivados ? (
          <EmptyState
            icon={PiggyBankIcon}
            title="Nenhum orçamento arquivado"
            description="Os orçamentos que você arquivar aparecem aqui e podem ser reativados."
          />
        ) : (
          <EmptyState
            icon={PiggyBankIcon}
            title={`Nenhum orçamento para ${overview.label}`}
            description={
              canManage
                ? "Defina um limite mensal por categoria para acompanhar os gastos da família."
                : "Peça a quem administra a família para criar os orçamentos."
            }
            action={
              canManage ? (
                <Link href="/orcamentos/novo" className={buttonVariants()}>
                  <PlusIcon aria-hidden="true" data-icon="inline-start" />
                  Criar orçamento
                </Link>
              ) : undefined
            }
          />
        )
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {overview.budgets.map((budget) => (
            <li key={budget.id} className="min-w-0">
              <BudgetCard budget={budget} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
