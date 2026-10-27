export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
};

export const TRANSACTION_STATUSES = ["pending", "paid", "canceled"] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Valores de `?tipo=` na URL -> `type` do banco. */
export const TYPE_FILTER_VALUES = {
  receita: "income",
  despesa: "expense",
  transferencia: "transfer",
} as const satisfies Record<string, TransactionType>;

export type TypeFilter = keyof typeof TYPE_FILTER_VALUES;

export const TYPE_FILTERS = ["receita", "despesa", "transferencia"] as const;

export const ORDER_OPTIONS = [
  "data_desc",
  "data_asc",
  "valor_desc",
  "valor_asc",
] as const;

export type OrderOption = (typeof ORDER_OPTIONS)[number];

export const DEFAULT_ORDER: OrderOption = "data_desc";

export const PAGE_SIZES = [20, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZES)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 20;

/** Valor de `?responsavel=` para lançamentos sem responsável. */
export const NO_MEMBER_FILTER = "nenhum";

export const DESCRIPTION_MAX = 120;
export const NOTES_MAX = 1000;
export const SEARCH_MAX = 100;
