"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircleIcon,
  ArrowLeftRightIcon,
  InfoIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { safeAction, useFailureHandler } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ISODate } from "@/lib/dates";
import type { CategoryOption } from "@/modules/categories/types";
import {
  createTransaction,
  updateTransaction,
} from "@/modules/transactions/actions";
import { LabeledField } from "@/modules/transactions/components/labeled-field";
import { categorySelectOptions } from "@/modules/transactions/components/category-select-options";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";
import {
  DESCRIPTION_MAX,
  NOTES_MAX,
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
} from "@/modules/transactions/constants";
import {
  transactionInputSchema,
  updateTransactionSchema,
} from "@/modules/transactions/schemas";

export type TransactionFormValues = {
  type: TransactionType;
  description: string;
  categoryId: string;
  amount: string;
  transactionDate: string;
  accountId: string;
  destinationAccountId: string;
  assignedMemberId: string;
  notes: string;
  idempotencyKey: string;
};

type TransactionFormProps = {
  mode: "create" | "edit";
  today: ISODate;
  /** Contas ativas (mais a atual, na edição). */
  accounts: { id: string; name: string }[];
  categories: { income: CategoryOption[]; expense: CategoryOption[] };
  members: { id: string; displayName: string }[];
  initial?: Partial<Omit<TransactionFormValues, "idempotencyKey">>;
  transactionId?: string;
  /** Há estorno ativo ou o lançamento é um estorno: valor, data, conta e categoria ficam travados. */
  lockedFinancial?: boolean;
};

const FIELDS = [
  "description",
  "categoryId",
  "amount",
  "transactionDate",
  "accountId",
  "destinationAccountId",
  "assignedMemberId",
  "notes",
] as const;

function buildPayload(values: TransactionFormValues) {
  const common = {
    description: values.description,
    amount: values.amount,
    transactionDate: values.transactionDate,
    accountId: values.accountId,
    assignedMemberId: values.assignedMemberId,
    notes: values.notes,
  };
  if (values.type === "transfer") {
    return {
      type: "transfer" as const,
      ...common,
      destinationAccountId: values.destinationAccountId,
    };
  }
  return { type: values.type, ...common, categoryId: values.categoryId };
}

