import { PiggyBankIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { CategoryIcon } from "@/components/shared/category-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { Money } from "@/components/shared/money";
import { ProgressMeter } from "@/components/shared/progress-meter";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  percentText,
  STATUS_VIEW,
} from "@/modules/budgets/components/budget-card";
import {
  ALL_EXPENSES_LABEL,
  BUDGET_STATUS_LABELS,
} from "@/modules/budgets/constants";
import type { BudgetReport, BudgetReportRow } from "@/modules/reports/types";

function BudgetRow({ row }: { row: BudgetReportRow }) {
  const name = row.category?.name ?? ALL_EXPENSES_LABEL;
  const view = STATUS_VIEW[row.status];
  const StatusIcon = view.icon;
  return (
    <TableRow data-testid="linha-orcamento">
      <TableCell>
        <span className="flex min-w-0 flex-col items-start gap-1.5">
          <span className="flex min-w-0 items-center gap-2">
            {row.category ? (
              <CategoryIcon
                icon={row.category.icon}
                color={row.category.color}
                size="sm"
              />
            ) : null}
            <span className="min-w-0 font-medium break-words">{name}</span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant={view.variant}>
              <StatusIcon aria-hidden="true" />
              {BUDGET_STATUS_LABELS[row.status]}
            </Badge>
            {row.category?.archived ? (
              <Badge variant="outline">Categoria arquivada</Badge>
            ) : null}
          </span>
        </span>
      </TableCell>
      <TableCell className="text-right">
        <Money cents={row.limit} />
      </TableCell>
      <TableCell className="text-right">
        <Money cents={row.spent} />
      </TableCell>
      <TableCell className="min-w-28">
        <span className="flex flex-col gap-1.5">
          <span className="text-right font-semibold tabular-nums">
            {percentText(row.percent)}
          </span>
          <ProgressMeter
            value={row.percent}
            tone={view.tone}
            label={`Uso do orçamento ${name}`}
            valueText={
              row.percent === null
                ? "Sem gastos no mês"
                : `${percentText(row.percent)} do limite`
            }
          />
        </span>
      </TableCell>
    </TableRow>
  );
}

type ReportBudgetsProps = {
  report: BudgetReport;
  /** Owner/admin recebem o atalho para criar o primeiro orçamento. */
  canManage: boolean;
};

/** Orçado × realizado por mês do período (mais recente primeiro). */
export function ReportBudgets({ report, canManage }: ReportBudgetsProps) {
  const hasRows = report.months.some((month) => month.rows.length > 0);

  if (!hasRows) {
    return (
      <EmptyState
        icon={PiggyBankIcon}
        title={`Nenhum orçamento em ${report.period.label}`}
        description={
          canManage
            ? "Defina um limite mensal por categoria para acompanhar o orçado e o realizado."
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
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {[...report.months].reverse().map((month) => (
        <Card key={month.month} data-testid="mes-orcamentos">
          <CardHeader>
            <h2 className="text-base font-semibold capitalize">
              {month.label}
            </h2>
          </CardHeader>
          <CardContent>
            {month.rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum orçamento vigente neste mês.
              </p>
            ) : (
              <Table>
                <TableCaption className="sr-only">
                  Orçado e realizado em {month.label}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Orçamento</TableHead>
                    <TableHead scope="col" className="text-right">
                      Limite
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Realizado
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      %
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {month.rows.map((row) => (
                    <BudgetRow key={row.budgetId} row={row} />
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
