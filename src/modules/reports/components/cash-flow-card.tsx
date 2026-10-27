import { ChartCard } from "@/components/charts/chart-card";
import { LazyCashFlowBarChart } from "@/components/charts/lazy";
import { formatBRL } from "@/lib/money";
import type { Dashboard } from "@/modules/reports/types";

import { IndicatorInfo } from "./indicator-info";

export function CashFlowCard({
  cashFlow,
}: {
  cashFlow: Dashboard["cashFlow"];
}) {
  const { months } = cashFlow;
  const first = months[0];
  const last = months[months.length - 1];
  const period = first && last ? `${first.longLabel} a ${last.longLabel}` : "";
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
      title="Fluxo de caixa mensal"
      period={period}
      info={<IndicatorInfo id="cashFlow" />}
      isEmpty={isEmpty}
      empty={{
        title: "Sem movimentações nos últimos 6 meses",
        description:
          "Receitas e despesas efetivadas de cada mês aparecem aqui assim que você registrar lançamentos.",
      }}
      table={{
        caption: `Fluxo de caixa mensal de ${period}`,
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
        ariaLabel={`Fluxo de caixa mensal de ${period}. ${summary}.`}
      />
    </ChartCard>
  );
}
