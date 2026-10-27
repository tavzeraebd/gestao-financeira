"use client";

import { InfoIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  INDICATOR_DEFINITIONS,
  type IndicatorId,
} from "@/modules/reports/definitions";

/** "Como calculamos": o texto vem de `INDICATOR_DEFINITIONS`, nunca é reescrito na tela. */
export function IndicatorInfo({ id }: { id: IndicatorId }) {
  const definition = INDICATOR_DEFINITIONS[id];
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Como calculamos ${definition.title}`}
          />
        }
      >
        <InfoIcon aria-hidden="true" className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <PopoverHeader>
          <PopoverTitle>Como calculamos {definition.title}</PopoverTitle>
          <PopoverDescription>{definition.description}</PopoverDescription>
        </PopoverHeader>
        <p className="text-muted-foreground text-xs">
          Definição {definition.ref}
        </p>
      </PopoverContent>
    </Popover>
  );
}
