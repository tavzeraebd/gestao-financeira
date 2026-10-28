"use client";

import {
  ArrowLeftRightIcon,
  CalendarClockIcon,
  TargetIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  WalletCardsIcon,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { cn } from "@/lib/utils";
import { openNotification } from "@/modules/notifications/actions";
import type { NotificationIcon } from "@/modules/notifications/constants";
import type { NotificationView } from "@/modules/notifications/types";

export const UNAVAILABLE_ITEM_MESSAGE = "Este item não está mais disponível.";

const ICONS: Record<NotificationIcon, { icon: LucideIcon; tone: string }> = {
  bill: {
    icon: CalendarClockIcon,
    tone: "bg-primary-soft-strong text-primary-text",
  },
  overdue: { icon: TriangleAlertIcon, tone: "bg-danger-soft text-danger" },
  budget: { icon: WalletCardsIcon, tone: "bg-warning-soft text-warning" },
  goal: { icon: TargetIcon, tone: "bg-success-soft text-success" },
  member: {
    icon: UserPlusIcon,
    tone: "bg-primary-soft-strong text-primary-text",
  },
  event: { icon: ArrowLeftRightIcon, tone: "bg-muted text-muted-foreground" },
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** "dd/mm" no fuso de Brasília; igual no servidor e no navegador (sem divergência na hidratação). */
export function formatNotificationDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** Lista de notificações: clicar marca como lida e leva ao recurso (`href` calculado no servidor). */
export function NotificationList({ items }: { items: NotificationView[] }) {
  const router = useRouter();
  const sessionExpired = useSessionExpiredRedirect();
  const [pending, startTransition] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const open = (item: NotificationView) => {
    setOpeningId(item.id);
    startTransition(async () => {
      const result = await safeAction(() =>
        openNotification({ notificationId: item.id }),
      );
      if (result.ok) {
        const { href } = result.data;
        if (href) router.push(href);
        else toast.info(UNAVAILABLE_ITEM_MESSAGE);
      } else if (!sessionExpired(result.error)) {
        toast.error(result.error.message);
        // A notificação pode ter saído da lista: recarrega para não ficar um item fantasma.
        if (result.error.code === "NOT_FOUND") router.refresh();
      }
      setOpeningId(null);
    });
  };

  return (
    <ul
      aria-label="Notificações"
      className="bg-card divide-y overflow-hidden rounded-xl border"
    >
      {items.map((item) => {
        const { icon: Icon, tone } = ICONS[item.icon];
        return (
          <li key={item.id}>
            <button
              type="button"
              disabled={pending}
              aria-busy={openingId === item.id}
              onClick={() => open(item)}
              className="hover:bg-muted focus-visible:ring-ring flex min-h-16 w-full cursor-pointer items-start gap-3 p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset disabled:cursor-wait disabled:opacity-70"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-lg",
                  tone,
                )}
              >
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  {!item.read ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="bg-primary size-2 shrink-0 rounded-full"
                      />
                      <span className="sr-only">Não lida</span>
                    </>
                  ) : null}
                  <span
                    className={cn(
                      "text-foreground truncate text-sm",
                      item.read ? "font-medium" : "font-semibold",
                    )}
                  >
                    {item.title}
                  </span>
                </span>
                <span className="text-muted-foreground text-sm">
                  {item.message}
                </span>
              </span>
              <time
                dateTime={item.createdAt}
                className="text-muted-foreground shrink-0 text-xs tabular-nums"
              >
                {formatNotificationDate(item.createdAt)}
              </time>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
