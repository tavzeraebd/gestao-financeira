import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  COMMITMENT_HORIZONS,
  DEFAULT_COMMITMENT_HORIZON,
} from "@/modules/reports/constants";
import type { CommitmentHorizon } from "@/modules/reports/types";

/**
 * Seletor de horizonte (`?horizonte=6|12`, padrão 12). São links comuns: navegam sem JavaScript e a
 * escolha atual é anunciada por `aria-current`. O padrão não repete o parâmetro na URL.
 */
export function CommitmentHorizonFilter({
  horizon,
}: {
  horizon: CommitmentHorizon;
}) {
  return (
    <nav
      aria-label="Horizonte do acompanhamento"
      className="bg-muted inline-flex w-full gap-1 rounded-lg p-1 sm:w-auto"
    >
      {COMMITMENT_HORIZONS.map((option) => {
        const current = option === horizon;
        return (
          <Link
            key={option}
            href={
              option === DEFAULT_COMMITMENT_HORIZON
                ? "/inicio"
                : `/inicio?horizonte=${option}`
            }
            aria-current={current ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring inline-flex min-h-10 flex-1 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-3 sm:flex-none",
              current
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option} meses
          </Link>
        );
      })}
    </nav>
  );
}
