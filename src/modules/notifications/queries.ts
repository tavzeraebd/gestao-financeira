import "server-only";
import { today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { memberDisplayName } from "@/modules/family/domain/member-name";
import { listActiveMembers } from "@/modules/family/repository";
import { requireMembership } from "@/server/auth";
import { NOTIFICATION_TABS, NOTIFICATIONS_PAGE_SIZE } from "./constants";
import { renderNotification } from "./domain/render";
import { countUnreadNotifications, selectNotificationPage } from "./repository";
import { notificationFiltersSchema } from "./schemas";
import { ensureNotificationsRefreshed } from "./service";
import type { NotificationList, NotificationView } from "./types";

/** Central de notificações: gera as pendentes (falha silenciosa), lê com RLS e monta texto e ícone. */
export async function listNotifications(
  filters: unknown = {},
): Promise<NotificationList> {
  const membership = await requireMembership();
  await ensureNotificationsRefreshed();
  const supabase = await createClient();
  const { aba, pagina } = notificationFiltersSchema.parse(filters);

  const [{ items, total }, unread] = await Promise.all([
    selectNotificationPage(
      supabase,
      NOTIFICATION_TABS[aba],
      pagina,
      NOTIFICATIONS_PAGE_SIZE,
    ),
    countUnreadNotifications(supabase),
  ]);

  // Nomes só quando a página tem "novo integrante": uma consulta, nunca uma por item.
  let names = new Map<string, string>();
  if (items.some((n) => n.type === "member_joined")) {
    const members = await listActiveMembers(
      supabase,
      membership.familyId,
      membership.userId,
    );
    names = new Map(members.map((m) => [m.memberId, m.displayName]));
  }
  const now = today();
  const memberName = (id: string) => memberDisplayName(names.get(id) ?? null);

  const views: NotificationView[] = items.map((n) => {
    const rendered = renderNotification(n, { today: now, memberName });
    return {
      id: n.id,
      type: (NOTIFICATION_TABS.todas as readonly string[]).includes(n.type)
        ? (n.type as NotificationView["type"])
        : "unknown",
      title: rendered.title,
      message: rendered.message,
      icon: rendered.icon,
      createdAt: n.createdAt,
      read: n.readAt !== null,
      hasLink: rendered.href !== null,
    };
  });
  return {
    items: views,
    unread,
    page: pagina,
    pageCount: Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE)),
  };
}

/** Contador do sino (count `head`, RLS). Gera as pendentes antes, sem lançar. */
export async function getUnreadNotificationCount(): Promise<number> {
  await requireMembership();
  await ensureNotificationsRefreshed();
  const supabase = await createClient();
  return countUnreadNotifications(supabase);
}
