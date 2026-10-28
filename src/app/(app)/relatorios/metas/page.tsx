import type { Metadata } from "next";

import { can } from "@/modules/family/permissions";
import { ReportGoals } from "@/modules/reports/components/report-goals";
import { ReportsHeader } from "@/modules/reports/components/reports-header";
import { getGoalReport } from "@/modules/reports/queries";
import { reportFiltersSchema } from "@/modules/reports/schemas";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Relatório de metas" };

export default async function GoalReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = reportFiltersSchema.parse(await searchParams);
  const [membership, report] = await Promise.all([
    requireMembership(),
    getGoalReport(filters),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ReportsHeader
        period={report.period}
        description="Progresso das metas e os aportes e retiradas do período."
      />
      <ReportGoals
        report={report}
        canManage={can(membership.role, "goal.manage")}
      />
    </div>
  );
}
