import Link from "next/link";

import { cn } from "@/lib/utils";
import {
  DEFAULT_NOTIFICATION_TAB,
  NOTIFICATION_TAB_KEYS,
  NOTIFICATION_TAB_LABELS,
  type NotificationTab,
} from "@/modules/notifications/constants";

/** Link da aba: `todas` é o padrão e não vai para a URL; trocar de aba volta à primeira página. */
export function notificationTabHref(tab: NotificationTab): string {
  return tab === DEFAULT_NOTIFICATION_TAB
    ? "/notificacoes"
    : `/notificacoes?aba=${tab}`;
}

/** Abas por link (`?aba=`): funcionam sem JavaScript e a aba ativa sobrevive ao reload e ao "voltar". */
export function NotificationTabs({ active }: { active: NotificationTab }) {
  return (
    <nav aria-label="Tipos de notificação" className="max-w-full">
      <ul className="bg-muted inline-flex max-w-full gap-1 overflow-x-auto rounded-lg p-1">
        {NOTIFICATION_TAB_KEYS.map((tab) => {
          const isActive = tab === active;
          return (
            <li key={tab} className="shrink-0">
              <Link
                href={notificationTabHref(tab)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 focus-visible:border-ring flex min-h-10 items-center justify-center rounded-md border border-transparent px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                  isActive
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {NOTIFICATION_TAB_LABELS[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
