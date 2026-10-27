import Link from "next/link";

import { ChartCard } from "@/components/charts/chart-card";
import { ChartLegend } from "@/components/charts/chart-legend";
import { LazyDonutChart } from "@/components/charts/lazy";
import { buttonVariants } from "@/components/ui/button";
import { formatPercent } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import type { CategorySlice, Dashboard } from "@/modules/reports/types";

import { IndicatorInfo } from "./indicator-info";

type ExpenseByCategoryCardProps = {
  breakdown: Dashboard["expenseByCategory"];
  periodLabel: string;
};

function sliceName(slice: CategorySlice): string {
  return slice.archived ? `${slice.name} (arquivada)` : slice.name;
}

export function ExpenseByCategoryCard({
  breakdown,
  periodLabel,
}: ExpenseByCategoryCardProps) {
  const { slices, negative, rows, total } = breakdown;
  const summary = slices
    .map(
      (slice) =>
        `${sliceName(slice)} ${formatBRL(slice.amount)}, ${formatPercent(slice.percent)}`,
    )
    .join("; ");

  return (
    <ChartCard
      title="Categorias de gastos"
      period={periodLabel}
      info={<IndicatorInfo id="expenseByCategory" />}
      isEmpty={slices.length === 0}
      empty={{
        title: `Sem despesas em ${periodLabel}`,
        description:
          "Quando você registrar despesas efetivadas neste período, elas aparecem aqui por categoria.",
        action: (
          <Link href="/transacoes/nova" className={buttonVariants()}>
            Nova transação
          </Link>
        ),
      }}
      table={{
        caption: `Despesas por categoria em ${periodLabel}`,
        columns: [
          { id: "categoria", header: "Categoria" },
          { id: "valor", header: "Valor", align: "end" },
          { id: "percentual", header: "%", align: "end" },
        ],
        rows: rows.map((row) => ({
          key: row.key,
          cells: [
            row.percent === 0 && row.amount < 0
              ? `${sliceName(row)} (estorno)`
              : sliceName(row),
            formatBRL(row.amount),
            row.amount > 0 ? formatPercent(row.percent) : "—",
          ],
        })),
      }}
      legend={
        <div className="flex flex-col gap-2">
          <ChartLegend
            aria-label="Legenda: categorias de gastos"
            items={slices.map((slice) => ({
              key: slice.key,
              label: sliceName(slice),
              color: slice.color,
              value: formatPercent(slice.percent),
            }))}
          />
          {negative.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              Estornos maiores que os gastos no período:{" "}
              {negative.map((slice) => sliceName(slice)).join(", ")}. Veja os
              valores em &quot;Ver tabela&quot;.
            </p>
          ) : null}
        </div>
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
        ariaLabel={`Despesas por categoria em ${periodLabel}. Total ${formatBRL(total)}. ${summary}.`}
      />
    </ChartCard>
  );
}
