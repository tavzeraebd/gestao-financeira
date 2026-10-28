import { ArrowLeftRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { ReportCashFlowChart } from "@/modules/reports/components/report-cash-flow-chart";
import { ReportCategoryChart } from "@/modules/reports/components/report-category-chart";
import { ReportSummary } from "@/modules/reports/components/report-summary";
import { ReportsHeader } from "@/modules/reports/components/reports-header";
import { getReportOverview } from "@/modules/reports/queries";
import { reportFiltersSchema } from "@/modules/reports/schemas";

export const metadata: Metadata = { title: "Relatórios" };

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Mantém o período escolhido ao abrir os detalhes por categoria. */
function periodQuery(search: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const key of ["periodo", "de", "ate"]) {
    const value = search[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  }
  return params.toString();
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const search = await searchParams;
  // Filtros da URL sempre passam pelo schema (tolerante); nunca crus.
  const overview = await getReportOverview(reportFiltersSchema.parse(search));
  const { period, summary, cashFlow, expenseByCategory } = overview;
  const query = periodQuery(search);

  const isEmpty =
    summary.income.current === 0 &&
    summary.expense.current === 0 &&
    expenseByCategory.slices.length === 0 &&
    cashFlow.every((month) => month.income === 0 && month.expense === 0);

  return (
    <div className="flex flex-col gap-6">
      <ReportsHeader
        period={period}
        withComparison
        description="Receitas, despesas e evolução das finanças da família no período."
      />

      {isEmpty ? (
        <EmptyState
          icon={ArrowLeftRightIcon}
          title={`Sem movimentações em ${period.label}`}
          description="Registre receitas e despesas ou escolha outro período para ver os relatórios."
          action={
            <Link href="/transacoes/nova" className={buttonVariants()}>
              Nova transação
            </Link>
          }
        />
      ) : (
        <>
          <ReportSummary
            summary={summary}
            previousLabel={period.previousLabel}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ReportCategoryChart
              breakdown={expenseByCategory}
              periodLabel={period.label}
              type="expense"
              detailsHref={`/relatorios/categorias${query ? `?${query}` : ""}`}
            />
            <ReportCashFlowChart months={cashFlow} periodLabel={period.label} />
          </div>
        </>
      )}
    </div>
  );
}
