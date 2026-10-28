"use client";

import { Trash2Icon } from "lucide-react";
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
import { deleteSettlement } from "@/modules/splits/actions";

export function DeleteSettlementButton({
  settlementId,
}: {
  settlementId: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      const result = await safeAction(() => deleteSettlement({ settlementId }));
      if (result.ok) {
        toast.success("Acerto excluído");
        setOpen(false);
        router.refresh();
        return;
      }
      if (sessionExpired(result.error)) return;
      toast.error(result.error.message);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="outline" size="sm" disabled={!hydrated} />}
      >
        <Trash2Icon aria-hidden="true" data-icon="inline-start" />
        Excluir
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir este acerto?</AlertDialogTitle>
          <AlertDialogDescription>
            O saldo entre os integrantes volta a considerar o valor que este
            acerto havia quitado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            Manter acerto
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={remove}
          >
            Excluir acerto
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
