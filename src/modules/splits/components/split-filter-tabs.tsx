import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  DEFAULT_SPLIT_FILTER,
  SPLIT_FILTERS,
  SPLIT_FILTER_LABELS,
  type SplitFilter,
} from "@/modules/splits/constants";

/** Filtro Todas | Pendentes | Pagas na URL (`?situacao=`), por links: funciona sem JavaScript. */
export function SplitFilterTabs({ active }: { active: SplitFilter }) {
  return (
    <nav aria-label="Situação das despesas divididas" className="max-w-full">
      <ul className="bg-muted inline-flex max-w-full gap-1 overflow-x-auto rounded-lg p-1">
        {SPLIT_FILTERS.map((filter) => {
          const isActive = filter === active;
          return (
            <li key={filter} className="shrink-0">
              <Link
                href={
                  filter === DEFAULT_SPLIT_FILTER
                    ? "/divisao"
                    : `/divisao?situacao=${filter}`
                }
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring focus-visible:border-ring flex min-h-10 items-center justify-center rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                  isActive
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {SPLIT_FILTER_LABELS[filter]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
