import type { Metadata } from "next";

import { can } from "@/modules/family/permissions";
import { ReportAccounts } from "@/modules/reports/components/report-accounts";
import { ReportsHeader } from "@/modules/reports/components/reports-header";
import { getAccountReport } from "@/modules/reports/queries";
import { reportFiltersSchema } from "@/modules/reports/schemas";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Relatório por conta" };

export default async function AccountReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = reportFiltersSchema.parse(await searchParams);
  const [membership, report] = await Promise.all([
    requireMembership(),
    getAccountReport(filters),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ReportsHeader
        period={report.period}
        description="Entradas, saídas e saldo de cada conta no período."
      />
      <ReportAccounts
        report={report}
        canManageAccounts={can(membership.role, "account.manage")}
      />
    </div>
  );
}
