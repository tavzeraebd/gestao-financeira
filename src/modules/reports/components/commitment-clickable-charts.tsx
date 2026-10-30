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
