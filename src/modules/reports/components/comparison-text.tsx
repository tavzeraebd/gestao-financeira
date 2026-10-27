import { MinusIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { formatPercent } from "@/lib/format";
import type { Comparison } from "@/modules/reports/types";

type ComparisonTextProps = {
  comparison: Comparison;
  /** Referência da comparação: `"30/09/2026"` ou `"setembro de 2026"`. */
  against: string;
};

/**
 * Variação em texto com sinal (nunca só cor ou seta). Sem período anterior para comparar
 * (`percent = null`), diz isso em vez de mostrar "NaN%" ou "∞".
 */
export function ComparisonText({ comparison, against }: ComparisonTextProps) {
  const { percent } = comparison;
  const Icon =
    percent === null || percent === 0
      ? MinusIcon
      : percent > 0
        ? TrendingUpIcon
        : TrendingDownIcon;
  const text =
    percent === null
      ? "Sem base de comparação"
      : `${formatPercent(percent, { signDisplay: "exceptZero" })} em relação a ${against}`;
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span data-testid="variacao">{text}</span>
    </p>
  );
}
