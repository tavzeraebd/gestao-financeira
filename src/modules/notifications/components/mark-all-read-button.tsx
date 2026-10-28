"use client";

import { CheckCheckIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { markAllNotificationsRead } from "@/modules/notifications/actions";

export function MarkAllReadButton({ unread }: { unread: number }) {
  const [pending, startTransition] = useTransition();
  const sessionExpired = useSessionExpiredRedirect();

  const markAll = () => {
    startTransition(async () => {
      const result = await safeAction(() => markAllNotificationsRead());
      if (result.ok) {
        const { count } = result.data;
        toast.success(
          count === 1
            ? "1 notificação marcada como lida."
            : `${count} notificações marcadas como lidas.`,
        );
        return;
      }
      if (!sessionExpired(result.error)) toast.error(result.error.message);
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      loading={pending}
      disabled={unread === 0}
      onClick={markAll}
    >
      <CheckCheckIcon aria-hidden="true" data-icon="inline-start" />
      Marcar todas como lidas
    </Button>
  );
}
