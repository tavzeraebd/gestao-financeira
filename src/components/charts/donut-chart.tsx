"use client";

import { Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { TooltipContentProps } from "recharts";

import { formatBRL, type Cents } from "@/lib/money";
import { cn } from "@/lib/utils";

import { chartColorVar, type ChartColor } from "./colors";
import { useReducedMotion } from "./use-reduced-motion";

export type DonutChartDatum = {
  key: string;
  label: string;
  value: Cents;
  color: ChartColor;
};

export type DonutChartProps = {
  data: DonutChartDatum[];
  centerLabel: string;
  centerValue: string;
  ariaLabel: string;
  /** Clique numa fatia; o teclado usa os botões da legenda. */
  onSelect?: (key: string) => void;
  /** Preenche a altura do pai a partir de `lg` (altura fixa abaixo disso). */
  fill?: boolean;
};

const HEIGHT = 224;

type Slice = {
  key: string;
  name: string;
  value: number;
  cents: Cents;
  fill: string;
};

function DonutTooltip({ active, payload }: TooltipContentProps) {
  const slice = payload?.[0]?.payload as Slice | undefined;
  if (!active || !slice) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{slice.name}</p>
      <p className="text-muted-foreground tabular-nums">
        {formatBRL(slice.cents)}
      </p>
    </div>
  );
}

export default function DonutChart({
  data,
  centerLabel,
  centerValue,
  ariaLabel,
  onSelect,
  fill = false,
}: DonutChartProps) {
  const reduceMotion = useReducedMotion();
  // Cents -> reais só para o ângulo das fatias; a exibição usa formatBRL.
  const slices: Slice[] = data.map((d) => ({
    key: d.key,
    name: d.label,
    value: d.value / 100,
    cents: d.value,
    fill: chartColorVar(d.color),
  }));

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn(
        "relative w-full",
        fill && "h-60 lg:h-auto lg:min-h-48 lg:flex-1",
      )}
      style={fill ? undefined : { height: HEIGHT }}
    >
      <ResponsiveContainer
        className={fill ? "absolute inset-0" : undefined}
        width="100%"
        height={fill ? "100%" : HEIGHT}
        initialDimension={{ width: 320, height: HEIGHT }}
      >
        <PieChart accessibilityLayer={false}>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="65%"
            outerRadius="100%"
            paddingAngle={slices.length > 1 ? 1 : 0}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive={!reduceMotion}
            style={onSelect ? { cursor: "pointer" } : undefined}
            onClick={(_slice, index) => {
              const key = slices[index]?.key;
              if (key !== undefined) onSelect?.(key);
            }}
          />
          <Tooltip content={DonutTooltip} />
        </PieChart>
      </ResponsiveContainer>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <span className="text-muted-foreground text-xs">{centerLabel}</span>
        <span className="text-foreground text-base font-semibold tabular-nums">
          {centerValue}
        </span>
      </div>
    </div>
  );
}
