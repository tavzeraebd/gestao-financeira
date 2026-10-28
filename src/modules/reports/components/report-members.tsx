import { ChartCard } from "@/components/charts/chart-card";
import { LazyHorizontalBarChart } from "@/components/charts/lazy";
import { Money } from "@/components/shared/money";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPercent } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import type { MemberReport, MemberReportRow } from "@/modules/reports/types";

export const MEMBER_REPORT_NOTE =
  "Despesas divididas entram pela parte de cada um; sem divisão, pelo responsável; sem responsável, em Família.";

export const NO_RESPONSIBLE_LABEL = "Família (sem responsável)";

function memberName(row: MemberReportRow): string {
  return row.member?.displayName ?? NO_RESPONSIBLE_LABEL;
}

function percentText(row: MemberReportRow): string {
  return row.percent === null ? "—" : formatPercent(row.percent);
}

export function ReportMembers({ report }: { report: MemberReport }) {
  const { rows, total, period } = report;
  const isEmpty = rows.length === 0 || total === 0;
  const summary = rows
    .map((row) => `${memberName(row)}: ${formatBRL(row.amount)}`)
    .join("; ");

  return (
    <div className="flex flex-col gap-6">
      <ChartCard
        title="Despesas por integrante"
        period={period.label}
        isEmpty={isEmpty}
        empty={{
          title: `Sem despesas em ${period.label}`,
          description:
            "Quando houver despesas efetivadas neste período, elas aparecem aqui por integrante.",
        }}
        table={{
          caption: `Despesas por integrante em ${period.label}`,
          columns: [
            { id: "integrante", header: "Integrante" },
            { id: "despesas", header: "Despesas", align: "end" },
            { id: "percentual", header: "%", align: "end" },
          ],
          rows: rows.map((row) => ({
            key: row.member?.id ?? "sem-responsavel",
            cells: [memberName(row), formatBRL(row.amount), percentText(row)],
          })),
        }}
      >
        <LazyHorizontalBarChart
          data={rows.map((row) => ({
            key: row.member?.id ?? "sem-responsavel",
            label: memberName(row),
            value: row.amount,
            color: "chart-expense",
          }))}
          ariaLabel={`Despesas por integrante em ${period.label}. Total ${formatBRL(total)}. ${summary}.`}
        />
      </ChartCard>

      {isEmpty ? null : (
        <Table>
          <TableCaption className="sr-only">
            Despesas por integrante em {period.label}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Integrante</TableHead>
              <TableHead scope="col" className="text-right">
                Despesas
              </TableHead>
              <TableHead scope="col" className="text-right">
                %
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.member?.id ?? "sem-responsavel"}
                data-testid="linha-integrante"
              >
                <TableCell className="break-words">{memberName(row)}</TableCell>
                <TableCell className="text-right">
                  <Money cents={row.amount} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {percentText(row)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow data-testid="total-integrantes">
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right font-semibold">
                <Money cents={total} />
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      <p
        className="text-muted-foreground text-sm"
        data-testid="nota-integrantes"
      >
        {MEMBER_REPORT_NOTE}
      </p>
    </div>
  );
}
