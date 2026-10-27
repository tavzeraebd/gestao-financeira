export const FREQUENCIES = ["weekly", "monthly", "yearly"] as const;

export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Toda semana",
  monthly: "Todo mês",
  yearly: "Todo ano",
};

/** Unidade do campo "A cada" (singular, plural). */
export const FREQUENCY_UNITS: Record<Frequency, readonly [string, string]> = {
  weekly: ["semana", "semanas"],
  monthly: ["mês", "meses"],
  yearly: ["ano", "anos"],
};

export const INTERVAL_MAX = 12;

/** Séries ativas por família (ADR-0023 §6). */
export const RECURRENCE_LIMIT = 100;

/** Valores de `?situacao=` em /recorrencias. */
export const RECURRENCE_SITUATIONS = [
  "ativas",
  "pausadas",
  "encerradas",
] as const;

export type RecurrenceSituation = (typeof RECURRENCE_SITUATIONS)[number];

export const DEFAULT_RECURRENCE_SITUATION: RecurrenceSituation = "ativas";

export const RECURRENCE_STATES = [
  "active",
  "paused",
  "ended",
  "attention",
] as const;

export type RecurrenceState = (typeof RECURRENCE_STATES)[number];

/** `last_failure_code` da série -> mensagem com o próximo passo. */
export const ATTENTION_MESSAGES: Record<string, string> = {
  ACCOUNT_ARCHIVED:
    "A conta desta recorrência está arquivada e as próximas ocorrências não foram criadas. Edite a série e escolha outra conta.",
  CATEGORY_ARCHIVED:
    "A categoria desta recorrência está arquivada e as próximas ocorrências não foram criadas. Edite a série e escolha outra categoria.",
  INVALID_INPUT:
    "O responsável desta recorrência não está mais ativo na família. Edite a série e escolha outro responsável ou deixe em branco.",
  DATE_BEFORE_OPENING_BALANCE:
    "A conta desta recorrência tem saldo inicial posterior às datas da série. Edite a série e escolha outra conta.",
  RECURRENCE_AUTHOR_INACTIVE:
    "Quem criou esta recorrência não faz mais parte da família. Peça a quem administra para encerrá-la e criar outra.",
  INTERNAL_ERROR:
    "Não foi possível criar as próximas ocorrências. Abra a página novamente em instantes; se continuar, edite a série.",
};
