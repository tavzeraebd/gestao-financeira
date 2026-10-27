import type { ISODate } from "@/lib/dates";

export const PERIOD_PRESETS = [
  "mes_atual",
  "mes_anterior",
  "personalizado",
] as const;

export const DEFAULT_PERIOD_PRESET = "mes_atual" as const;

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

/** Metas no card do /inicio. */
export const DASHBOARD_GOALS_LIMIT = 3;
