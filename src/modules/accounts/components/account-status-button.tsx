"use client";

import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { archiveAccount, reactivateAccount } from "@/modules/accounts/actions";

export function AccountStatusButton({
  accountId,
  name,
  isActive,
}: {
  accountId: string;
  name: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (kind: "archive" | "reactivate") => {
    startTransition(async () => {
      const result = await safeAction(() =>
        kind === "archive"
          ? archiveAccount({ accountId })
          : reactivateAccount({ accountId }),
      );
      if (result.ok) {
        toast.success(
          kind === "archive" ? "Conta arquivada" : "Conta reativada",
        );
        setOpen(false);
        router.refresh();
        return;
      }
      if (sessionExpired(result.error)) return;
      toast.error(result.error.message);
      setOpen(false);
    });
  };

  if (!isActive) {
    return (
      <Button
        type="button"
        variant="outline"
        loading={pending}
        disabled={!hydrated}
        aria-label={`Reativar ${name}`}
        onClick={() => run("reactivate")}
      >
        <ArchiveRestoreIcon aria-hidden="true" data-icon="inline-start" />
        Reativar
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            disabled={!hydrated}
            aria-label={`Arquivar ${name}`}
          />
        }
      >
        <ArchiveIcon aria-hidden="true" data-icon="inline-start" />
        Arquivar
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            A conta continua no saldo total e no histórico; não recebe
            lançamentos novos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Manter conta</AlertDialogCancel>
          <AlertDialogAction loading={pending} onClick={() => run("archive")}>
            Arquivar conta
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
