import type { Metadata } from "next";

import { ReportMembers } from "@/modules/reports/components/report-members";
import { ReportsHeader } from "@/modules/reports/components/reports-header";
import { getMemberReport } from "@/modules/reports/queries";
import { reportFiltersSchema } from "@/modules/reports/schemas";

export const metadata: Metadata = { title: "Relatório por integrante" };

export default async function MemberReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const report = await getMemberReport(
    reportFiltersSchema.parse(await searchParams),
  );

  return (
    <div className="flex flex-col gap-6">
      <ReportsHeader
        period={report.period}
        description="Quanto cada integrante da família gastou no período."
      />
      <ReportMembers report={report} />
    </div>
  );
}
