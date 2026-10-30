"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, InfoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { CategoryIcon } from "@/components/shared/category-icon";
import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { safeAction, useFailureHandler } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ISODate } from "@/lib/dates";
import type { BillKind } from "@/modules/bills/constants";
import type { CategoryOption } from "@/modules/categories/types";
import { updateRecurrence } from "@/modules/recurrences/actions";
import {
  PAYROLL_DEDUCTION_HELP,
  PAYROLL_DEDUCTION_LABEL,
} from "@/modules/recurrences/constants";
import { updateRecurrenceSchema } from "@/modules/recurrences/schemas";
import { LabeledField } from "@/modules/transactions/components/labeled-field";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";
import { DESCRIPTION_MAX } from "@/modules/transactions/constants";

export type RecurrenceFormValues = {
  recurrenceId: string;
  description: string;
  amount: string;
  categoryId: string;
  accountId: string;
  assignedMemberId: string;
  endDate: string;
  payrollDeduction: boolean;
};

type RecurrenceFormProps = {
  today: ISODate;
  recurrenceId: string;
  /** Tipo da série: "Desconto em folha" só existe para despesa (`pagar`). */
  kind: BillKind;
  /** Rótulo da agenda e início: só leitura. */
  scheduleLabel: string;
  startDate: ISODate;
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
  members: { id: string; displayName: string }[];
  initial: Omit<RecurrenceFormValues, "recurrenceId">;
};

const FIELDS = [
  "description",
  "amount",
  "categoryId",
  "accountId",
  "assignedMemberId",
  "endDate",
  "payrollDeduction",
] as const;

export function RecurrenceForm({
  today,
  recurrenceId,
  kind,
  scheduleLabel,
  startDate,
  accounts,
  categories,
  members,
  initial,
}: RecurrenceFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  // O formulário guarda texto; "" vira `null` (sem responsável / sem término) antes de validar.
  const baseResolver = useMemo(() => zodResolver(updateRecurrenceSchema), []);
  const resolver = useCallback<Resolver<RecurrenceFormValues>>(
    (values, context, options) =>
      baseResolver(
        {
          ...values,
          kind,
          // Receita nunca é desconto em folha: o formulário não oferece a opção.
          payrollDeduction: kind === "pagar" && values.payrollDeduction,
          assignedMemberId: values.assignedMemberId || null,
          endDate: values.endDate || null,
        } as never,
        context,
        options as never,
      ) as never,
    [baseResolver, kind],
  );

  const form = useForm<RecurrenceFormValues>({
    resolver,
    defaultValues: { recurrenceId, ...initial },
  });

  const payrollDeduction = useWatch({
    control: form.control,
    name: "payrollDeduction",
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
  const memberOptions = useMemo<SelectOption[]>(
    () => members.map((m) => ({ value: m.id, label: m.displayName })),
    [members],
  );
  const categoryOptions = useMemo<SelectOption[]>(
    () =>
      categories.map((c) => ({
        value: c.id,
        label: c.name,
        node: (
          <span className="flex items-center gap-2">
            <CategoryIcon icon={c.icon} color={c.color} size="sm" />
            {c.name}
          </span>
        ),
      })),
    [categories],
  );

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await safeAction(() =>
        updateRecurrence({
          recurrenceId,
          description: values.description,
          amount: values.amount,
          accountId: values.accountId,
          categoryId: values.categoryId,
          assignedMemberId: values.assignedMemberId || null,
          endDate: values.endDate || null,
          kind,
          // Receita nunca é desconto em folha, mesmo que o valor guardado no formulário diga o contrário.
          payrollDeduction: kind === "pagar" && values.payrollDeduction,
        } as z.input<typeof updateRecurrenceSchema>),
      );
      if (result.ok) {
        toast.success("Recorrência atualizada");
        router.push("/recorrencias");
        return;
      }
      handleFailure(result.error);
    });
  });

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      {formError ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Não foi possível salvar</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Alert>
        <InfoIcon aria-hidden="true" />
        <AlertDescription>
          Muda as próximas ocorrências que ainda não foram alteradas.
          Ocorrências passadas, pagas ou editadas ficam como estão.
        </AlertDescription>
      </Alert>

      <LabeledField
        control={form.control}
        name="description"
        id="recorrencia-descricao"
        label="Descrição"
      >
        {(f) => (
          <Input
            id={f.id}
            name={f.name}
            ref={f.ref}
            value={f.value}
            onChange={(event) => f.onChange(event.target.value)}
            onBlur={f.onBlur}
            maxLength={DESCRIPTION_MAX + 20}
            autoComplete="off"
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="amount"
        id="recorrencia-valor"
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
        name="categoryId"
        id="recorrencia-categoria"
        label="Categoria"
      >
        {(f) => (
          <OptionSelect
            id={f.id}
            value={f.value}
            onValueChange={f.onChange}
            onBlur={f.onBlur}
            options={categoryOptions}
            placeholder="Selecione a categoria"
            invalid={f.invalid}
            describedBy={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="accountId"
        id="recorrencia-conta"
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

      <LabeledField
        control={form.control}
        name="assignedMemberId"
        id="recorrencia-responsavel"
        label="Responsável"
      >
        {(f) => (
          <OptionSelect
            id={f.id}
            value={f.value}
            onValueChange={f.onChange}
            onBlur={f.onBlur}
            options={memberOptions}
            emptyLabel="Sem responsável"
            invalid={f.invalid}
            describedBy={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="endDate"
        id="recorrencia-termino"
        label="Termina em (opcional)"
        description="Sem data, a série continua até você encerrar."
      >
        {(f) => (
          <div className="flex items-center gap-2">
            <DatePicker
              id={f.id}
              value={f.value}
              onChange={f.onChange}
              today={today}
              min={startDate}
              aria-invalid={f.invalid}
              aria-describedby={f.describedBy}
            />
            {f.value ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => f.onChange("")}
              >
                Sem data para terminar
              </Button>
            ) : null}
          </div>
        )}
      </LabeledField>

      {kind === "pagar" ? (
        <div className="flex min-h-10 items-start justify-between gap-3 rounded-lg border p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="recorrencia-desconto-folha" className="text-sm">
              {PAYROLL_DEDUCTION_LABEL}
            </Label>
            <p
              id="recorrencia-desconto-folha-ajuda"
              className="text-muted-foreground text-sm"
            >
              {PAYROLL_DEDUCTION_HELP}
            </p>
            {form.formState.errors.payrollDeduction ? (
              <p role="alert" className="text-destructive text-sm">
                {form.formState.errors.payrollDeduction.message}
              </p>
            ) : null}
          </div>
          <Switch
            id="recorrencia-desconto-folha"
            checked={payrollDeduction}
            disabled={pending}
            aria-describedby="recorrencia-desconto-folha-ajuda"
            onCheckedChange={(checked) =>
              form.setValue("payrollDeduction", checked)
            }
          />
        </div>
      ) : null}

      <div className="bg-muted text-muted-foreground rounded-lg p-3 text-sm">
        <p>
          <span className="text-foreground font-medium">Frequência:</span>{" "}
          {scheduleLabel}
        </p>
        <p className="mt-1">
          Para mudar a frequência, encerre esta série e crie outra.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push("/recorrencias")}
        >
          Cancelar
        </Button>
        <Button type="submit" loading={pending} disabled={!hydrated}>
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
