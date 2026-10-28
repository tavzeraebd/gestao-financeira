import { BellIcon } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationNav } from "@/components/shared/pagination-nav";
import { MarkAllReadButton } from "@/modules/notifications/components/mark-all-read-button";
import { NotificationList } from "@/modules/notifications/components/notification-list";
import { NotificationTabs } from "@/modules/notifications/components/notification-tabs";
import { DEFAULT_NOTIFICATION_TAB } from "@/modules/notifications/constants";
import { listNotifications } from "@/modules/notifications/queries";
import { notificationFiltersSchema } from "@/modules/notifications/schemas";

export const metadata: Metadata = { title: "Notificações" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const { aba } = notificationFiltersSchema.parse(raw);
  const { items, unread, page, pageCount } = await listNotifications(raw);

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (aba !== DEFAULT_NOTIFICATION_TAB) params.set("aba", aba);
    if (target > 1) params.set("pagina", String(target));
    const query = params.toString();
    return query ? `/notificacoes?${query}` : "/notificacoes";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notificações"
        description={
          unread === 0
            ? "Você está em dia: nenhuma notificação não lida."
            : unread === 1
              ? "1 notificação não lida."
              : `${unread} notificações não lidas.`
        }
        actions={<MarkAllReadButton unread={unread} />}
      />
      <NotificationTabs active={aba} />
      {items.length === 0 ? (
        <EmptyState
          icon={BellIcon}
          title="Nenhuma notificação"
          description="Avisos de vencimentos, metas, orçamentos e da família aparecem aqui."
        />
      ) : (
        <>
          <NotificationList items={items} />
          <PaginationNav
            page={page}
            pageCount={pageCount}
            hrefForPage={hrefForPage}
          />
        </>
      )}
    </div>
  );
}
