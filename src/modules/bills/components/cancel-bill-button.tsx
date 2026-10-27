"use client";

import { BanIcon } from "lucide-react";
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
import { cancelBill } from "@/modules/bills/actions";

export function CancelBillButton({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    startTransition(async () => {
      const result = await safeAction(() => cancelBill({ transactionId }));
      if (result.ok) {
        toast.success("Compromisso cancelado");
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
        render={<Button variant="outline" disabled={!hydrated} />}
      >
        <BanIcon aria-hidden="true" data-icon="inline-start" />
        Cancelar
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar este compromisso?</AlertDialogTitle>
          <AlertDialogDescription>
            O compromisso fica no histórico e deixa de aparecer como previsto.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            Manter compromisso
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={cancel}
          >
            Cancelar compromisso
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
