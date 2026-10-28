"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

import { formatBRL, type Cents } from "@/lib/money";

import { chartColorVar, type ChartColor } from "./colors";
import { useReducedMotion } from "./use-reduced-motion";

export type HorizontalBarDatum = {
  key: string;
  label: string;
  value: Cents;
  color: ChartColor;
};

export type HorizontalBarChartProps = {
  data: HorizontalBarDatum[];
  ariaLabel: string;
};

const ROW_HEIGHT = 40;
const MIN_HEIGHT = 120;
const AXIS_HEIGHT = 32;
const LABEL_LIMIT = 16;

const compactBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

/** Rótulo do eixo Y: o nome inteiro fica no tooltip, na tabela e no `aria-label`. */
function shortLabel(label: string): string {
  return label.length > LABEL_LIMIT
    ? `${label.slice(0, LABEL_LIMIT - 1)}…`
    : label;
}

type Row = {
  key: string;
  label: string;
  cents: Cents;
  reais: number;
  fill: string;
};

function HorizontalBarTooltip({ active, payload }: TooltipContentProps) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{row.label}</p>
      <p className="text-muted-foreground tabular-nums">
        {formatBRL(row.cents)}
      </p>
    </div>
  );
}

/**
 * Barras horizontais com o nome no eixo Y e linha do zero quando há valores negativos.
 * A cor vem sempre de `chartColorVar`; os valores exatos ficam no tooltip, no `aria-label`
 * e na tabela do `ChartCard`.
 */
export default function HorizontalBarChart({
  data,
  ariaLabel,
}: HorizontalBarChartProps) {
  const reduceMotion = useReducedMotion();
  // Cents -> reais só para a escala do SVG; a exibição usa formatBRL.
  const rows: Row[] = data.map((d) => ({
    key: d.key,
    label: d.label,
    cents: d.value,
    reais: d.value / 100,
    fill: chartColorVar(d.color),
  }));
  const hasNegative = rows.some((row) => row.cents < 0);
  const height = Math.max(MIN_HEIGHT, rows.length * ROW_HEIGHT + AXIS_HEIGHT);

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="w-full"
      style={{ height }}
    >
      <ResponsiveContainer
        width="100%"
        height={height}
        initialDimension={{ width: 480, height }}
      >
        <BarChart
          data={rows}
          layout="vertical"
          accessibilityLayer={false}
          margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={TICK}
            tickFormatter={(v: number) => compactBRL.format(v)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={112}
            tickLine={false}
            axisLine={false}
            tick={TICK}
            tickFormatter={(v: string) => shortLabel(v)}
            interval={0}
          />
          <Tooltip
            content={HorizontalBarTooltip}
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          />
          {hasNegative ? (
            <ReferenceLine x={0} stroke="var(--muted-foreground)" />
          ) : null}
          <Bar
            dataKey="reais"
            radius={4}
            isAnimationActive={!reduceMotion}
            maxBarSize={24}
          >
            {rows.map((row) => (
              <Cell key={row.key} fill={row.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
