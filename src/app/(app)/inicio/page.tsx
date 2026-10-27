import { ArrowLeftRightIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { buttonVariants } from "@/components/ui/button";
import { today } from "@/lib/dates";
import { can } from "@/modules/family/permissions";
import { getMyProfile } from "@/modules/profile/queries";
import { BalanceCard } from "@/modules/reports/components/balance-card";
import { CashFlowCard } from "@/modules/reports/components/cash-flow-card";
import { DashboardPeriodFilter } from "@/modules/reports/components/dashboard-period-filter";
import { ExpenseByCategoryCard } from "@/modules/reports/components/expense-by-category-card";
import { GoalsCard } from "@/modules/reports/components/goals-card";
import { RecentTransactionsCard } from "@/modules/reports/components/recent-transactions-card";
import { SummaryIndicators } from "@/modules/reports/components/summary-indicators";
import { UpcomingBillsCard } from "@/modules/reports/components/upcoming-bills-card";
import { getDashboard } from "@/modules/reports/queries";
import { dashboardFiltersSchema } from "@/modules/reports/schemas";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Início" };

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  // Filtros da URL sempre passam pelo schema (tolerante); nunca crus.
  const filters = dashboardFiltersSchema.parse(await searchParams);
  const [membership, profile, dashboard] = await Promise.all([
    requireMembership(),
    getMyProfile(),
    getDashboard(filters),
  ]);
  const firstName = profile.displayName.trim().split(/\s+/)[0] ?? "";

  if (dashboard.state === "no_accounts") {
    const canManageAccounts = can(membership.role, "account.manage");
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={`Olá, ${firstName}!`}
          description="Comece pelas contas e lançamentos da sua família."
        />
        <EmptyState
          icon={WalletIcon}
          title="Cadastre sua primeira conta"
          description={
            canManageAccounts
              ? "Informe a conta onde o dinheiro está hoje e o saldo dela. É o primeiro passo para registrar os lançamentos da família."
              : "Peça a quem administra a família para cadastrar a primeira conta. Depois disso você já pode registrar lançamentos."
          }
          action={
            canManageAccounts ? (
              <Link href="/contas/nova" className={buttonVariants()}>
                Cadastrar conta
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  const { period } = dashboard;
  // Na ordem do celular (tela 10); em telas largas cada bloco ocupa a posição da tela 2.
  const cell = "*:data-[slot=card]:h-full";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Olá, ${firstName}!`}
        description="Aqui está um resumo das finanças da sua família."
        actions={
          <DashboardPeriodFilter
            preset={period.preset}
            from={period.from}
            to={period.to}
            today={today()}
          />
        }
      />
      <p className="text-muted-foreground -mt-3 text-sm">
        Período: <span data-testid="periodo-atual">{period.label}</span>
      </p>

      {dashboard.state === "no_transactions" ? (
        <EmptyState
          icon={ArrowLeftRightIcon}
          title="Registre seu primeiro lançamento"
          description="Anote uma receita, uma despesa ou uma transferência entre contas. Os gráficos aparecem assim que houver movimento."
          action={
            <Link href="/transacoes/nova" className={buttonVariants()}>
              Nova transação
            </Link>
          }
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${cell} lg:col-start-1 lg:row-start-1`}>
          <BalanceCard
            consolidated={dashboard.consolidated}
            previousAsOf={dashboard.previousAsOf}
            openCardDebt={dashboard.openCardDebt}
            hasCreditCards={dashboard.hasCreditCards}
          />
        </div>
        <div className="lg:col-start-2 lg:row-start-1">
          <SummaryIndicators
            income={dashboard.income}
            expense={dashboard.expense}
            result={dashboard.result}
            previousLabel={period.previousLabel}
          />
        </div>
        <div className={`${cell} lg:col-start-3 lg:row-start-3`}>
          <GoalsCard
            goals={dashboard.goals}
            canManage={can(membership.role, "goal.manage")}
          />
        </div>
        <div className={`${cell} lg:col-start-3 lg:row-start-2`}>
          <UpcomingBillsCard items={dashboard.upcomingBills} />
        </div>
        <div className={`${cell} lg:col-start-3 lg:row-start-1`}>
          <ExpenseByCategoryCard
            breakdown={dashboard.expenseByCategory}
            periodLabel={period.label}
          />
        </div>
        <div className={`${cell} lg:col-span-2 lg:col-start-1 lg:row-start-2`}>
          <CashFlowCard cashFlow={dashboard.cashFlow} />
        </div>
        <div className={`${cell} lg:col-span-2 lg:col-start-1 lg:row-start-3`}>
          <RecentTransactionsCard
            items={dashboard.recentTransactions}
            from={period.from}
            to={period.to}
            periodLabel={period.label}
          />
        </div>
      </div>
    </div>
  );
}
