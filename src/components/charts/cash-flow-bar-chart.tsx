"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

import { formatBRL, type Cents } from "@/lib/money";

import { ChartLegend } from "./chart-legend";
import { chartColorVar } from "./colors";
import { useReducedMotion } from "./use-reduced-motion";

export type CashFlowDatum = {
  key: string;
  label: string;
  income: Cents;
  expense: Cents;
};

export type CashFlowBarChartProps = {
  data: CashFlowDatum[];
  ariaLabel: string;
};

const HEIGHT = 256;

const compactBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

function CashFlowTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as
    { income: Cents; expense: Cents } | undefined;
  if (!row) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{String(label ?? "")}</p>
      <p className="text-muted-foreground tabular-nums">
        Receitas: {formatBRL(row.income)}
      </p>
      <p className="text-muted-foreground tabular-nums">
        Despesas: {formatBRL(row.expense)}
      </p>
    </div>
  );
}

export default function CashFlowBarChart({
  data,
  ariaLabel,
}: CashFlowBarChartProps) {
  const reduceMotion = useReducedMotion();
  // Cents -> reais só para a escala do SVG; a exibição usa formatBRL.
  const rows = data.map((d) => ({
    key: d.key,
    label: d.label,
    income: d.income,
    expense: d.expense,
    incomeReais: d.income / 100,
    expenseReais: d.expense / 100,
  }));

  return (
    <div className="flex flex-col gap-3">
      <div
        role="img"
        aria-label={ariaLabel}
        className="w-full"
        style={{ height: HEIGHT }}
      >
        <ResponsiveContainer
          width="100%"
          height={HEIGHT}
          initialDimension={{ width: 480, height: HEIGHT }}
        >
          <BarChart
            data={rows}
            accessibilityLayer={false}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={TICK}
            />
            <YAxis
              width={64}
              tickLine={false}
              axisLine={false}
              tick={TICK}
              tickFormatter={(v: number) => compactBRL.format(v)}
            />
            <Tooltip
              content={CashFlowTooltip}
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            />
            <Bar
              dataKey="incomeReais"
              name="Receitas"
              fill={chartColorVar("chart-income")}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reduceMotion}
            />
            <Bar
              dataKey="expenseReais"
              name="Despesas"
              fill={chartColorVar("chart-expense")}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reduceMotion}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        aria-label="Legenda: receitas e despesas"
        items={[
          { key: "income", label: "Receitas", color: "chart-income" },
          { key: "expense", label: "Despesas", color: "chart-expense" },
        ]}
      />
    </div>
  );
}
