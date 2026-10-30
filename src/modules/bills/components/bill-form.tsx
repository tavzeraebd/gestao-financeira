"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { safeAction, useFailureHandler } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ISODate } from "@/lib/dates";
import { createBill, updateBill } from "@/modules/bills/actions";
import {
  BILL_KIND_LABELS,
  BILL_KIND_TO_TYPE,
  type BillKind,
} from "@/modules/bills/constants";
import { billFormSchema, updateBillSchema } from "@/modules/bills/schemas";
import type { CategoryOption } from "@/modules/categories/types";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  FREQUENCY_UNITS,
  INTERVAL_MAX,
  PAYROLL_DEDUCTION_HELP,
  PAYROLL_DEDUCTION_LABEL,
  type Frequency,
} from "@/modules/recurrences/constants";
import { LabeledField } from "@/modules/transactions/components/labeled-field";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";
import { categorySelectOptions } from "@/modules/transactions/components/category-select-options";
import { DESCRIPTION_MAX, NOTES_MAX } from "@/modules/transactions/constants";

export type BillFormValues = {
  kind: BillKind;
  repeat: boolean;
  description: string;
  categoryId: string;
  amount: string;
  dueDate: string;
  accountId: string;
  assignedMemberId: string;
  notes: string;
  frequency: Frequency;
  intervalCount: number;
  endDate: string | undefined;
  payrollDeduction: boolean;
  idempotencyKey: string;
  transactionId?: string;
};

type BillFormProps = {
  mode: "create" | "edit";
  today: ISODate;
  /** Contas ativas (mais a atual, na edição). */
  accounts: { id: string; name: string }[];
  categories: { income: CategoryOption[]; expense: CategoryOption[] };
  members: { id: string; displayName: string }[];
  initial?: Partial<
    Omit<BillFormValues, "idempotencyKey" | "transactionId" | "repeat">
  >;
  transactionId?: string;
};

const FIELDS = [
  "description",
  "categoryId",
  "amount",
  "dueDate",
  "accountId",
  "assignedMemberId",
  "notes",
  "frequency",
  "intervalCount",
  "endDate",
  "payrollDeduction",
] as const;

const FREQUENCY_OPTIONS: SelectOption[] = FREQUENCIES.map((value) => ({
  value,
  label: FREQUENCY_LABELS[value],
}));
const INTERVAL_OPTIONS: SelectOption[] = Array.from(
  { length: INTERVAL_MAX },
  (_, index) => ({ value: String(index + 1), label: String(index + 1) }),
);

/** `endDate` é opcional: o campo guarda `undefined` quando vazio (o schema recusa texto vazio). */
function clearable(onChange: (value: string) => void) {
  return onChange as (value: string | undefined) => void;
}

function buildCreatePayload(values: BillFormValues) {
  const common = {
    kind: values.kind,
    description: values.description,
    amount: values.amount,
    dueDate: values.dueDate,
    accountId: values.accountId,
    categoryId: values.categoryId,
    assignedMemberId: values.assignedMemberId,
    idempotencyKey: values.idempotencyKey,
  };
  if (values.repeat) {
    return {
      repeat: true as const,
      ...common,
      frequency: values.frequency,
      intervalCount: values.intervalCount,
      ...(values.endDate ? { endDate: values.endDate } : {}),
      // Só despesa recorrente pode ser desconto em folha.
      payrollDeduction: values.kind === "pagar" && values.payrollDeduction,
    };
  }
  return { repeat: false as const, ...common, notes: values.notes };
}