export function TransactionForm({
  mode,
  today,
  accounts,
  categories,
  members,
  initial,
  transactionId,
  lockedFinancial = false,
}: TransactionFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // Uma chave por montagem: repetir o envio (duplo clique, nova tentativa) não duplica o lançamento.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const form = useForm<TransactionFormValues>({
    // O schema é uma união por `type`; o formulário guarda texto e o servidor revalida tudo.
    resolver: zodResolver(
      transactionInputSchema,
    ) as unknown as Resolver<TransactionFormValues>,
    defaultValues: {
      type: "expense",
      description: "",
      categoryId: "",
      amount: "",
      transactionDate: today,
      accountId: "",
      destinationAccountId: "",
      assignedMemberId: "",
      notes: "",
      ...initial,
      idempotencyKey,
    },
  });

  const type = useWatch({ control: form.control, name: "type" });
  const isTransfer = type === "transfer";
  const typeLabel = TRANSACTION_TYPE_LABELS[type];

  const showGeneral = useCallback(
    (message: string) => setFormError(message),
    [],
  );
  const handleFailure = useFailureHandler(form.setError, FIELDS, showGeneral);

  const accountOptions = useMemo<SelectOption[]>(
    () =>
      accounts.map((account) => ({ value: account.id, label: account.name })),
    [accounts],
  );
  const memberOptions = useMemo<SelectOption[]>(
    () =>
      members.map((member) => ({
        value: member.id,
        label: member.displayName,
      })),
    [members],
  );
  const categoryOptions = useMemo(
    () =>
      categorySelectOptions(
        type === "income" ? categories.income : categories.expense,
      ),
    [type, categories],
  );

  const onSubmit = form.handleSubmit(() => {
    // O resolver devolve valores já convertidos (Cents); a action recebe o texto digitado.
    const values = form.getValues();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const payload = buildPayload(values);
      if (mode === "edit" && transactionId) {
        const result = await safeAction(() =>
          updateTransaction({
            ...payload,
            transactionId,
          } as z.input<typeof updateTransactionSchema>),
        );
        if (result.ok) {
          toast.success("Lançamento atualizado");
          router.push(`/transacoes/${transactionId}`);
          return;
        }
        handleFailure(result.error);
        return;
      }
      const result = await safeAction(() =>
        createTransaction({
          ...payload,
          idempotencyKey: values.idempotencyKey,
        } as z.input<typeof transactionInputSchema>),
      );
      if (result.ok) {
        toast.success("Lançamento salvo");
        router.push("/transacoes");
        return;
      }
      handleFailure(result.error);
    });
  });

  const locked = lockedFinancial;

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

      {locked ? (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertTitle>Alguns campos estão travados</AlertTitle>
          <AlertDescription>
            Este lançamento tem estorno ou é um estorno. Valor, data, conta e
            categoria não podem mudar; descrição, responsável e observações sim.
          </AlertDescription>
        </Alert>
      ) : null}

      <SegmentedControl<TransactionType>
        aria-label="Tipo de lançamento"
        value={type}
        disabled={mode === "edit"}
        onValueChange={(next) => {
          form.setValue("type", next);
          form.setValue("categoryId", "");
          form.clearErrors();
          setFormError(null);
        }}
        options={[
          {
            value: "expense",
            label: TRANSACTION_TYPE_LABELS.expense,
            icon: TrendingDownIcon,
            tone: "expense",
          },
          {
            value: "income",
            label: TRANSACTION_TYPE_LABELS.income,
            icon: TrendingUpIcon,
            tone: "income",
          },
          {
            value: "transfer",
            label: TRANSACTION_TYPE_LABELS.transfer,
            icon: ArrowLeftRightIcon,
          },
        ]}
      />

      <LabeledField
        control={form.control}
        name="description"
        id="lancamento-descricao"
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
            placeholder="Ex.: Supermercado"
            maxLength={DESCRIPTION_MAX + 20}
            autoComplete="off"
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      {isTransfer ? null : (
        <LabeledField
          control={form.control}
          name="categoryId"
          id="lancamento-categoria"
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
              disabled={locked}
            />
          )}
        </LabeledField>
      )}

      <LabeledField
        control={form.control}
        name="amount"
        id="lancamento-valor"
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
            disabled={locked}
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="transactionDate"
        id="lancamento-data"
        label="Data"
      >
        {(f) => (
          <DatePicker
            id={f.id}
            value={f.value}
            onChange={f.onChange}
            today={today}
            max={today}
            disabled={locked}
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="accountId"
        id="lancamento-conta"
        label={isTransfer ? "Conta de origem" : "Conta ou cartão"}
      >
        {(f) => (
          <OptionSelect
            id={f.id}
            value={f.value}
            onValueChange={f.onChange}
            onBlur={f.onBlur}
            options={accountOptions}
            placeholder={
              isTransfer ? "Selecione a origem" : "Selecione a conta"
            }
            invalid={f.invalid}
            describedBy={f.describedBy}
            disabled={locked}
          />
        )}
      </LabeledField>

      {isTransfer ? (
        <LabeledField
          control={form.control}
          name="destinationAccountId"
          id="lancamento-destino"
          label="Conta de destino"
        >
          {(f) => (
            <OptionSelect
              id={f.id}
              value={f.value}
              onValueChange={f.onChange}
              onBlur={f.onBlur}
              options={accountOptions}
              placeholder="Selecione o destino"
              invalid={f.invalid}
              describedBy={f.describedBy}
              disabled={locked}
            />
          )}
        </LabeledField>
      ) : null}

      <LabeledField
        control={form.control}
        name="assignedMemberId"
        id="lancamento-responsavel"
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
        name="notes"
        id="lancamento-observacoes"
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

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={pending}
        disabled={!hydrated}
      >
        {mode === "edit"
          ? "Salvar alterações"
          : `Salvar ${typeLabel.toLowerCase()}`}
      </Button>
    </form>
  );
}
