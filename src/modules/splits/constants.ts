/** Modos de divisão oferecidos na tela (`none` é a remoção, feita por botão próprio). */
export const SPLIT_MODES = ["equal", "amounts"] as const;

export type SplitMode = (typeof SPLIT_MODES)[number];

export const SPLIT_MODE_LABELS: Record<SplitMode, string> = {
  equal: "Igualmente",
  amounts: "Por valores",
};

/** D10: de 2 a 20 integrantes distintos por divisão. */
export const MIN_PARTS = 2;
export const MAX_PARTS = 20;

export const SPLIT_FILTERS = ["todas", "pendentes", "pagas"] as const;

export type SplitFilter = (typeof SPLIT_FILTERS)[number];

export const DEFAULT_SPLIT_FILTER: SplitFilter = "todas";

export const SPLIT_FILTER_LABELS: Record<SplitFilter, string> = {
  todas: "Todas",
  pendentes: "Pendentes",
  pagas: "Pagas",
};

export const SETTLEMENT_NOTES_MAX = 500;

export const SPLIT_PAGE_SIZES = [20, 50, 100] as const;

export const DEFAULT_SPLIT_PAGE_SIZE = 20;

/** Acertos por página em `/divisao/acertos`. */
export const SETTLEMENTS_PAGE_SIZE = 20;
