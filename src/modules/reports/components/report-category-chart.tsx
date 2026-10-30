import Link from "next/link";

import { ChartCard } from "@/components/charts/chart-card";
import { ChartLegend } from "@/components/charts/chart-legend";
import { LazyDonutChart } from "@/components/charts/lazy";
import { InfoHint } from "@/components/shared/info-hint";
import { buttonVariants } from "@/components/ui/button";
import { formatPercent } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import type { CategoryBreakdown, CategorySlice } from "@/modules/reports/types";

type ReportCategoryChartProps = {
  breakdown: CategoryBreakdown;
  periodLabel: string;
  type: "expense" | "income";
  /** Query string que mantém o período ao abrir os detalhes; sem ela, o link não aparece. */
  detailsHref?: string;
};

const COPY = {
  expense: {
    title: "Por categoria",
    noun: "Despesas",
    legend: "Legenda: categorias de gastos",
    emptyTitle: (period: string) => `Sem despesas em ${period}`,
    emptyDescription:
      "Quando você registrar despesas efetivadas neste período, elas aparecem aqui por categoria.",
  },
  income: {
    title: "Por categoria",
    noun: "Receitas",
    legend: "Legenda: categorias de receitas",
    emptyTitle: (period: string) => `Sem receitas em ${period}`,
    emptyDescription:
      "Quando você registrar receitas efetivadas neste período, elas aparecem aqui por categoria.",
  },
} as const;

function sliceName(slice: CategorySlice): string {
  return slice.archived ? `${slice.name} (arquivada)` : slice.name;
}

/** Rosca por categoria dos relatórios (despesas ou receitas), com legenda em % e "Ver tabela". */
export function ReportCategoryChart({
  breakdown,
  periodLabel,
  type,
  detailsHref,
}: ReportCategoryChartProps) {
  const copy = COPY[type];
  const { slices, negative, rows, total } = breakdown;
  const summary = slices
    .map(
      (slice) =>
        `${sliceName(slice)} ${formatBRL(slice.amount)}, ${formatPercent(slice.percent)}`,
    )
    .join("; ");

  return (
    <ChartCard
      title={copy.title}
      period={`${copy.noun} em ${periodLabel}`}
      isEmpty={slices.length === 0}
      empty={{
        title: copy.emptyTitle(periodLabel),
        description: copy.emptyDescription,
      }}
      table={{
        caption: `${copy.noun} por categoria em ${periodLabel}`,
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
        <div className="flex flex-col gap-3">
          <ChartLegend
            aria-label={copy.legend}
            items={slices.map((slice) => ({
              key: slice.key,
              label: sliceName(slice),
              color: slice.color,
              value: formatPercent(slice.percent),
            }))}
          />
          {negative.length > 0 ? (
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              Estornos acima dos valores
              <InfoHint label="estornos acima dos valores">
                Estornos maiores que os valores no período:{" "}
                {negative.map((slice) => sliceName(slice)).join(", ")}. Veja os
                valores em &quot;Ver tabela&quot;.
              </InfoHint>
            </p>
          ) : null}
          {detailsHref ? (
            <Link
              href={detailsHref}
              className={buttonVariants({
                variant: "outline",
                className: "self-start",
              })}
            >
              Ver detalhes
            </Link>
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
        ariaLabel={`${copy.noun} por categoria em ${periodLabel}. Total ${formatBRL(total)}. ${summary}.`}
      />
    </ChartCard>
  );
}
