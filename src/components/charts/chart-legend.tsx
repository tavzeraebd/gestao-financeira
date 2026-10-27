import { cn } from "@/lib/utils";

import { chartColorVar, type ChartColor } from "./colors";

export type ChartLegendItem = {
  key: string;
  label: string;
  color: ChartColor;
  value?: string;
};

type ChartLegendProps = {
  items: ChartLegendItem[];
  "aria-label"?: string;
  className?: string;
};

/** Legenda em texto: marcador de cor (decorativo), nome e valor. Quebra no celular. */
export function ChartLegend({
  items,
  "aria-label": ariaLabel,
  className,
}: ChartLegendProps) {
  return (
    <ul
      aria-label={ariaLabel ?? "Legenda do gráfico"}
      className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm", className)}
    >
      {items.map((item) => (
        <li key={item.key} className="flex min-h-6 items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 shrink-0 rounded-sm"
            style={{ backgroundColor: chartColorVar(item.color) }}
          />
          <span className="text-foreground">{item.label}</span>
          {item.value ? (
            <span className="text-muted-foreground tabular-nums">
              {item.value}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
