/** Grupos do filtro de `/familia/atividade`: prefixos de `action` (ou a própria ação, quando completa). */
export const ACTIVITY_GROUPS = {
  familia: ["family.", "member.", "invite."],
  lancamentos: ["transaction.", "account.", "category."],
  compromissos: ["recurrence.", "transaction.paid", "transaction.canceled"],
  metas: ["goal.", "goal_contribution."],
  divisao: ["transaction.splits_changed", "settlement."],
} as const;

export type ActivityGroup = keyof typeof ACTIVITY_GROUPS;

export const ACTIVITY_GROUP_KEYS = Object.keys(ACTIVITY_GROUPS) as [
  ActivityGroup,
  ...ActivityGroup[],
];

export const ACTIVITY_GROUP_LABELS: Record<ActivityGroup, string> = {
  familia: "Família",
  lancamentos: "Lançamentos",
  compromissos: "Compromissos",
  metas: "Metas",
  divisao: "Divisão",
};

/** Catálogo fechado de ações auditadas (`data-model.md` §4.6 e migrations). */
export const AUDIT_ACTIONS = [
  "family.created",
  "family.updated",
  "family.ownership_transferred",
  "invite.created",
  "invite.revoked",
  "member.joined",
  "member.role_changed",
  "member.removed",
  "member.left",
  "member.action_denied",
  "account.archived",
  "account.reactivated",
  "account.opening_balance_changed",
  "category.archived",
  "category.unarchived",
  "category.deleted",
  "transaction.updated",
  "transaction.deleted",
  "transaction.canceled",
  "transaction.reversed",
  "transaction.paid",
  "transaction.splits_changed",
  "recurrence.paused",
  "recurrence.resumed",
  "recurrence.series_updated",
  "goal.status_changed",
  "goal.updated",
  "goal_contribution.deleted",
  "settlement.created",
  "settlement.deleted",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Ações do catálogo que pertencem ao grupo (prefixo ou ação completa). */
export function actionsOfGroup(group: ActivityGroup): AuditAction[] {
  const prefixes: readonly string[] = ACTIVITY_GROUPS[group];
  return AUDIT_ACTIONS.filter((a) => prefixes.some((p) => a.startsWith(p)));
}

export const ACTIVITY_PAGE_SIZES = [20, 50] as const;

export type ActivityPageSize = (typeof ACTIVITY_PAGE_SIZES)[number];

export const DEFAULT_ACTIVITY_PAGE_SIZE: ActivityPageSize = 20;

export const FORMER_ACTOR_NAME = "Ex-integrante";
export const SYSTEM_ACTOR_NAME = "Sistema";
