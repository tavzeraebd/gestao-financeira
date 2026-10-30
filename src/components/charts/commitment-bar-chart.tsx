"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";

import { formatPercent } from "@/lib/format";
import { addCents, formatBRL, type Cents } from "@/lib/money";

import { ChartLegend, type ChartLegendItem } from "./chart-legend";
import { chartColorVar } from "./colors";
import { useReducedMotion } from "./use-reduced-motion";

export type CommitmentDatum = {
  key: string;
  label: string;
  /** Contas a pagar em aberto no mês. */
  pending: Cents;
  /** Despesas recorrentes projetadas no mês. */
  recurring: Cents;
  /** Receita esperada no mês (linha); `0` quando não há. */
  income: Cents;
  percent: number | null;
  /** Saldo projetado ao fim do mês. */
  projected: Cents;
};

export type CommitmentBarChartProps = {
  data: CommitmentDatum[];
  /** Mostra a linha e a legenda da receita esperada. */
  showIncome: boolean;
  ariaLabel: string;
};

const HEIGHT = 288;

const compactBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1,
});

const TICK = { fill: "var(--muted-foreground)", fontSize: 12 };

function CommitmentTooltip({
  active,
  payload,
  label,
  showIncome,
}: TooltipContentProps & { showIncome: boolean }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CommitmentDatum | undefined;
  if (!row) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{String(label ?? "")}</p>
      <p className="text-muted-foreground tabular-nums">
        Contas em aberto: {formatBRL(row.pending)}
      </p>
      <p className="text-muted-foreground tabular-nums">
        Recorrências: {formatBRL(row.recurring)}
      </p>
      <p className="text-foreground font-medium tabular-nums">
        Comprometido: {formatBRL(addCents(row.pending, row.recurring))}
      </p>
      <p
        className={`font-medium tabular-nums ${row.projected < 0 ? "text-destructive" : "text-foreground"}`}
      >
        Saldo projetado: {formatBRL(row.projected)}
        {row.projected < 0 ? " (negativo)" : ""}
      </p>
      {showIncome ? (
        <>
          <p className="text-muted-foreground tabular-nums">
            Receita esperada: {formatBRL(row.income)}
          </p>
          <p className="text-muted-foreground tabular-nums">
            Comprometimento:{" "}
            {row.percent === null ? "sem receita" : formatPercent(row.percent)}
          </p>
        </>
      ) : null}
    </div>
  );
}

export default function CommitmentBarChart({
  data,
  showIncome,
  ariaLabel,
}: CommitmentBarChartProps) {
  const reduceMotion = useReducedMotion();
  // Cents -> reais só para a escala do SVG; a exibição usa formatBRL.
  const rows = data.map((d) => ({
    ...d,
    pendingReais: d.pending / 100,
    recurringReais: d.recurring / 100,
    incomeReais: d.income / 100,
    projectedReais: d.projected / 100,
  }));
  const hasNegative = data.some((d) => d.projected < 0);

  const legend: ChartLegendItem[] = [
    { key: "pending", label: "Contas em aberto", color: "chart-green-1" },
    { key: "recurring", label: "Recorrências", color: "chart-green-5" },
    {
      key: "projected",
      label: "Saldo projetado (linha contínua)",
      color: "chart-green-3" as const,
    },
    ...(showIncome
      ? [
          {
            key: "income",
            label: "Receita esperada (linha tracejada)",
            color: "chart-green-6" as const,
          },
        ]
      : []),
  ];

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
          <ComposedChart
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
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              width={64}
              tickLine={false}
              axisLine={false}
              tick={TICK}
              tickFormatter={(v: number) => compactBRL.format(v)}
            />
            <Tooltip
              content={(props) => (
                <CommitmentTooltip {...props} showIncome={showIncome} />
              )}
              cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            />
            {hasNegative ? (
              <ReferenceLine y={0} stroke="var(--muted-foreground)" />
            ) : null}
            <Bar
              dataKey="pendingReais"
              name="Contas em aberto"
              stackId="commitment"
              fill={chartColorVar("chart-green-1")}
              isAnimationActive={!reduceMotion}
            />
            <Bar
              dataKey="recurringReais"
              name="Recorrências"
              stackId="commitment"
              fill={chartColorVar("chart-green-5")}
              radius={[4, 4, 0, 0]}
              isAnimationActive={!reduceMotion}
            />
            {showIncome ? (
              <Line
                dataKey="incomeReais"
                name="Receita esperada"
                type="monotone"
                stroke={chartColorVar("chart-green-6")}
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: chartColorVar("chart-green-6") }}
                isAnimationActive={!reduceMotion}
              />
            ) : null}
            <Line
              dataKey="projectedReais"
              name="Saldo projetado"
              type="monotone"
              stroke={chartColorVar("chart-green-3")}
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, index } = props as {
                  cx: number;
                  cy: number;
                  index: number;
                };
                const negative = (data[index]?.projected ?? 0) < 0;
                return (
                  <circle
                    key={`proj-${index}`}
                    cx={cx}
                    cy={cy}
                    r={negative ? 5 : 3}
                    fill={
                      negative
                        ? "var(--destructive)"
                        : chartColorVar("chart-green-3")
                    }
                  />
                );
              }}
              isAnimationActive={!reduceMotion}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        aria-label="Legenda: comprometimento mensal"
        items={legend}
      />
    </div>
  );
}
