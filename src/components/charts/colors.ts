import type { CategoryColor } from "@/modules/categories/constants";

/** Cor de dado de gráfico: sempre um token `chart-*` (ADR-0019 / ADR-0021). */
export type ChartGreenColor =
  | "chart-green-1"
  | "chart-green-2"
  | "chart-green-3"
  | "chart-green-4"
  | "chart-green-5"
  | "chart-green-6";

/** Escala de verdes exclusiva do dashboard, do mais escuro ao mais claro (tema claro). */
export const CHART_GREEN_SCALE: readonly ChartGreenColor[] = [
  "chart-green-1",
  "chart-green-2",
  "chart-green-3",
  "chart-green-4",
  "chart-green-5",
  "chart-green-6",
];

export type ChartColor =
  | CategoryColor
  | "chart-income"
  | "chart-expense"
  | ChartGreenColor;

/**
 * `"chart-3"` -> `"var(--chart-3)"`. Única forma de dar cor a um gráfico.
 * Usa a variável da `:root`/`.dark` (definida em `globals.css`), não `--color-*`: em `@theme inline`
 * o Tailwind só emite `--color-*` quando alguma classe a usa, então `var(--color-chart-expense)`
 * resolvia para nada (preto) em páginas sem essa classe.
 */
export function chartColorVar(c: ChartColor): string {
  return `var(--${c})`;
}
