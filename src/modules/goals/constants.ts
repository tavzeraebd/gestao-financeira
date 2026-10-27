export const GOAL_STATUSES = [
  "active",
  "paused",
  "completed",
  "canceled",
] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluída",
  canceled: "Cancelada",
};

/** As 12 chaves aceitas por `goals_icon_check`, com o rótulo pt-BR da grade de escolha. */
export const GOAL_ICONS = [
  "target",
  "plane",
  "house",
  "car",
  "shield",
  "graduation-cap",
  "heart-pulse",
  "gift",
  "baby",
  "briefcase",
  "laptop",
  "piggy-bank",
] as const;

export type GoalIconName = (typeof GOAL_ICONS)[number];

/** Valor do banco -> ícone conhecido (`goals_icon_check` garante; o padrão cobre dado inesperado). */
export function toGoalIcon(value: string): GoalIconName {
  return (GOAL_ICONS as readonly string[]).includes(value)
    ? (value as GoalIconName)
    : "target";
}

export const DEFAULT_GOAL_ICON: GoalIconName = "target";

export const GOAL_ICON_LABELS: Record<GoalIconName, string> = {
  target: "Objetivo",
  plane: "Viagem",
  house: "Casa",
  car: "Carro",
  shield: "Reserva de emergência",
  "graduation-cap": "Estudos",
  "heart-pulse": "Saúde",
  gift: "Presente",
  baby: "Família e filhos",
  briefcase: "Trabalho",
  laptop: "Equipamento",
  "piggy-bank": "Poupança",
};

export const CONTRIBUTION_KINDS = ["deposit", "withdrawal"] as const;

export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export const CONTRIBUTION_KIND_LABELS: Record<ContributionKind, string> = {
  deposit: "Aporte",
  withdrawal: "Retirada",
};

/** D9: meta "perto de ser alcançada" (notificação da Etapa 7) = ativa com 80% ≤ % < 100%. */
export const NEAR_TARGET_PERCENT = 80;

/** D9: janela do ritmo atual, em dias (hoje − 89 .. hoje); o ritmo é o líquido da janela ÷ 3. */
export const PACE_WINDOW_DAYS = 90;

/** Meses da janela do ritmo (`PACE_WINDOW_DAYS` ÷ 30). */
export const PACE_WINDOW_MONTHS = 3;

export const GOAL_FILTERS = ["ativas", "concluidas", "todas"] as const;

export type GoalFilter = (typeof GOAL_FILTERS)[number];

export const DEFAULT_GOAL_FILTER: GoalFilter = "ativas";

export const GOAL_FILTER_LABELS: Record<GoalFilter, string> = {
  ativas: "Ativas",
  concluidas: "Concluídas",
  todas: "Todas",
};

export const GOAL_NAME_MAX = 80;
export const GOAL_DESCRIPTION_MAX = 500;
export const CONTRIBUTION_NOTES_MAX = 500;

/** Aportes por página no histórico da meta. */
export const CONTRIBUTIONS_PAGE_SIZE = 20;