export function BillForm({
  mode,
  today,
  accounts,
  categories,
  members,
  initial,
  transactionId,
}: BillFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // Uma chave por montagem: repetir o envio (duplo clique, nova tentativa) não duplica o compromisso.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useForm<BillFormValues>({
    // O schema de criação é uma união por `repeat`; o formulário guarda texto e o servidor revalida tudo.
    resolver: zodResolver(
      mode === "edit" ? updateBillSchema : billFormSchema,
    ) as unknown as Resolver<BillFormValues>,
    defaultValues: {
      kind: "pagar",
      repeat: false,
      description: "",
      categoryId: "",
      amount: "",
      dueDate: today,
      accountId: "",
      assignedMemberId: "",
      notes: "",
      frequency: "monthly",
      intervalCount: 1,
      endDate: undefined,
      payrollDeduction: false,
      ...initial,
      idempotencyKey,
      transactionId,
    },
  });

  const kind = useWatch({ control: form.control, name: "kind" });
  const repeat = useWatch({ control: form.control, name: "repeat" });
  const frequency = useWatch({ control: form.control, name: "frequency" });
  const intervalCount = useWatch({
    control: form.control,
    name: "intervalCount",
  });
  const dueDate = useWatch({ control: form.control, name: "dueDate" });
  const payrollDeduction = useWatch({
    control: form.control,
    name: "payrollDeduction",
  });
  const isEdit = mode === "edit";

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
  const categoryOptions = useMemo(
    () =>
      categorySelectOptions(
        BILL_KIND_TO_TYPE[kind] === "income"
          ? categories.income
          : categories.expense,
      ),
    [kind, categories],
  );

  const submitLabel = isEdit
    ? "Salvar alterações"
    : repeat
      ? "Salvar recorrência"
      : kind === "pagar"
        ? "Salvar conta a pagar"
        : "Salvar conta a receber";

  const dueDay = Number(dueDate.slice(8, 10));
  const showMonthEndHint = repeat && frequency === "monthly" && dueDay >= 29;
  const unit = FREQUENCY_UNITS[frequency][intervalCount === 1 ? 0 : 1];

  const onSubmit = form.handleSubmit(() => {
    // O resolver devolve valores convertidos (Cents); a action recebe o texto digitado.
    const values = form.getValues();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      if (isEdit && transactionId) {
        const result = await safeAction(() =>
          updateBill({
            transactionId,
            description: values.description,
            amount: values.amount,
            dueDate: values.dueDate,
            accountId: values.accountId,
            categoryId: values.categoryId,
            assignedMemberId: values.assignedMemberId,
            notes: values.notes,
          } as z.input<typeof updateBillSchema>),
        );
        if (result.ok) {
          toast.success("Compromisso atualizado");
          router.push(`/compromissos/${transactionId}`);
          return;
        }
        handleFailure(result.error);
        return;
      }
      const result = await safeAction(() =>
        createBill(
          buildCreatePayload(values) as z.input<typeof billFormSchema>,
        ),
      );
      if (result.ok) {
        toast.success(
          values.repeat ? "Recorrência salva" : "Compromisso salvo",
        );
        router.push("/compromissos");
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

      <SegmentedControl<BillKind>
        aria-label="Tipo de compromisso"
        value={kind}
        disabled={isEdit}
        onValueChange={(next) => {
          form.setValue("kind", next);
          form.setValue("categoryId", "");
          // Receita nunca é desconto em folha.
          if (next === "receber") form.setValue("payrollDeduction", false);
          form.clearErrors();
          setFormError(null);
        }}
        options={[
          {
            value: "pagar",
            label: BILL_KIND_LABELS.pagar,
            icon: TrendingDownIcon,
            tone: "expense",
          },
          {
            value: "receber",
            label: BILL_KIND_LABELS.receber,
            icon: TrendingUpIcon,
            tone: "income",
          },
        ]}
      />

      <LabeledField
        control={form.control}
        name="description"
        id="compromisso-descricao"
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
            placeholder="Ex.: Aluguel"
            maxLength={DESCRIPTION_MAX + 20}
            autoComplete="off"
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="categoryId"
        id="compromisso-categoria"
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
        name="amount"
        id="compromisso-valor"
        label="Valor previsto"
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
        name="dueDate"
        id="compromisso-vencimento"
        label="Vencimento"
      >
        {(f) => (
          <DatePicker
            id={f.id}
            value={f.value}
            onChange={f.onChange}
            today={today}
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="accountId"
        id="compromisso-conta"
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
        id="compromisso-responsavel"
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

      {repeat ? null : (
        <LabeledField
          control={form.control}
          name="notes"
          id="compromisso-observacoes"
          label="Observações"
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
              maxLength={NOTES_MAX + 100}
              aria-invalid={f.invalid}
              aria-describedby={f.describedBy}
            />
          )}
        </LabeledField>
      )}

      {isEdit ? null : (
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex min-h-10 items-center justify-between gap-3">
            <Label htmlFor="compromisso-repetir" className="text-sm">
              Repetir
            </Label>
            <Switch
              id="compromisso-repetir"
              checked={repeat}
              onCheckedChange={(checked) => {
                form.setValue("repeat", checked);
                if (!checked) form.setValue("payrollDeduction", false);
                form.clearErrors();
              }}
            />
          </div>

          {repeat ? (
            <>
              <LabeledField
                control={form.control}
                name="frequency"
                id="compromisso-frequencia"
                label="Frequência"
              >
                {(f) => (
                  <OptionSelect
                    id={f.id}
                    value={f.value}
                    onValueChange={f.onChange}
                    onBlur={f.onBlur}
                    options={FREQUENCY_OPTIONS}
                    invalid={f.invalid}
                    describedBy={f.describedBy}
                  />
                )}
              </LabeledField>

              <Controller
                name="intervalCount"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="compromisso-intervalo">
                      A cada
                    </FieldLabel>
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <OptionSelect
                          id="compromisso-intervalo"
                          value={String(field.value)}
                          onValueChange={(value) =>
                            field.onChange(Number(value))
                          }
                          onBlur={field.onBlur}
                          options={INTERVAL_OPTIONS}
                          invalid={fieldState.invalid}
                          describedBy={
                            fieldState.invalid
                              ? "compromisso-intervalo-erro"
                              : undefined
                          }
                        />
                      </div>
                      <span className="text-sm">{unit}</span>
                    </div>
                    {fieldState.invalid ? (
                      <p
                        id="compromisso-intervalo-erro"
                        role="alert"
                        className="text-destructive text-sm"
                      >
                        {fieldState.error?.message}
                      </p>
                    ) : null}
                  </Field>
                )}
              />

              <LabeledField
                control={form.control}
                name="endDate"
                id="compromisso-termino"
                label="Termina em (opcional)"
                description={
                  form.getValues("endDate")
                    ? undefined
                    : "Sem data para terminar."
                }
              >
                {(f) => (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <DatePicker
                        id={f.id}
                        value={f.value}
                        onChange={(value) =>
                          clearable(f.onChange)(value || undefined)
                        }
                        today={today}
                        min={dueDate as ISODate}
                        aria-invalid={f.invalid}
                        aria-describedby={f.describedBy}
                      />
                    </div>
                    {f.value ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Remover data de término"
                        onClick={() => clearable(f.onChange)(undefined)}
                      >
                        <XIcon aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                )}
              </LabeledField>

              {kind === "pagar" ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="compromisso-desconto-folha"
                      className="text-sm"
                    >
                      {PAYROLL_DEDUCTION_LABEL}
                    </Label>
                    <p
                      id="compromisso-desconto-folha-ajuda"
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
                    id="compromisso-desconto-folha"
                    checked={payrollDeduction}
                    aria-describedby="compromisso-desconto-folha-ajuda"
                    onCheckedChange={(checked) =>
                      form.setValue("payrollDeduction", checked)
                    }
                  />
                </div>
              ) : null}

              {showMonthEndHint ? (
                <FieldDescription>
                  Nos meses sem o dia {dueDay}, o vencimento cai no último dia
                  do mês.
                </FieldDescription>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={pending}
        disabled={!hydrated}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
