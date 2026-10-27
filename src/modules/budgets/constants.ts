export const BUDGET_STATUSES = ["ok", "attention", "exceeded"] as const;

export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  ok: "Dentro do limite",
  attention: "Atenção",
  exceeded: "Limite estourado",
};

/** D14: a partir de 80% do limite o orçamento pede atenção (inclusive). */
export const ATTENTION_PERCENT = 80;

/** D14: meses anteriores mostrados na comparação. */
export const HISTORY_MONTHS = 3;

/** `budget_progress` aceita até 12 meses por chamada. */
export const MAX_PROGRESS_MONTHS = 12;

export const ALL_EXPENSES_LABEL = "Todas as despesas";
