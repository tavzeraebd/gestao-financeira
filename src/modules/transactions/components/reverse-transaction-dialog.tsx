"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, Undo2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { safeAction, useFailureHandler } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ISODate } from "@/lib/dates";
import { toBRLInput, type Cents } from "@/lib/money";
import { reverseTransaction } from "@/modules/transactions/actions";
import { LabeledField } from "@/modules/transactions/components/labeled-field";
import { reverseTransactionSchema } from "@/modules/transactions/schemas";

type ReverseValues = {
  transactionId: string;
  amount: string;
  transactionDate: string;
  idempotencyKey: string;
};

const FIELDS = ["amount", "transactionDate"] as const;

type ReverseProps = {
  transactionId: string;
  reversibleAmount: Cents;
  originalDate: ISODate;
  today: ISODate;
};

/**
 * O formulário só existe com o diálogo aberto: cada abertura gera uma chave de idempotência
 * nova e parte do valor ainda estornável (estornos parciais seguidos não reusam a chave).
 */
export function ReverseTransactionDialog(props: ReverseProps) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={!hydrated} />}>
        <Undo2Icon aria-hidden="true" data-icon="inline-start" />
        Estornar
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        {open ? (
          <ReverseForm {...props} onClose={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ReverseForm({
  transactionId,
  reversibleAmount,
  originalDate,
  today,
  onClose,
}: ReverseProps & { onClose: () => void }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useForm<ReverseValues>({
    resolver: zodResolver(
      reverseTransactionSchema,
    ) as unknown as Resolver<ReverseValues>,
    defaultValues: {
      transactionId,
      amount: toBRLInput(reversibleAmount),
      transactionDate: today,
      idempotencyKey,
    },
  });

  const showGeneral = useCallback(
    (message: string) => setFormError(message),
    [],
  );
  const handleFailure = useFailureHandler(form.setError, FIELDS, showGeneral);

  const onSubmit = form.handleSubmit(() => {
    // O resolver devolve valores já convertidos (Cents); a action recebe o texto digitado.
    const values = form.getValues();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await safeAction(() =>
        reverseTransaction({
          transactionId,
          amount: values.amount,
          transactionDate: values.transactionDate,
          idempotencyKey: values.idempotencyKey,
        }),
      );
      if (result.ok) {
        toast.success("Estorno registrado");
        onClose();
        router.refresh();
        return;
      }
      handleFailure(result.error);
    });
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Estornar lançamento</DialogTitle>
        <DialogDescription>
          O estorno cria um novo lançamento que desfaz o efeito do original.
          Você pode estornar o valor todo ou parte dele.
        </DialogDescription>
      </DialogHeader>
      <form
        method="post"
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        {formError ? (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Não foi possível estornar</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <LabeledField
          control={form.control}
          name="amount"
          id="estorno-valor"
          label="Valor a estornar"
        >
          {(f) => (
            <MoneyInput
              id={f.id}
              name={f.name}
              ref={f.ref}
              value={f.value}
              onChange={f.onChange}
              onBlur={f.onBlur}
              aria-invalid={f.invalid}
              aria-describedby={f.describedBy}
            />
          )}
        </LabeledField>
        <LabeledField
          control={form.control}
          name="transactionDate"
          id="estorno-data"
          label="Data do estorno"
        >
          {(f) => (
            <DatePicker
              id={f.id}
              value={f.value}
              onChange={f.onChange}
              today={today}
              min={originalDate}
              max={today}
              aria-invalid={f.invalid}
              aria-describedby={f.describedBy}
            />
          )}
        </LabeledField>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={pending} disabled={!hydrated}>
            Registrar estorno
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
