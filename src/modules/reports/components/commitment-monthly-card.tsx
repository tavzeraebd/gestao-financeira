import { ChartCard } from "@/components/charts/chart-card";
import { LazyCommitmentBarChart } from "@/components/charts/lazy";
import { formatPercent } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import type { CommitmentOverview } from "@/modules/reports/types";

/**
 * Barras empilhadas por mês (contas em aberto + recorrências), linha da receita esperada e % de
 * comprometimento. Sem receita esperada, só os valores.
 */
export function CommitmentMonthlyCard({
  overview,
}: {
  overview: CommitmentOverview;
}) {
  const { months, hasIncome, label } = overview;
  const summary = months
    .map((m) => {
      const base = `${m.longLabel}: comprometido ${formatBRL(m.committed)}`;
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
    { id: "comprometido", header: "Comprometido", align: "end" as const },
    ...(hasIncome
      ? [
          { id: "receita", header: "Receita esperada", align: "end" as const },
          { id: "percentual", header: "% da receita", align: "end" as const },
        ]
      : []),
  ];

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
            m.longLabel,
            formatBRL(m.pending),
            formatBRL(m.recurring),
            formatBRL(m.committed),
            ...(hasIncome
              ? [
                  formatBRL(m.income),
                  m.percent === null ? "—" : formatPercent(m.percent),
                ]
              : []),
          ],
        })),
      }}
    >
      <LazyCommitmentBarChart
        data={months.map((m) => ({
          key: m.month,
          label: m.label,
          pending: m.pending,
          recurring: m.recurring,
          income: m.income,
          percent: m.percent,
        }))}
        showIncome={hasIncome}
        ariaLabel={`Comprometimento mensal de ${label}. ${summary}.`}
      />
    </ChartCard>
  );
}
