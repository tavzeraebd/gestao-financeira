"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { DatePicker } from "@/components/shared/date-picker";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  compareISODate,
  diffInDays,
  endOfMonth,
  isISODate,
  type ISODate,
} from "@/lib/dates";
import { MAX_PERIOD_DAYS, MIN_PERIOD_DATE } from "@/modules/reports/constants";
import type { PeriodPreset } from "@/modules/reports/types";

type DashboardPeriodFilterProps = {
  /** Período já resolvido pelo servidor (o que está na tela). */
  preset: PeriodPreset;
  from: ISODate;
  to: ISODate;
  today: ISODate;
};

const OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "mes_atual", label: "Este mês" },
  { value: "mes_anterior", label: "Mês anterior" },
  { value: "personalizado", label: "Personalizado" },
];

/** Mensagem de erro do intervalo, ou `null` se válido. A regra final é do servidor (`resolvePeriod`). */
function validateRange(de: string, ate: string, max: ISODate): string | null {
  if (!isISODate(de) || !isISODate(ate)) {
    return "Escolha as datas De e Até para aplicar o período.";
  }
  if (compareISODate(de, ate) > 0) {
    return "A data De não pode ser depois da data Até.";
  }
  if (compareISODate(de, MIN_PERIOD_DATE) < 0) {
    return "Escolha uma data De a partir de 01/01/2000.";
  }
  if (compareISODate(ate, max) > 0) {
    return "A data Até não pode passar do fim do mês atual.";
  }
  if (diffInDays(de, ate) + 1 > MAX_PERIOD_DAYS) {
    return `O período pode ter no máximo ${MAX_PERIOD_DAYS} dias.`;
  }
  return null;
}

export function DashboardPeriodFilter({
  preset,
  from,
  to,
  today,
}: DashboardPeriodFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const max = endOfMonth(today);

  const [mode, setMode] = useState<PeriodPreset>(preset);
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

  function onModeChange(next: PeriodPreset) {
    setMode(next);
    setError(null);
    if (next === "mes_atual") router.replace(pathname);
    else if (next === "mes_anterior") {
      router.replace(`${pathname}?periodo=mes_anterior`);
    }
    // "personalizado" só navega depois de "Aplicar", com as duas datas válidas.
  }

  function apply() {
    const problem = validateRange(de, ate, max);
    setError(problem);
    if (problem) return;
    const params = new URLSearchParams({ periodo: "personalizado", de, ate });
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
      <SegmentedControl
        aria-label="Período"
        value={mode}
        onValueChange={onModeChange}
        options={OPTIONS}
        className="sm:w-auto sm:min-w-96"
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
