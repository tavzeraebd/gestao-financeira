"use client";

import { AlertCircleIcon, CircleStopIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ISODate } from "@/lib/dates";
import { endRecurrence } from "@/modules/recurrences/actions";

type EndProps = {
  recurrenceId: string;
  description: string;
  startDate: ISODate;
  today: ISODate;
};

export function EndRecurrenceDialog(props: EndProps) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="destructive-outline"
            size="lg"
            className="w-11 px-0"
            disabled={!hydrated}
            aria-label={`Encerrar ${props.description}`}
            title="Encerrar"
          />
        }
      >
        <CircleStopIcon aria-hidden="true" data-icon="inline-start" />
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        {open ? <EndForm {...props} onClose={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EndForm({
  recurrenceId,
  description,
  startDate,
  today,
  onClose,
}: EndProps & { onClose: () => void }) {
  const router = useRouter();
  const sessionExpired = useSessionExpiredRedirect();
  const [pending, startTransition] = useTransition();
  const [endDate, setEndDate] = useState<string>(
    today < startDate ? startDate : today,
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (pending) return;
    if (!endDate) {
      setError("Informe a data da última ocorrência.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() =>
        endRecurrence({ recurrenceId, endDate: endDate as ISODate }),
      );
      if (result.ok) {
        toast.success("Recorrência encerrada");
        onClose();
        router.refresh();
        return;
      }
      if (sessionExpired(result.error)) return;
      setError(result.error.message);
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Encerrar {description}?</DialogTitle>
        <DialogDescription>
          As próximas ocorrências que você não alterou deixam de existir. As
          pagas e as alteradas ficam.
        </DialogDescription>
      </DialogHeader>
      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`encerrar-${recurrenceId}`}>Última ocorrência em</Label>
        <DatePicker
          id={`encerrar-${recurrenceId}`}
          value={endDate}
          onChange={setEndDate}
          today={today}
          min={startDate}
          aria-invalid={error !== null}
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onClose}
        >
          Manter série
        </Button>
        <Button
          type="button"
          variant="destructive"
          loading={pending}
          onClick={submit}
        >
          Encerrar série
        </Button>
      </DialogFooter>
    </>
  );
}
