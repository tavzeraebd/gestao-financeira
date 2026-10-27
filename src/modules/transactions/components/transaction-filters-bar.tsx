"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { DatePicker } from "@/components/shared/date-picker";
import { FiltersPanel } from "@/components/shared/filters-panel";
import { SearchInput } from "@/components/shared/search-input";
import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { endOfMonth, startOfMonth, addDays, type ISODate } from "@/lib/dates";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";
import {
  NO_MEMBER_FILTER,
  ORDER_OPTIONS,
  TRANSACTION_TYPE_LABELS,
  TYPE_FILTERS,
  type OrderOption,
} from "@/modules/transactions/constants";

export type FilterState = {
  de?: string;
  ate?: string;
  tipo?: string;
  conta?: string;
  categoria?: string;
  responsavel?: string;
  q?: string;
  ordem: OrderOption;
  por_pagina: number;
};

type TransactionFiltersBarProps = {
  state: FilterState;
  today: ISODate;
  accounts: SelectOption[];
  categories: SelectOption[];
  members: SelectOption[];
};

const ORDER_LABELS: Record<OrderOption, string> = {
  data_desc: "Data: mais recentes",
  data_asc: "Data: mais antigas",
  valor_desc: "Valor: maior primeiro",
  valor_asc: "Valor: menor primeiro",
};

const TYPE_LABELS: Record<(typeof TYPE_FILTERS)[number], string> = {
  despesa: TRANSACTION_TYPE_LABELS.expense,
  receita: TRANSACTION_TYPE_LABELS.income,
  transferencia: TRANSACTION_TYPE_LABELS.transfer,
};

const SEARCH_DEBOUNCE_MS = 300;
const FIELD_CLASS = "flex w-full flex-col gap-1.5 md:w-44";

function countActive(state: FilterState): number {
  return [
    state.de,
    state.ate,
    state.tipo,
    state.conta,
    state.categoria,
    state.responsavel,
    state.q,
  ].filter(Boolean).length;
}

export function TransactionFiltersBar({
  state,
  today,
  accounts,
  categories,
  members,
}: TransactionFiltersBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(state.q ?? "");
  const [seenQ, setSeenQ] = useState(state.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Voltar/avançar do navegador muda a URL sem passar pelo campo: acompanha o `q` novo.
  if (state.q !== seenQ) {
    setSeenQ(state.q);
    if ((search.trim() || undefined) !== state.q) setSearch(state.q ?? "");
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function navigate(patch: Partial<Record<keyof FilterState, string>>) {
    const next: Record<string, string | undefined> = {
      de: state.de,
      ate: state.ate,
      tipo: state.tipo,
      conta: state.conta,
      categoria: state.categoria,
      responsavel: state.responsavel,
      q: state.q,
      ordem: state.ordem === "data_desc" ? undefined : state.ordem,
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

  function onSearchChange(value: string) {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => navigate({ q: value.trim() || undefined }),
      SEARCH_DEBOUNCE_MS,
    );
  }

  function clearAll() {
    if (timer.current) clearTimeout(timer.current);
    setSearch("");
    setSeenQ(undefined);
    navigate({
      de: undefined,
      ate: undefined,
      tipo: undefined,
      conta: undefined,
      categoria: undefined,
      responsavel: undefined,
      q: undefined,
    });
  }

  const monthStart = startOfMonth(today);
  const previousMonthEnd = addDays(monthStart, -1);

  const typeOptions: SelectOption[] = TYPE_FILTERS.map((value) => ({
    value,
    label: TYPE_LABELS[value],
  }));
  const memberOptions: SelectOption[] = [
    ...members,
    { value: NO_MEMBER_FILTER, label: "Sem responsável" },
  ];
  const orderOptions: SelectOption[] = ORDER_OPTIONS.map((value) => ({
    value,
    label: ORDER_LABELS[value],
  }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <Label htmlFor="busca-lancamentos" className="sr-only">
            Buscar lançamentos
          </Label>
          <SearchInput
            id="busca-lancamentos"
            value={search}
            placeholder="Buscar por descrição"
            onChange={(event) => onSearchChange(event.target.value)}
            onClear={() => {
              setSearch("");
              if (timer.current) clearTimeout(timer.current);
              navigate({ q: undefined });
            }}
          />
        </div>
        <div className="flex w-full flex-col gap-1.5 md:w-56">
          <Label htmlFor="ordem-lancamentos">Ordenar por</Label>
          <OptionSelect
            id="ordem-lancamentos"
            value={state.ordem}
            options={orderOptions}
            onValueChange={(value) =>
              navigate({ ordem: value === "data_desc" ? undefined : value })
            }
          />
        </div>
      </div>

      <FiltersPanel activeCount={countActive(state)} onClear={clearAll}>
        <div className={FIELD_CLASS}>
          <Label htmlFor="filtro-de">De</Label>
          <DatePicker
            id="filtro-de"
            value={state.de ?? ""}
            today={today}
            onChange={(value) => navigate({ de: value })}
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor="filtro-ate">Até</Label>
          <DatePicker
            id="filtro-ate"
            value={state.ate ?? ""}
            today={today}
            onChange={(value) => navigate({ ate: value })}
          />
        </div>
        <div className="flex w-full gap-2 md:w-auto">
          <Button
            type="button"
            variant="outline"
            className="flex-1 md:flex-none"
            onClick={() => navigate({ de: monthStart, ate: endOfMonth(today) })}
          >
            Este mês
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 md:flex-none"
            onClick={() =>
              navigate({
                de: startOfMonth(previousMonthEnd),
                ate: previousMonthEnd,
              })
            }
          >
            Mês passado
          </Button>
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor="filtro-tipo">Tipo</Label>
          <OptionSelect
            id="filtro-tipo"
            value={state.tipo ?? ""}
            options={typeOptions}
            emptyLabel="Todos os tipos"
            onValueChange={(value) => navigate({ tipo: value || undefined })}
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor="filtro-conta">Conta</Label>
          <OptionSelect
            id="filtro-conta"
            value={state.conta ?? ""}
            options={accounts}
            emptyLabel="Todas as contas"
            onValueChange={(value) => navigate({ conta: value || undefined })}
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor="filtro-categoria">Categoria</Label>
          <OptionSelect
            id="filtro-categoria"
            value={state.categoria ?? ""}
            options={categories}
            emptyLabel="Todas as categorias"
            onValueChange={(value) =>
              navigate({ categoria: value || undefined })
            }
          />
        </div>
        <div className={FIELD_CLASS}>
          <Label htmlFor="filtro-responsavel">Responsável</Label>
          <OptionSelect
            id="filtro-responsavel"
            value={state.responsavel ?? ""}
            options={memberOptions}
            emptyLabel="Todos"
            onValueChange={(value) =>
              navigate({ responsavel: value || undefined })
            }
          />
        </div>
      </FiltersPanel>
      {state.de && state.ate && state.de > state.ate ? (
        <Alert variant="warning">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>
            A data inicial é depois da data final, por isso nenhum lançamento
            aparece. Ajuste o período em &quot;De&quot; e &quot;Até&quot;.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
