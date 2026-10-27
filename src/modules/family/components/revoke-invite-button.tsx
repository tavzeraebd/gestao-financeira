"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useSessionExpiredRedirect } from "@/hooks/use-action-failure";
import { revokeInvite } from "@/modules/family/actions";

export function RevokeInviteButton({
  inviteId,
  label,
}: {
  inviteId: string;
  /** Descrição do convite para o leitor de tela (ex.: "convite para ana@exemplo.com"). */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const sessionExpired = useSessionExpiredRedirect();
  const [pending, startTransition] = useTransition();

  const revoke = () => {
    startTransition(async () => {
      const result = await revokeInvite({ inviteId });
      if (result.ok) {
        toast.success("Convite revogado.");
      } else {
        if (!sessionExpired(result.error)) toast.error(result.error.message);
      }
      setOpen(false);
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="outline" aria-label={`Revogar ${label}`} />}
      >
        Revogar
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revogar este convite?</AlertDialogTitle>
          <AlertDialogDescription>
            O link deixa de funcionar na hora. Quem ainda não aceitou precisará
            de um novo convite.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            Manter convite
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={revoke}
          >
            Revogar convite
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
