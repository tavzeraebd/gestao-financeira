import { z } from "zod";
import { parseISODate } from "@/lib/dates";
import { DEFAULT_PERIOD_PRESET, PERIOD_PRESETS } from "./constants";
import type { DashboardFilters, PeriodPreset } from "./types";

const first = (value: unknown): unknown =>
  Array.isArray(value) ? value[0] : value;

/**
 * Parâmetros de URL do dashboard. Tolerante: valor inválido (ou parâmetro repetido, entrada que não
 * é objeto) vira o padrão, nunca erro. Parâmetro repetido usa o primeiro valor.
 */
export const dashboardFiltersSchema = z
  .unknown()
  .transform((raw): DashboardFilters => {
    const source =
      typeof raw === "object" && raw !== null
        ? (raw as Record<string, unknown>)
        : {};
    const periodo = first(source.periodo);
    const de = first(source.de);
    const ate = first(source.ate);

    const filters: DashboardFilters = {
      periodo: (PERIOD_PRESETS as readonly unknown[]).includes(periodo)
        ? (periodo as PeriodPreset)
        : DEFAULT_PERIOD_PRESET,
    };
    const parsedDe = typeof de === "string" ? parseISODate(de) : null;
    const parsedAte = typeof ate === "string" ? parseISODate(ate) : null;
    if (parsedDe) filters.de = parsedDe;
    if (parsedAte) filters.ate = parsedAte;
    return filters;
  });
