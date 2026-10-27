/**
 * Percentual para exibição (TS puro, usável no cliente). `value` em pontos percentuais:
 * `12.5` -> `"12,5%"`. Nunca persistir o resultado.
 */
export function formatPercent(
  value: number,
  opts: {
    signDisplay?: "auto" | "exceptZero";
    maximumFractionDigits?: number;
  } = {},
): string {
  const max = opts.maximumFractionDigits ?? 1;
  const formatter = new Intl.NumberFormat("pt-BR", {
    style: "decimal",
    minimumFractionDigits: Math.min(1, max),
    maximumFractionDigits: max,
    signDisplay: opts.signDisplay ?? "auto",
  });
  return `${formatter.format(value)}%`;
}
