"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { DatePicker } from "@/components/shared/date-picker";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { endOfMonth, type ISODate } from "@/lib/dates";
import type { ReportPreset } from "@/modules/reports/types";

import { validateRange } from "./dashboard-period-filter";

type ReportPeriodFilterProps = {
  /** Período já resolvido pelo servidor (o que está na tela). */
  preset: ReportPreset;
  from: ISODate;
  to: ISODate;
  today: ISODate;
};

const OPTIONS: { value: ReportPreset; label: string }[] = [
  { value: "7_dias", label: "7 dias" },
  { value: "30_dias", label: "30 dias" },
  { value: "3_meses", label: "3 meses" },
  { value: "12_meses", label: "12 meses" },
  { value: "personalizado", label: "Personalizado" },
];

/**
 * Período dos relatórios na URL (`?periodo=`, `de`, `ate`), trocado com `router.replace`.
 * Os demais parâmetros da tela (ex.: `tipo`) são preservados. A regra final é do servidor
 * (`resolveReportPeriod`): período personalizado inválido volta para 30 dias.
 */
export function ReportPeriodFilter({
  preset,
  from,
  to,
  today,
}: ReportPeriodFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const max = endOfMonth(today);

  const [mode, setMode] = useState<ReportPreset>(preset);
  const [de, setDe] = useState<string>(from);
  const [ate, setAte] = useState<string>(to);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState({ preset, from, to });

  // Voltar/avançar do navegador muda a URL sem passar pelo controle: acompanha o período novo.
  if (seen.preset !== preset || seen.from !== from || seen.to !== to) {
    setSeen({ preset, from, to });
    setMode(preset);
    setDe(from);
    setAte(to);
    setError(null);
  }

  function go(period: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["periodo", "de", "ate"]) params.delete(key);
    for (const [key, value] of Object.entries(period)) params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function onModeChange(next: ReportPreset) {
    setMode(next);
    setError(null);
    // "personalizado" só navega depois de "Aplicar", com as duas datas válidas.
    if (next !== "personalizado") go({ periodo: next });
  }

  function apply() {
    const problem = validateRange(de, ate, max);
    setError(problem);
    if (problem) return;
    go({ periodo: "personalizado", de, ate });
  }

  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
      <SegmentedControl
        aria-label="Período do relatório"
        value={mode}
        onValueChange={onModeChange}
        options={OPTIONS}
        className="overflow-x-auto sm:w-auto sm:min-w-120 [&_[data-slot=segmented-item]]:whitespace-nowrap"
      />
      {mode === "personalizado" ? (
        <div className="flex w-full flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodo-de">De</Label>
              <DatePicker
                id="periodo-de"
                value={de}
                onChange={setDe}
                today={today}
                max={max}
                aria-invalid={error !== null}
                aria-describedby={error ? "periodo-erro" : undefined}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodo-ate">Até</Label>
              <DatePicker
                id="periodo-ate"
                value={ate}
                onChange={setAte}
                today={today}
                max={max}
                aria-invalid={error !== null}
                aria-describedby={error ? "periodo-erro" : undefined}
              />
            </div>
          </div>
          {error ? (
            <p
              id="periodo-erro"
              role="alert"
              className="text-destructive text-sm"
            >
              {error}
            </p>
          ) : null}
          <Button type="button" onClick={apply}>
            Aplicar
          </Button>
        </div>
      ) : null}
    </div>
  );
}
