import { ChartCard } from "@/components/charts/chart-card";
import { LazyCashFlowBarChart } from "@/components/charts/lazy";
import { formatBRL } from "@/lib/money";
import type { CashFlowMonth } from "@/modules/reports/types";

type ReportCashFlowChartProps = {
  months: CashFlowMonth[];
  periodLabel: string;
};

/** Evolução mensal do período: receitas, despesas e resultado de cada mês que o período toca. */
export function ReportCashFlowChart({
  months,
  periodLabel,
}: ReportCashFlowChartProps) {
  const isEmpty = months.every(
    (month) => month.income === 0 && month.expense === 0,
  );
  const summary = months
    .map(
      (month) =>
        `${month.longLabel}: receitas ${formatBRL(month.income)}, despesas ${formatBRL(month.expense)}`,
    )
    .join("; ");

  return (
    <ChartCard
      title="Receitas x despesas por mês"
      period={periodLabel}
      isEmpty={isEmpty}
      empty={{
        title: `Sem movimentações em ${periodLabel}`,
        description:
          "Receitas e despesas efetivadas de cada mês aparecem aqui assim que você registrar lançamentos.",
      }}
      table={{
        caption: `Receitas e despesas por mês em ${periodLabel}`,
        columns: [
          { id: "mes", header: "Mês" },
          { id: "receitas", header: "Receitas", align: "end" },
          { id: "despesas", header: "Despesas", align: "end" },
          { id: "resultado", header: "Resultado", align: "end" },
        ],
        rows: months.map((month) => ({
          key: month.month,
          cells: [
            month.longLabel,
            formatBRL(month.income),
            formatBRL(month.expense),
            formatBRL(month.result),
          ],
        })),
      }}
    >
      <LazyCashFlowBarChart
        data={months.map((month) => ({
          key: month.month,
          label: month.label,
          income: month.income,
          expense: month.expense,
        }))}
        ariaLabel={`Receitas e despesas por mês em ${periodLabel}. ${summary}.`}
      />
    </ChartCard>
  );
}
