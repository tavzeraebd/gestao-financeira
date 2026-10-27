"use client";

import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSessionExpiredRedirect } from "@/hooks/use-action-failure";
import { acceptInvite } from "@/modules/family/actions";
import type { ActionError } from "@/server/action";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const sessionExpired = useSessionExpiredRedirect();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);

  const accept = () => {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvite({ token });
      if (result.ok) return;
      if (sessionExpired(result.error)) return;
      const { code } = result.error;
      if (
        code === "INVITE_ALREADY_USED" ||
        code === "INVITE_EXPIRED" ||
        code === "INVITE_REVOKED"
      ) {
        // Mostra o estado final do convite, sem o botão "Aceitar".
        router.refresh();
        return;
      }
      setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" size="lg" loading={pending} onClick={accept}>
        Aceitar convite
      </Button>
    </div>
  );
}
