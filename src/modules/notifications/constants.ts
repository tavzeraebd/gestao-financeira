export const NOTIFICATION_TYPES = [
  "bill_due_soon",
  "bill_overdue",
  "goal_near_target",
  "budget_near_limit",
  "member_joined",
  "financial_event",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_ENTITY_TYPES = [
  "transaction",
  "goal",
  "budget",
  "family_member",
  "settlement",
] as const;

export type NotificationEntityType = (typeof NOTIFICATION_ENTITY_TYPES)[number];

export const NOTIFICATION_TAB_KEYS = [
  "todas",
  "lembretes",
  "conquistas",
] as const;

export type NotificationTab = (typeof NOTIFICATION_TAB_KEYS)[number];

export const DEFAULT_NOTIFICATION_TAB: NotificationTab = "todas";

export const NOTIFICATION_TABS: Record<
  NotificationTab,
  readonly NotificationType[]
> = {
  todas: NOTIFICATION_TYPES,
  lembretes: ["bill_due_soon", "bill_overdue", "budget_near_limit"],
  conquistas: ["goal_near_target"],
};

export const NOTIFICATION_TAB_LABELS: Record<NotificationTab, string> = {
  todas: "Todas",
  lembretes: "Lembretes",
  conquistas: "Conquistas",
};

/** Notificações por página em `/notificacoes`. */
export const NOTIFICATIONS_PAGE_SIZE = 20;

export const NOTIFICATION_ICONS = [
  "bill",
  "overdue",
  "budget",
  "goal",
  "member",
  "event",
] as const;

export type NotificationIcon = (typeof NOTIFICATION_ICONS)[number];
