import { ChartCard } from "@/components/charts/chart-card";
import { CHART_GREEN_SCALE } from "@/components/charts/colors";
import { formatPercent } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import type { CommitmentDashboard } from "@/modules/reports/types";

import {
  ClickableCategoryLegend,
  ClickableDonutChart,
} from "./commitment-clickable-charts";
import { DetailTrigger } from "./commitment-detail-provider";

type CommitmentByCategoryCardProps = {
  breakdown: CommitmentDashboard["byCategory"];
  periodLabel: string;
};

function sliceName(slice: { name: string; archived: boolean }): string {
  return slice.archived ? `${slice.name} (arquivada)` : slice.name;
}

/** Despesas comprometidas no horizonte, por categoria (rosca + legenda + tabela). */
export function CommitmentByCategoryCard({
  breakdown,
  periodLabel,
}: CommitmentByCategoryCardProps) {
  const { rows, total } = breakdown;
  // Dashboard em tons de verde: a cor da categoria é trocada pela escala verde (relatórios não mudam).
  const slices = breakdown.slices.map((slice, i) => ({
    ...slice,
    color: CHART_GREEN_SCALE[i % CHART_GREEN_SCALE.length] ?? "chart-green-1",
  }));
  const summary = slices
    .map(
      (slice) =>
        `${sliceName(slice)} ${formatBRL(slice.amount)}, ${formatPercent(slice.percent)}`,
    )
    .join("; ");

  return (
    <ChartCard
      title="Comprometimento por categoria"
      period={periodLabel}
      isEmpty={slices.length === 0}
      empty={{
        title: "Nenhum compromisso por categoria neste período",
        description:
          "Quando houver contas a pagar ou despesas recorrentes à frente, elas aparecem aqui agrupadas por categoria.",
      }}
      table={{
        caption: `Comprometimento por categoria de ${periodLabel}`,
        columns: [
          { id: "categoria", header: "Categoria" },
          { id: "valor", header: "Valor", align: "end" },
          { id: "percentual", header: "%", align: "end" },
        ],
        rows: rows.map((row) => ({
          key: row.key,
          cells: [
            row.amount > 0 ? (
              <DetailTrigger
                key="categoria"
                view={{ kind: "category", key: row.key }}
                aria-label={`Ver itens de ${sliceName(row)}`}
                className="min-h-10 text-left underline underline-offset-2"
              >
                {sliceName(row)}
              </DetailTrigger>
            ) : (
              sliceName(row)
            ),
            formatBRL(row.amount),
            row.amount > 0 ? formatPercent(row.percent) : "—",
          ],
        })),
      }}
      legend={
        <ClickableCategoryLegend
          aria-label="Legenda: comprometimento por categoria"
          items={slices.map((slice) => ({
            key: slice.key,
            label: sliceName(slice),
            color: slice.color,
            value: formatPercent(slice.percent),
          }))}
        />
      }
    >
      <ClickableDonutChart
        data={slices.map((slice) => ({
          key: slice.key,
          label: sliceName(slice),
          value: slice.amount,
          color: slice.color,
        }))}
        centerLabel="Total"
        centerValue={formatBRL(total)}
        ariaLabel={`Comprometimento por categoria de ${periodLabel}. Total ${formatBRL(total)}. ${summary}.`}
      />
    </ChartCard>
  );
}
