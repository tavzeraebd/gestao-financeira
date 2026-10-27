"use client";

import {
  CircleCheckIcon,
  CirclePauseIcon,
  CircleXIcon,
  PlayIcon,
} from "lucide-react";
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
import { changeGoalStatus } from "@/modules/goals/actions";
import { goalErrorMessage } from "./goal-error-message";

export type GoalStatusTarget = "active" | "paused" | "completed" | "canceled";

const COPY = {
  active: {
    label: "Reativar",
    icon: PlayIcon,
    success: "Meta reativada",
    confirm: null,
  },
  paused: {
    label: "Pausar",
    icon: CirclePauseIcon,
    success: "Meta pausada",
    confirm: null,
  },
  completed: {
    label: "Concluir",
    icon: CircleCheckIcon,
    success: "Meta concluída",
    confirm: {
      title: "Concluir a meta",
      description:
        "A meta passa para Concluídas e deixa de receber aportes. Você poderá consultar o histórico.",
      action: "Concluir meta",
      keep: "Manter meta",
    },
  },
  canceled: {
    label: "Cancelar",
    icon: CircleXIcon,
    success: "Meta cancelada",
    confirm: {
      title: "Cancelar a meta",
      description:
        "A meta deixa de receber aportes. Isso não pode ser desfeito.",
      action: "Cancelar meta",
      keep: "Manter meta",
    },
  },
} as const;

export function GoalStatusButton({
  goalId,
  name,
  to,
}: {
  goalId: string;
  name: string;
  to: GoalStatusTarget;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const copy = COPY[to];
  const Icon = copy.icon;

  const run = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await safeAction(() => changeGoalStatus({ goalId, to }));
      if (result.ok) {
        toast.success(copy.success);
        setOpen(false);
        router.refresh();
        return;
      }
      if (sessionExpired(result.error)) return;
      toast.error(goalErrorMessage(result.error));
      setOpen(false);
      router.refresh();
    });
  };

  if (!copy.confirm) {
    return (
      <Button
        type="button"
        variant="outline"
        loading={pending}
        disabled={!hydrated}
        aria-label={`${copy.label} meta ${name}`}
        onClick={run}
      >
        <Icon aria-hidden="true" data-icon="inline-start" />
        {copy.label}
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
            aria-label={`${copy.label} meta ${name}`}
          />
        }
      >
        <Icon aria-hidden="true" data-icon="inline-start" />
        {copy.label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {copy.confirm.title} {name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {copy.confirm.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {copy.confirm.keep}
          </AlertDialogCancel>
          <AlertDialogAction loading={pending} onClick={run}>
            {copy.confirm.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
