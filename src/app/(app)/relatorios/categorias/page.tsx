import { TagIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { ReportCategoryChart } from "@/modules/reports/components/report-category-chart";
import { ReportCategoryTable } from "@/modules/reports/components/report-category-table";
import { ReportCategoryTypeSwitch } from "@/modules/reports/components/report-category-type-switch";
import { ReportsHeader } from "@/modules/reports/components/reports-header";
import { getCategoryReport } from "@/modules/reports/queries";
import { categoryReportSchema } from "@/modules/reports/schemas";

export const metadata: Metadata = { title: "Relatório por categoria" };

type CategoryReportPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CategoryReportPage({
  searchParams,
}: CategoryReportPageProps) {
  const filters = categoryReportSchema.parse(await searchParams);
  const report = await getCategoryReport(filters);
  const { period, breakdown, rows, type } = report;
  const noun = type === "income" ? "receitas" : "despesas";

  return (
    <div className="flex flex-col gap-6">
      <ReportsHeader
        period={period}
        withComparison
        description="Quanto cada categoria somou no período, comparado com o período anterior."
      />
      <ReportCategoryTypeSwitch value={filters.tipo} />

      <ReportCategoryChart
        breakdown={breakdown}
        periodLabel={period.label}
        type={type}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={TagIcon}
          title={`Sem ${noun} por categoria`}
          description={`Nenhuma categoria teve ${noun} em ${period.label} nem em ${period.previousLabel}. Escolha outro período.`}
        />
      ) : (
        <section
          aria-labelledby="categorias-comparacao"
          className="flex flex-col gap-3"
        >
          <h2 id="categorias-comparacao" className="text-base font-semibold">
            Comparação com o período anterior
          </h2>
          <ReportCategoryTable
            rows={rows}
            periodLabel={period.label}
            previousLabel={period.previousLabel}
            type={type}
          />
        </section>
      )}
    </div>
  );
}
