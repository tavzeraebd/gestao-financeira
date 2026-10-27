"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { safeAction, useFailureHandler } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ISODate } from "@/lib/dates";
import { LabeledField } from "@/modules/transactions/components/labeled-field";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";
import { createSettlement } from "@/modules/splits/actions";
import { SETTLEMENT_NOTES_MAX } from "@/modules/splits/constants";
import { settlementSchema } from "@/modules/splits/schemas";

type SettlementValues = {
  fromMemberId: string;
  toMemberId: string;
  amount: string;
  settlementDate: string;
  notes: string;
  idempotencyKey: string;
};

const FIELDS = [
  "fromMemberId",
  "toMemberId",
  "amount",
  "settlementDate",
  "notes",
] as const;

type SettlementFormProps = {
  members: { id: string; displayName: string }[];
  myMemberId: string;
  /** owner/admin registram acerto entre quaisquer integrantes; member, só em que ele é uma das partes. */
  canManage: boolean;
  today: ISODate;
};

export function SettlementForm({
  members,
  myMemberId,
  canManage,
  today,
}: SettlementFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // Só para member: de que lado ele está (o outro lado é escolhido na lista).
  const [mySide, setMySide] = useState<"from" | "to">("from");
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useForm<SettlementValues>({
    resolver: zodResolver(settlementSchema) as unknown as Resolver<SettlementValues>,
    defaultValues: {
      fromMemberId: canManage ? "" : myMemberId,
      toMemberId: "",
      amount: "",
      settlementDate: today,
      notes: "",
      idempotencyKey,
    },
  });

  const showGeneral = useCallback((m: string) => setFormError(m), []);
  const handleFailure = useFailureHandler(form.setError, FIELDS, showGeneral);
  const options = useMemo<SelectOption[]>(
    () => members.map((m) => ({ value: m.id, label: m.displayName })),
    [members],
  );

  function changeSide(side: "from" | "to") {
    setMySide(side);
    form.setValue(side === "from" ? "fromMemberId" : "toMemberId", myMemberId);
    form.setValue(side === "from" ? "toMemberId" : "fromMemberId", "");
  }

  const onSubmit = form.handleSubmit(() => {
    if (pending) return;
    const values = form.getValues();
    setFormError(null);
    startTransition(async () => {
      const result = await safeAction(() =>
        createSettlement({
          fromMemberId: values.fromMemberId,
          toMemberId: values.toMemberId,
          amount: values.amount,
          settlementDate: values.settlementDate,
          notes: values.notes,
          idempotencyKey,
        }),
      );
      if (result.ok) {
        toast.success("Acerto registrado");
        router.push("/divisao/acertos");
        router.refresh();
        return;
      }
      handleFailure(result.error);
    });
  });

  const fromLocked = !canManage && mySide === "from";
  const toLocked = !canManage && mySide === "to";

  return (
    <form
      method="post"
      noValidate
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
    >
      {formError ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Não foi possível registrar o acerto</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {!canManage ? (
        <SegmentedControl
          aria-label="Seu lado no acerto"
          value={mySide}
          onValueChange={changeSide}
          options={[
            { value: "from", label: "Eu paguei" },
            { value: "to", label: "Eu recebi" },
          ]}
        />
      ) : null}

      <LabeledField
        control={form.control}
        name="fromMemberId"
        id="acerto-de"
        label="De (quem pagou)"
      >
        {(f) => (
          <OptionSelect
            id={f.id}
            value={f.value}
            onValueChange={f.onChange}
            onBlur={f.onBlur}
            options={options}
            placeholder="Selecione quem pagou"
            disabled={fromLocked}
            invalid={f.invalid}
            describedBy={f.describedBy}
          />
        )}
      </LabeledField>
      <LabeledField
        control={form.control}
        name="toMemberId"
        id="acerto-para"
        label="Para (quem recebeu)"
      >
        {(f) => (
          <OptionSelect
            id={f.id}
            value={f.value}
            onValueChange={f.onChange}
            onBlur={f.onBlur}
            options={options}
            placeholder="Selecione quem recebeu"
            disabled={toLocked}
            invalid={f.invalid}
            describedBy={f.describedBy}
          />
        )}
      </LabeledField>
      <LabeledField
        control={form.control}
        name="amount"
        id="acerto-valor"
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
        name="settlementDate"
        id="acerto-data"
        label="Data do acerto"
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
        name="notes"
        id="acerto-observacao"
        label="Observação (opcional)"
      >
        {(f) => (
          <Textarea
            id={f.id}
            name={f.name}
            ref={f.ref}
            value={f.value}
            onChange={(event) => f.onChange(event.target.value)}
            onBlur={f.onBlur}
            rows={3}
            maxLength={SETTLEMENT_NOTES_MAX + 100}
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <p className="text-muted-foreground text-sm">
        O acerto registra um pagamento entre integrantes. Não altera contas nem
        o saldo total.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending} disabled={!hydrated}>
          Salvar acerto
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push("/divisao/acertos")}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
