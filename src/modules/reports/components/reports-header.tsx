import { PageHeader } from "@/components/shared/page-header";
import { today } from "@/lib/dates";
import type { ReportPeriod } from "@/modules/reports/types";

import { ReportPeriodFilter } from "./report-period-filter";
import { ReportsSubNav } from "./reports-sub-nav";

type ReportsHeaderProps = {
  period: ReportPeriod;
  description: string;
  /** Mostra o período anterior (só onde há comparação: visão geral e categorias). */
  withComparison?: boolean;
};

/** Topo comum das telas de relatório: título, período na URL, seções e o período em texto. */
export function ReportsHeader({
  period,
  description,
  withComparison = false,
}: ReportsHeaderProps) {
  return (
    <>
      <PageHeader
        title="Relatórios"
        description={description}
        actions={
          <ReportPeriodFilter
            preset={period.preset}
            from={period.from}
            to={period.to}
            today={today()}
          />
        }
      />
      <ReportsSubNav />
      <p className="text-muted-foreground -mt-3 text-sm">
        Período: <span data-testid="periodo-atual">{period.label}</span>
        {withComparison ? (
          <>
            <span aria-hidden="true"> · </span>
            Comparado com{" "}
            <span data-testid="periodo-anterior">{period.previousLabel}</span>
          </>
        ) : null}
      </p>
    </>
  );
}
