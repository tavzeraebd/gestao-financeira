"use client";

import { InfoHint } from "@/components/shared/info-hint";
import {
  INDICATOR_DEFINITIONS,
  type IndicatorId,
} from "@/modules/reports/definitions";

/** "Como calculamos": o texto vem de `INDICATOR_DEFINITIONS`, nunca é reescrito na tela. */
export function IndicatorInfo({ id }: { id: IndicatorId }) {
  const definition = INDICATOR_DEFINITIONS[id];
  return (
    <InfoHint
      label={definition.title}
      ariaLabel={`Como calculamos ${definition.title}`}
      title={`Como calculamos ${definition.title}`}
    >
      {definition.description}
      <span className="text-muted-foreground mt-2 block text-xs">
        Definição {definition.ref}
      </span>
    </InfoHint>
  );
}
