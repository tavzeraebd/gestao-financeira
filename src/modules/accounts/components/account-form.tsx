"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeAction, useFailureHandler } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ISODate } from "@/lib/dates";
import { createAccount, updateAccount } from "@/modules/accounts/actions";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  type AccountType,
} from "@/modules/accounts/constants";
import {
  createAccountSchema,
  updateAccountSchema,
} from "@/modules/accounts/schemas";
import { LabeledField } from "@/modules/transactions/components/labeled-field";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";

export type AccountFormValues = {
  name: string;
  type: AccountType;
  institutionName: string;
  openingBalance: string;
  openingBalanceDate: string;
  creditLimit: string;
  statementClosingDay: string;
  statementDueDay: string;
};

type AccountFormProps = {
  mode: "create" | "edit";
  today: ISODate;
  accountId?: string;
  initial?: Partial<AccountFormValues>;
};

const FIELDS = [
  "name",
  "type",
  "institutionName",
  "openingBalance",
  "openingBalanceDate",
  "creditLimit",
  "statementClosingDay",
  "statementDueDay",
] as const;

const TYPE_OPTIONS: SelectOption[] = ACCOUNT_TYPES.map((value) => ({
  value,
  label: ACCOUNT_TYPE_LABELS[value],
}));

export function AccountForm({
  mode,
  today,
  accountId,
  initial,
}: AccountFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<AccountFormValues>({
    // O schema de criação valida os mesmos campos nos dois modos; o servidor revalida tudo.
    resolver: zodResolver(
      createAccountSchema,
    ) as unknown as Resolver<AccountFormValues>,
    defaultValues: {
      name: "",
      type: "checking",
      institutionName: "",
      openingBalance: "",
      openingBalanceDate: today,
      creditLimit: "",
      statementClosingDay: "",
      statementDueDay: "",
      ...initial,
    },
  });

  const type = useWatch({ control: form.control, name: "type" });
  const isCard = type === "credit_card";

  const showGeneral = useCallback(
    (message: string) => setFormError(message),
    [],
  );
  const fields = useMemo(() => FIELDS, []);
  const handleFailure = useFailureHandler(form.setError, fields, showGeneral);

  const onSubmit = form.handleSubmit(() => {
    // O resolver devolve valores já convertidos (Cents); a action recebe o texto digitado.
    const values = form.getValues();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const common = {
        name: values.name,
        institutionName: values.institutionName,
        openingBalance: values.openingBalance,
        openingBalanceDate: values.openingBalanceDate,
        creditLimit: isCard ? values.creditLimit : "",
        statementClosingDay: isCard ? values.statementClosingDay : "",
        statementDueDay: isCard ? values.statementDueDay : "",
      };
      const result =
        mode === "edit" && accountId
          ? await safeAction(() =>
              updateAccount({
                ...common,
                accountId,
              } as z.input<typeof updateAccountSchema>),
            )
          : await safeAction(() =>
              createAccount({
                ...common,
                type: values.type,
              } as z.input<typeof createAccountSchema>),
            );
      if (result.ok) {
        toast.success(mode === "edit" ? "Conta atualizada" : "Conta criada");
        router.push("/contas");
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

      <LabeledField
        control={form.control}
        name="name"
        id="conta-nome"
        label="Nome da conta"
      >
        {(f) => (
          <Input
            id={f.id}
            name={f.name}
            ref={f.ref}
            value={f.value}
            onChange={(event) => f.onChange(event.target.value)}
            onBlur={f.onBlur}
            placeholder="Ex.: Conta principal"
            autoComplete="off"
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="type"
        id="conta-tipo"
        label="Tipo"
        description={
          mode === "edit"
            ? "O tipo não pode mudar depois que a conta é criada."
            : undefined
        }
      >
        {(f) => (
          <OptionSelect
            id={f.id}
            value={f.value}
            onValueChange={f.onChange}
            onBlur={f.onBlur}
            options={TYPE_OPTIONS}
            invalid={f.invalid}
            describedBy={f.describedBy}
            disabled={mode === "edit"}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="institutionName"
        id="conta-instituicao"
        label="Instituição (opcional)"
      >
        {(f) => (
          <Input
            id={f.id}
            name={f.name}
            ref={f.ref}
            value={f.value}
            onChange={(event) => f.onChange(event.target.value)}
            onBlur={f.onBlur}
            placeholder="Ex.: Banco do Brasil"
            autoComplete="off"
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="openingBalance"
        id="conta-saldo"
        label={isCard ? "Fatura atual (valor devido)" : "Saldo inicial"}
        description={
          isCard
            ? "Informe quanto você deve hoje no cartão. Use 0,00 se a fatura está zerada."
            : "Pode ser negativo, como no cheque especial."
        }
      >
        {(f) => (
          <MoneyInput
            id={f.id}
            name={f.name}
            ref={f.ref}
            value={f.value}
            onChange={f.onChange}
            onBlur={f.onBlur}
            allowNegative={!isCard}
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="openingBalanceDate"
        id="conta-saldo-em"
        label="Saldo em"
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

      {isCard ? (
        <>
          <LabeledField
            control={form.control}
            name="creditLimit"
            id="conta-limite"
            label="Limite do cartão (opcional)"
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
          <div className="grid gap-5 sm:grid-cols-2">
            <LabeledField
              control={form.control}
              name="statementClosingDay"
              id="conta-fechamento"
              label="Dia de fechamento"
            >
              {(f) => (
                <Input
                  id={f.id}
                  name={f.name}
                  ref={f.ref}
                  value={f.value}
                  onChange={(event) => f.onChange(event.target.value)}
                  onBlur={f.onBlur}
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="1 a 31"
                  autoComplete="off"
                  aria-invalid={f.invalid}
                  aria-describedby={f.describedBy}
                />
              )}
            </LabeledField>
            <LabeledField
              control={form.control}
              name="statementDueDay"
              id="conta-vencimento"
              label="Dia de vencimento"
            >
              {(f) => (
                <Input
                  id={f.id}
                  name={f.name}
                  ref={f.ref}
                  value={f.value}
                  onChange={(event) => f.onChange(event.target.value)}
                  onBlur={f.onBlur}
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="1 a 31"
                  autoComplete="off"
                  aria-invalid={f.invalid}
                  aria-describedby={f.describedBy}
                />
              )}
            </LabeledField>
          </div>
        </>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push("/contas")}
        >
          Cancelar
        </Button>
        <Button type="submit" loading={pending} disabled={!hydrated}>
          {mode === "edit" ? "Salvar alterações" : "Criar conta"}
        </Button>
      </div>
    </form>
  );
}
