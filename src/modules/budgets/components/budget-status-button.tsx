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
import { archiveBudget, unarchiveBudget } from "@/modules/budgets/actions";

export function BudgetStatusButton({
  budgetId,
  name,
  archived,
}: {
  budgetId: string;
  name: string;
  archived: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (kind: "archive" | "unarchive") => {
    if (pending) return;
    startTransition(async () => {
      const result = await safeAction(() =>
        kind === "archive"
          ? archiveBudget({ budgetId })
          : unarchiveBudget({ budgetId }),
      );
      if (result.ok) {
        toast.success(
          kind === "archive" ? "Orçamento arquivado" : "Orçamento reativado",
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

  if (archived) {
    return (
      <Button
        type="button"
        variant="outline"
        loading={pending}
        disabled={!hydrated}
        aria-label={`Reativar orçamento ${name}`}
        onClick={() => run("unarchive")}
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
            aria-label={`Arquivar orçamento ${name}`}
          />
        }
      >
        <ArchiveIcon aria-hidden="true" data-icon="inline-start" />
        Arquivar
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Arquivar o orçamento {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            O orçamento deixa de aparecer entre os ativos. Você pode reativá-lo
            depois na aba Arquivados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            Manter orçamento
          </AlertDialogCancel>
          <AlertDialogAction loading={pending} onClick={() => run("archive")}>
            Arquivar orçamento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
