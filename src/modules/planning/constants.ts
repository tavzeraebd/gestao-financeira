export const SCENARIOS = [
  "financiamento",
  "objetivo",
  "prazo_meta",
  "novo_compromisso",
  "reducao_despesas",
  "saldo_futuro",
] as const;

export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_LABELS: Record<Scenario, string> = {
  financiamento: "Comprar um carro ou bem financiado",
  objetivo: "Juntar para uma viagem ou objetivo",
  prazo_meta: "Prazo de uma meta",
  novo_compromisso: "Novo compromisso mensal",
  reducao_despesas: "Reduzir despesas",
  saldo_futuro: "Saldo futuro",
};

/** Cenários que dependem da base conhecida (contas, médias, metas); os demais funcionam sem contas. */
export const SCENARIOS_WITH_BASELINE: readonly Scenario[] = [
  "prazo_meta",
  "novo_compromisso",
  "reducao_despesas",
  "saldo_futuro",
];

export const PLANNING_DISCLAIMER =
  "Simulação para apoiar decisões. Não é recomendação nem aconselhamento financeiro.";

/** Limites de D15 (financiamento). */
export const FINANCING_MONTHS_MIN = 1;
export const FINANCING_MONTHS_MAX = 480;
export const RATE_MIN_PERCENT = 0;
export const RATE_MAX_PERCENT = 20;
export const RATE_MAX_DECIMALS = 4;

/** Juntar para um objetivo: prazo informado ou calculado, em meses. */
export const SAVING_MONTHS_MIN = 1;
export const SAVING_MONTHS_MAX = 480;

/** Saldo futuro: 1..12 meses. */
export const PROJECTION_MONTHS_MIN = 1;
export const PROJECTION_MONTHS_MAX = 12;

/** Redução de despesas: percentual 0 < p ≤ 100, até 2 casas. */
export const REDUCTION_PERCENT_MAX = 100;
export const REDUCTION_PERCENT_MAX_DECIMALS = 2;

/** Meses civis completos da base de médias (D15). */
export const AVERAGE_MONTHS = 3;
