import { cn } from "@/lib/utils";

import { chartColorVar, type ChartColor } from "./colors";

export type ChartLegendItem = {
  key: string;
  label: string;
  color: ChartColor;
  value?: string;
};

export type ChartLegendProps = {
  items: ChartLegendItem[];
  "aria-label"?: string;
  className?: string;
  /** Com `onSelect`, cada item vira um botão (acesso por teclado ao detalhe de cada fatia). */
  onSelect?: (key: string) => void;
  /** Texto do `aria-label` de cada botão, a partir do rótulo do item. */
  selectLabel?: (item: ChartLegendItem) => string;
};

function LegendContent({ item }: { item: ChartLegendItem }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="size-3 shrink-0 rounded-sm"
        style={{ backgroundColor: chartColorVar(item.color) }}
      />
      <span className="text-foreground">{item.label}</span>
      {item.value ? (
        <span className="text-muted-foreground tabular-nums">{item.value}</span>
      ) : null}
    </>
  );
}

/** Legenda em texto: marcador de cor (decorativo), nome e valor. Quebra no celular. */
export function ChartLegend({
  items,
  "aria-label": ariaLabel,
  className,
  onSelect,
  selectLabel,
}: ChartLegendProps) {
  return (
    <ul
      aria-label={ariaLabel ?? "Legenda do gráfico"}
      className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm", className)}
    >
      {items.map((item) => (
        <li key={item.key} className="min-h-6">
          {onSelect ? (
            <button
              type="button"
              aria-label={selectLabel?.(item)}
              onClick={() => onSelect(item.key)}
              className="hover:bg-muted focus-visible:ring-ring -mx-2 -my-2 flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-2 outline-none focus-visible:ring-3"
            >
              <LegendContent item={item} />
            </button>
          ) : (
            <span className="flex items-center gap-2">
              <LegendContent item={item} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
