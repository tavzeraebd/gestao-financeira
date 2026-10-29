import type { ISODate } from "@/lib/dates";

export const PERIOD_PRESETS = [
  "mes_atual",
  "mes_anterior",
  "personalizado",
] as const;

export const DEFAULT_PERIOD_PRESET = "mes_atual" as const;

/** Presets de período dos relatórios (D21). */
export const REPORT_PRESETS = [
  "7_dias",
  "30_dias",
  "3_meses",
  "12_meses",
  "personalizado",
] as const;

export const DEFAULT_REPORT_PRESET = "30_dias" as const;

/** `?tipo=` do relatório por categoria. */
export const REPORT_CATEGORY_TYPES = ["despesas", "receitas"] as const;

export const DEFAULT_REPORT_CATEGORY_TYPE = "despesas" as const;

/** Menor data aceita no período personalizado. */
export const MIN_PERIOD_DATE = "2000-01-01" as ISODate;

/** Teto do período personalizado, em dias corridos (ADR-0020). */
export const MAX_PERIOD_DAYS = 366;

/** Meses do fluxo de caixa (D17). */
export const CASH_FLOW_MONTHS = 6;

/** Fatias do gráfico por categoria (D16): com mais categorias, 5 + "Outras categorias". */
export const MAX_SLICES = 6;

export const OTHER_CATEGORIES_KEY = "outras-categorias";
export const OTHER_CATEGORIES_NAME = "Outras categorias";
export const REMOVED_CATEGORY_NAME = "Categoria removida";

export const RECENT_TRANSACTIONS_LIMIT = 5;

/** Horizontes (meses à frente, além do mês atual) do acompanhamento do comprometimento futuro. */
export const COMMITMENT_HORIZONS = [6, 12] as const;

export const DEFAULT_COMMITMENT_HORIZON = 12 as const;

/** Teto de ocorrências geradas por série no horizonte (semanal em 13 meses ≈ 57). */
export const MAX_OCCURRENCES_PER_SERIES = 120;

/** Linhas lidas por consulta de compromissos (abaixo do teto de 1000 do PostgREST). */
export const MAX_COMMITMENT_ROWS = 1000;

/** Metas no card do /inicio. */
export const DASHBOARD_GOALS_LIMIT = 3;
