import type {
  NotificationIcon,
  NotificationTab,
  NotificationType,
} from "./constants";

/** Linha de `notifications` como o app a lê (o banco garante `type` e `entity_type` por check). */
export type NotificationRow = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  /** Instantâneo gravado pelo banco; formato por tipo (ADR-0029). Tratar como não confiável. */
  data: unknown;
  createdAt: string;
  readAt: string | null;
};

export type NotificationView = {
  id: string;
  type: NotificationType | "unknown";
  title: string;
  message: string;
  icon: NotificationIcon;
  createdAt: string;
  read: boolean;
  hasLink: boolean;
};

export type NotificationList = {
  items: NotificationView[];
  /** Total de não lidas (todas as abas). */
  unread: number;
  page: number;
  pageCount: number;
};

export type NotificationFilters = { aba: NotificationTab; pagina: number };
