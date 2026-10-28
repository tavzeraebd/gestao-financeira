import type { Metadata } from "next";

import { can } from "@/modules/family/permissions";
import { ReportBudgets } from "@/modules/reports/components/report-budgets";
import { ReportsHeader } from "@/modules/reports/components/reports-header";
import { getBudgetReport } from "@/modules/reports/queries";
import { reportFiltersSchema } from "@/modules/reports/schemas";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Relatório de orçamentos" };

export default async function BudgetReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = reportFiltersSchema.parse(await searchParams);
  const [membership, report] = await Promise.all([
    requireMembership(),
    getBudgetReport(filters),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ReportsHeader
        period={report.period}
        description="Limite e realizado de cada orçamento, mês a mês."
      />
      <ReportBudgets
        report={report}
        canManage={can(membership.role, "budget.manage")}
      />
    </div>
  );
}
