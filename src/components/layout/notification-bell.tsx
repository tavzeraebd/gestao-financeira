import { BellIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const MAX_BADGE = 9;

/** Texto acessível do sino: o número entra no nome, o selo visual é decorativo. */
export function bellLabel(unread: number): string {
  if (unread <= 0) return "Notificações";
  return `Notificações, ${unread} ${unread === 1 ? "não lida" : "não lidas"}`;
}

type NotificationBellProps = {
  /** `null` = não foi possível contar; o sino aparece sem selo. */
  unread: number | null;
  active?: boolean;
};

export function NotificationBell({ unread, active }: NotificationBellProps) {
  const count = unread ?? 0;
  return (
    <Link
      href="/notificacoes"
      aria-label={bellLabel(count)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring/50 relative flex size-10 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-3",
        active && "bg-muted",
      )}
    >
      <BellIcon aria-hidden="true" className="size-5" />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="bg-danger text-danger-foreground absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] leading-4 font-semibold tabular-nums"
        >
          {count > MAX_BADGE ? `${MAX_BADGE}+` : count}
        </span>
      ) : null}
    </Link>
  );
}
