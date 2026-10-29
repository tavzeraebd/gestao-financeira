import { z } from "zod";
import { parseISODate } from "@/lib/dates";
import {
  dateParam,
  enumParam,
  firstParam,
  paramsObject,
} from "@/lib/validation/url-params";
import {
  COMMITMENT_HORIZONS,
  DEFAULT_COMMITMENT_HORIZON,
  DEFAULT_PERIOD_PRESET,
  DEFAULT_REPORT_CATEGORY_TYPE,
  DEFAULT_REPORT_PRESET,
  PERIOD_PRESETS,
  REPORT_CATEGORY_TYPES,
  REPORT_PRESETS,
} from "./constants";
import type {
  CategoryReportFilters,
  CommitmentFilters,
  DashboardFilters,
  PeriodPreset,
  ReportFilters,
} from "./types";

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

/**
 * Parâmetro de URL do /inicio (`?horizonte=6|12`). Tolerante: valor inválido ou repetido vira o padrão
 * (12 meses à frente); nunca lança.
 */
export const commitmentFiltersSchema = z
  .unknown()
  .transform((raw): CommitmentFilters => {
    const value = firstParam(paramsObject(raw).horizonte);
    const found = COMMITMENT_HORIZONS.find((h) => String(h) === value);
    return { horizonte: found ?? DEFAULT_COMMITMENT_HORIZON };
  });

/**
 * Parâmetros de URL dos relatórios (D21). Tolerante como o do dashboard: valor inválido vira o padrão
 * (`30_dias`), parâmetro repetido usa o primeiro, entrada que não é objeto não lança.
 */
export const reportFiltersSchema = z
  .unknown()
  .transform((raw): ReportFilters => {
    const source = paramsObject(raw);
    const filters: ReportFilters = {
      periodo:
        enumParam(source.periodo, REPORT_PRESETS) ?? DEFAULT_REPORT_PRESET,
    };
    const de = dateParam(source.de);
    const ate = dateParam(source.ate);
    if (de) filters.de = de;
    if (ate) filters.ate = ate;
    return filters;
  });

/** Relatório por categoria: acrescenta `tipo` (`despesas` padrão | `receitas`). */
export const categoryReportSchema = z
  .unknown()
  .transform((raw): CategoryReportFilters => {
    const source = paramsObject(raw);
    return {
      ...reportFiltersSchema.parse(raw),
      tipo:
        enumParam(source.tipo, REPORT_CATEGORY_TYPES) ??
        DEFAULT_REPORT_CATEGORY_TYPE,
    };
  });
