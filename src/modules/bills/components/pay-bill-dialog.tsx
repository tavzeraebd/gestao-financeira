"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, CheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
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
import { payBill } from "@/modules/bills/actions";
import type { BillKind } from "@/modules/bills/constants";
import { payBillSchema } from "@/modules/bills/schemas";
import { LabeledField } from "@/modules/transactions/components/labeled-field";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";

type PayValues = {
  transactionId: string;
  paidOn: string;
  amount: string;
  accountId: string;
};

const FIELDS = ["paidOn", "amount", "accountId"] as const;

export type PayBillDialogProps = {
  bill: {
    id: string;
    kind: BillKind;
    amount: Cents;
    account: { id: string; name: string };
  };
  /** Contas ativas. A conta prevista só é pré-selecionada se estiver aqui. */
  accounts: { id: string; name: string }[];
  today: ISODate;
};

/** O formulário só existe com o diálogo aberto: cada abertura parte dos padrões do compromisso. */
export function PayBillDialog(props: PayBillDialogProps) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const label =
    props.bill.kind === "pagar" ? "Marcar como pago" : "Marcar como recebido";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="success"
            size="lg"
            className="px-2.5 sm:px-4"
            aria-label={label}
            disabled={!hydrated}
          />
        }
      >
        <CheckIcon aria-hidden="true" data-icon="inline-start" />
        {props.bill.kind === "pagar" ? "Pago" : "Recebido"}
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        {open ? (
          <PayForm {...props} title={label} onClose={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PayForm({
  bill,
  accounts,
  today,
  title,
  onClose,
}: PayBillDialogProps & { title: string; onClose: () => void }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<PayValues>({
    resolver: zodResolver(payBillSchema) as unknown as Resolver<PayValues>,
    defaultValues: {
      transactionId: bill.id,
      paidOn: today,
      amount: toBRLInput(bill.amount),
      accountId: accounts.some((a) => a.id === bill.account.id)
        ? bill.account.id
        : "",
    },
  });

  const showGeneral = useCallback(
    (message: string) => setFormError(message),
    [],
  );
  const handleFailure = useFailureHandler(form.setError, FIELDS, showGeneral);
  const accountOptions = useMemo<SelectOption[]>(
    () => accounts.map((a) => ({ value: a.id, label: a.name })),
    [accounts],
  );

  const onSubmit = form.handleSubmit(() => {
    // O resolver devolve valores convertidos (Cents); a action recebe o texto digitado.
    const values = form.getValues();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await safeAction(() =>
        payBill({
          transactionId: bill.id,
          paidOn: values.paidOn,
          amount: values.amount,
          accountId: values.accountId,
        }),
      );
      if (result.ok) {
        toast.success(
          bill.kind === "pagar"
            ? "Pagamento confirmado"
            : "Recebimento confirmado",
        );
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
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          O lançamento passa a contar no saldo e nos totais na data do
          pagamento.
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
            <AlertTitle>Não foi possível confirmar</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <LabeledField
          control={form.control}
          name="paidOn"
          id="pagamento-data"
          label="Data do pagamento"
        >
          {(f) => (
            <DatePicker
              id={f.id}
              value={f.value}
              onChange={f.onChange}
              today={today}
              max={today}
              aria-invalid={f.invalid}
              aria-describedby={f.describedBy}
            />
          )}
        </LabeledField>
        <LabeledField
          control={form.control}
          name="amount"
          id="pagamento-valor"
          label="Valor"
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
          name="accountId"
          id="pagamento-conta"
          label="Conta ou cartão"
        >
          {(f) => (
            <OptionSelect
              id={f.id}
              value={f.value}
              onValueChange={f.onChange}
              onBlur={f.onBlur}
              options={accountOptions}
              placeholder="Selecione a conta"
              invalid={f.invalid}
              describedBy={f.describedBy}
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
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
