"use client";

import { LogOutIcon } from "lucide-react";
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
import { leaveFamily } from "@/modules/family/actions";

export function LeaveFamilyButton() {
  const router = useRouter();
  const sessionExpired = useSessionExpiredRedirect();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const leave = () => {
    startTransition(async () => {
      const result = await safeAction(() => leaveFamily());
      if (result.ok) {
        router.replace("/onboarding");
        return;
      }
      if (!sessionExpired(result.error)) toast.error(result.error.message);
      setOpen(false);
    });
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <AlertDialogTrigger render={<Button type="button" variant="outline" />}>
        <LogOutIcon aria-hidden="true" data-icon="inline-start" />
        Sair da família
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sair da família?</AlertDialogTitle>
          <AlertDialogDescription>
            Você perde o acesso aos dados desta família. O que você registrou
            continua com a família.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            Ficar na família
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={leave}
          >
            Sair da família
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
