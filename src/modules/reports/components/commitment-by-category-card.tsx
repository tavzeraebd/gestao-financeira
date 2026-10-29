import { ChartCard } from "@/components/charts/chart-card";
import { ChartLegend } from "@/components/charts/chart-legend";
import { LazyDonutChart } from "@/components/charts/lazy";
import { formatPercent } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import type {
  CategorySlice,
  CommitmentDashboard,
} from "@/modules/reports/types";

type CommitmentByCategoryCardProps = {
  breakdown: CommitmentDashboard["byCategory"];
  periodLabel: string;
};

function sliceName(slice: CategorySlice): string {
  return slice.archived ? `${slice.name} (arquivada)` : slice.name;
}

/** Despesas comprometidas no horizonte, por categoria (rosca + legenda + tabela). */
export function CommitmentByCategoryCard({
  breakdown,
  periodLabel,
}: CommitmentByCategoryCardProps) {
  const { slices, rows, total } = breakdown;
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
            sliceName(row),
            formatBRL(row.amount),
            row.amount > 0 ? formatPercent(row.percent) : "—",
          ],
        })),
      }}
      legend={
        <ChartLegend
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
      <LazyDonutChart
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
