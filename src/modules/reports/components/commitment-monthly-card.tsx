import { ChartCard } from "@/components/charts/chart-card";
import { formatPercent } from "@/lib/format";
import { asCents, formatBRL } from "@/lib/money";
import { TriangleAlertIcon } from "lucide-react";

import type {
  CommitmentOverview,
  ProjectedBalance,
} from "@/modules/reports/types";

import {
  ClickableCommitmentBarChart,
  MonthDetailButtons,
} from "./commitment-clickable-charts";
import { DetailTrigger } from "./commitment-detail-provider";

/**
 * Barras empilhadas por mês (contas em aberto + recorrências + desconto em folha), linha da receita esperada e % de
 * comprometimento. Sem receita esperada, só os valores.
 */
export function CommitmentMonthlyCard({
  overview,
  projection,
}: {
  overview: CommitmentOverview;
  projection: ProjectedBalance;
}) {
  const { months, hasIncome, label } = overview;
  const projectedBy = new Map(projection.months.map((p) => [p.month, p]));
  const summary = months
    .map((m) => {
      const p = projectedBy.get(m.month);
      const base = `${m.longLabel}: comprometido ${formatBRL(m.committed)}, saldo projetado ${p ? formatBRL(p.balance) : "—"}${p?.negative ? " (negativo)" : ""}`;
      if (!hasIncome) return base;
      return m.percent === null
        ? `${base}, sem receita esperada`
        : `${base}, receita esperada ${formatBRL(m.income)}, ${formatPercent(m.percent)} comprometido`;
    })
    .join("; ");

  const columns = [
    { id: "mes", header: "Mês" },
    { id: "abertas", header: "Contas em aberto", align: "end" as const },
    { id: "recorrencias", header: "Recorrências", align: "end" as const },
    { id: "folha", header: "Desconto em folha", align: "end" as const },
    { id: "comprometido", header: "Comprometido", align: "end" as const },
    ...(hasIncome
      ? [
          { id: "receita", header: "Receita esperada", align: "end" as const },
          { id: "percentual", header: "% da receita", align: "end" as const },
        ]
      : []),
    { id: "saldo", header: "Saldo projetado", align: "end" as const },
  ];
  const negativeMonths = projection.months.filter((p) => p.negative);

  return (
    <ChartCard
      title="Comprometimento mensal"
      period={label}
      isEmpty={overview.totalCommitted === 0}
      empty={{
        title: "Nenhum compromisso em aberto neste período",
        description:
          "As contas a pagar em aberto e as despesas recorrentes dos próximos meses aparecem aqui, mês a mês.",
      }}
      table={{
        caption: `Comprometimento mensal de ${label}`,
        columns,
        rows: months.map((m) => ({
          key: m.month,
          cells: [
            <DetailTrigger
              key="mes"
              view={{ kind: "month", month: m.month }}
              aria-label={`Ver detalhes de ${m.longLabel}`}
              className="min-h-10 text-left underline underline-offset-2"
            >
              {m.longLabel}
            </DetailTrigger>,
            formatBRL(m.pending),
            formatBRL(m.recurring),
            formatBRL(m.payroll),
            formatBRL(m.committed),
            ...(hasIncome
              ? [
                  formatBRL(m.income),
                  m.percent === null ? "—" : formatPercent(m.percent),
                ]
              : []),
            (() => {
              const p = projectedBy.get(m.month);
              if (!p) return "—";
              return p.negative
                ? `${formatBRL(p.balance)} (negativo)`
                : formatBRL(p.balance);
            })(),
          ],
        })),
      }}
    >
      <ClickableCommitmentBarChart
        data={months.map((m) => ({
          key: m.month,
          label: m.label,
          pending: m.pending,
          recurring: m.recurring,
          payroll: m.payroll,
          income: m.income,
          percent: m.percent,
          projected: projectedBy.get(m.month)?.balance ?? asCents(0),
        }))}
        showIncome={hasIncome}
        ariaLabel={`Comprometimento mensal de ${label}. ${summary}.`}
      />
      <div className="mt-3">
        <MonthDetailButtons
          months={months.map((m) => ({
            month: m.month,
            label: m.label,
            longLabel: m.longLabel,
          }))}
        />
      </div>
      {negativeMonths.length > 0 ? (
        <p
          role="status"
          data-testid="alerta-saldo-negativo"
          className="text-destructive mt-3 flex items-start gap-2 text-sm font-medium"
        >
          <TriangleAlertIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            Saldo projetado negativo em{" "}
            {negativeMonths.map((p) => p.longLabel).join(", ")}.
          </span>
        </p>
      ) : null}
    </ChartCard>
  );
}
