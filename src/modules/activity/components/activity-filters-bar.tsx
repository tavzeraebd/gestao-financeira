"use client";

import { usePathname, useRouter } from "next/navigation";

import { DatePicker } from "@/components/shared/date-picker";
import { FiltersPanel } from "@/components/shared/filters-panel";
import { Label } from "@/components/ui/label";
import type { ISODate } from "@/lib/dates";
import {
  ACTIVITY_GROUP_KEYS,
  ACTIVITY_GROUP_LABELS,
  ACTIVITY_PAGE_SIZES,
  DEFAULT_ACTIVITY_PAGE_SIZE,
} from "@/modules/activity/constants";
import type { ActivityFilters } from "@/modules/activity/types";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";

type ActivityFiltersBarProps = {
  state: Pick<ActivityFilters, "grupo" | "de" | "ate" | "por_pagina">;
  today: ISODate;
};

const FIELD_CLASS = "flex w-full flex-col gap-1.5 md:w-44";

const GROUP_OPTIONS: SelectOption[] = ACTIVITY_GROUP_KEYS.map((value) => ({
  value,
  label: ACTIVITY_GROUP_LABELS[value],
}));

const PAGE_SIZE_OPTIONS: SelectOption[] = ACTIVITY_PAGE_SIZES.map((size) => ({
  value: String(size),
  label: `${size} por página`,
}));

/** Filtros na URL (`grupo`, `de`, `ate`, `por_pagina`); qualquer mudança volta à primeira página. */
export function ActivityFiltersBar({ state, today }: ActivityFiltersBarProps) {
  const router = useRouter();
  const pathname = usePathname();

  function navigate(patch: Record<string, string | undefined>) {
    const next: Record<string, string | undefined> = {
      grupo: state.grupo,
      de: state.de,
      ate: state.ate,
      por_pagina:
        state.por_pagina === DEFAULT_ACTIVITY_PAGE_SIZE
          ? undefined
          : String(state.por_pagina),
      ...patch,
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const activeCount = [state.grupo, state.de, state.ate].filter(Boolean).length;

  return (
    <FiltersPanel
      activeCount={activeCount}
      onClear={() =>
        navigate({ grupo: undefined, de: undefined, ate: undefined })
      }
    >
      <div className={FIELD_CLASS}>
        <Label htmlFor="atividade-grupo">Grupo</Label>
        <OptionSelect
          id="atividade-grupo"
          value={state.grupo ?? ""}
          options={GROUP_OPTIONS}
          emptyLabel="Todos os grupos"
          onValueChange={(value) => navigate({ grupo: value || undefined })}
        />
      </div>
      <div className={FIELD_CLASS}>
        <Label htmlFor="atividade-de">De</Label>
        <DatePicker
          id="atividade-de"
          value={state.de ?? ""}
          today={today}
          max={state.ate}
          onChange={(value) => navigate({ de: value || undefined })}
        />
      </div>
      <div className={FIELD_CLASS}>
        <Label htmlFor="atividade-ate">Até</Label>
        <DatePicker
          id="atividade-ate"
          value={state.ate ?? ""}
          today={today}
          min={state.de}
          onChange={(value) => navigate({ ate: value || undefined })}
        />
      </div>
      <div className={FIELD_CLASS}>
        <Label htmlFor="atividade-por-pagina">Itens por página</Label>
        <OptionSelect
          id="atividade-por-pagina"
          value={String(state.por_pagina)}
          options={PAGE_SIZE_OPTIONS}
          onValueChange={(value) =>
            navigate({
              por_pagina:
                Number(value) === DEFAULT_ACTIVITY_PAGE_SIZE
                  ? undefined
                  : value,
            })
          }
        />
      </div>
    </FiltersPanel>
  );
}
