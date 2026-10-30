"use client";

import {
  ChartLegend,
  type ChartLegendProps,
} from "@/components/charts/chart-legend";
import {
  LazyCommitmentBarChart,
  LazyDonutChart,
} from "@/components/charts/lazy";
import type { CommitmentBarChartProps } from "@/components/charts/commitment-bar-chart";
import type { DonutChartProps } from "@/components/charts/donut-chart";
import { Button } from "@/components/ui/button";
import type { ISODate } from "@/lib/dates";

import { useCommitmentDetail } from "./commitment-detail-provider";

/** Barras e pontos do gráfico mensal abrem o detalhamento do mês (sem provedor, o gráfico segue só de leitura). */
export function ClickableCommitmentBarChart(props: CommitmentBarChartProps) {
  const detail = useCommitmentDetail();
  return (
    <LazyCommitmentBarChart
      {...props}
      onSelect={
        detail
          ? (key) => detail.open({ kind: "month", month: key as ISODate })
          : undefined
      }
    />
  );
}

export function ClickableDonutChart(props: DonutChartProps) {
  const detail = useCommitmentDetail();
  return (
    <LazyDonutChart
      {...props}
      onSelect={
        detail ? (key) => detail.open({ kind: "category", key }) : undefined
      }
    />
  );
}

/** Legenda por categoria com um botão por item: é o caminho de teclado para o detalhe da fatia. */
export function ClickableCategoryLegend(
  props: Omit<ChartLegendProps, "onSelect" | "selectLabel">,
) {
  const detail = useCommitmentDetail();
  return (
    <ChartLegend
      {...props}
      onSelect={
        detail ? (key) => detail.open({ kind: "category", key }) : undefined
      }
      selectLabel={(item) => `Ver itens de ${item.label}`}
    />
  );
}

/** Fileira de botões de mês: barras SVG não são navegáveis por teclado, então o detalhe também sai daqui. */
export function MonthDetailButtons({
  months,
}: {
  months: { month: ISODate; label: string; longLabel: string }[];
}) {
  const detail = useCommitmentDetail();
  if (!detail || months.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Detalhar mês"
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-muted-foreground text-sm">Detalhar mês:</span>
      {months.map((m) => (
        <Button
          key={m.month}
          type="button"
          variant="outline"
          size="sm"
          className="min-h-10 sm:min-h-8"
          aria-label={`Ver detalhes de ${m.longLabel}`}
          onClick={() => detail.open({ kind: "month", month: m.month })}
        >
          {m.label}
        </Button>
      ))}
    </div>
  );
}
