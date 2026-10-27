"use client";

import { XIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { DatePicker } from "@/components/shared/date-picker";
import { FiltersPanel } from "@/components/shared/filters-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { ISODate } from "@/lib/dates";
import {
  BILL_KIND_LABELS,
  BILL_KINDS,
  BILL_SITUATION_LABELS,
  BILL_SITUATIONS,
  DEFAULT_BILL_SITUATION,
} from "@/modules/bills/constants";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";

export type BillFilterState = {
  tipo?: string;
  situacao: string;
  de?: string;
  ate?: string;
  serie?: string;
  por_pagina: number;
};

type BillFiltersBarProps = {
  state: BillFilterState;
  today: ISODate;
  /** Nome da série filtrada por `?serie=`. */
  serieName?: string;
};

const FIELD_CLASS = "flex w-full flex-col gap-1.5 md:w-44";

const KIND_OPTIONS: SelectOption[] = BILL_KINDS.map((value) => ({
  value,
  label: BILL_KIND_LABELS[value],
}));
const SITUATION_OPTIONS: SelectOption[] = BILL_SITUATIONS.map((value) => ({
  value,
  label: BILL_SITUATION_LABELS[value],
}));

function countActive(state: BillFilterState): number {
  return [
    state.tipo,
    state.de,
    state.ate,
    state.serie,
    state.situacao !== DEFAULT_BILL_SITUATION ? state.situacao : undefined,
  ].filter(Boolean).length;
}

export function BillFiltersBar({
  state,
  today,
  serieName,
}: BillFiltersBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(patch: Partial<Record<keyof BillFilterState, string>>) {
    const next: Record<string, string | undefined> = {
      tipo: state.tipo,
      situacao:
        state.situacao === DEFAULT_BILL_SITUATION ? undefined : state.situacao,
      de: state.de,
      ate: state.ate,
      serie: state.serie,
      por_pagina:
        state.por_pagina === 20 ? undefined : String(state.por_pagina),
      ...patch,
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-col gap-3">
      <FiltersPanel
        activeCount={countActive(state)}
        onClear={() => router.replace(pathname)}
      >
        <div className={FIELD_CLASS}>
          <Label htmlFor="filtro-compromisso-tipo">Tipo</Label>
          <OptionSelect
            id="filtro-compromisso-tipo"
            value={state.tipo ?? ""}
            options={KIND_OPTIONS}
            emptyLabel="A pagar e a receber"
            onValueChange={(value) => navigate({ tipo: value || undefined })}
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor="filtro-compromisso-situacao">Situação</Label>
          <OptionSelect
            id="filtro-compromisso-situacao"
            value={state.situacao}
            options={SITUATION_OPTIONS}
            onValueChange={(value) =>
              navigate({
                situacao: value === DEFAULT_BILL_SITUATION ? undefined : value,
              })
            }
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor="filtro-compromisso-de">Vencimento de</Label>
          <DatePicker
            id="filtro-compromisso-de"
            value={state.de ?? ""}
            today={today}
            onChange={(value) => navigate({ de: value })}
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor="filtro-compromisso-ate">Vencimento até</Label>
          <DatePicker
            id="filtro-compromisso-ate"
            value={state.ate ?? ""}
            today={today}
            onChange={(value) => navigate({ ate: value })}
          />
        </div>
      </FiltersPanel>
      {state.serie ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Série:</span>
          <span className="font-medium">{serieName ?? "Recorrência"}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate({ serie: undefined })}
          >
            <XIcon aria-hidden="true" data-icon="inline-start" />
            Limpar
          </Button>
        </p>
      ) : null}
    </div>
  );
}
