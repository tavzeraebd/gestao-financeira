"use client";

import { PauseIcon, PlayIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  pauseRecurrence,
  resumeRecurrence,
} from "@/modules/recurrences/actions";

/** Pausar ou reativar uma série (sem confirmação: é reversível). */
export function PauseResumeButton({
  recurrenceId,
  description,
  paused,
}: {
  recurrenceId: string;
  description: string;
  paused: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (pending) return;
    startTransition(async () => {
      const result = await safeAction(() =>
        paused
          ? resumeRecurrence({ recurrenceId })
          : pauseRecurrence({ recurrenceId }),
      );
      if (result.ok) {
        toast.success(paused ? "Recorrência reativada" : "Recorrência pausada");
        router.refresh();
        return;
      }
      if (sessionExpired(result.error)) return;
      toast.error(result.error.message);
    });
  };

  const Icon = paused ? PlayIcon : PauseIcon;
  return (
    <Button
      type="button"
      variant={paused ? "success" : "outline"}
      size="lg"
      className="px-2.5 sm:px-5"
      loading={pending}
      disabled={!hydrated}
      aria-label={`${paused ? "Reativar" : "Pausar"} ${description}`}
      onClick={run}
    >
      <Icon aria-hidden="true" data-icon="inline-start" />
      {paused ? "Reativar" : "Pausar"}
    </Button>
  );
}
