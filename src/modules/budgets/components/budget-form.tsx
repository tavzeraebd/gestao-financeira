"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { CategoryIcon } from "@/components/shared/category-icon";
import { MoneyInput } from "@/components/shared/money-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { safeAction, useFailureHandler } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  addMonths,
  formatMonthBR,
  startOfMonth,
  type ISODate,
} from "@/lib/dates";
import { createBudget, updateBudget } from "@/modules/budgets/actions";
import { ALL_EXPENSES_LABEL } from "@/modules/budgets/constants";
import {
  budgetInputSchema,
  updateBudgetSchema,
} from "@/modules/budgets/schemas";
import type { CategoryOption } from "@/modules/categories/types";
import { LabeledField } from "@/modules/transactions/components/labeled-field";
import {
  OptionSelect,
  type SelectOption,
} from "@/modules/transactions/components/option-select";

export type BudgetFormValues = {
  /** `""` = todas as despesas. */
  categoryId: string;
  amountLimit: string;
  /** `YYYY-MM`. */
  startMonth: string;
  /** `YYYY-MM` ou `""` (sem término). */
  endMonth: string;
};

type BudgetFormProps = {
  mode: "create" | "edit";
  today: ISODate;
  /** Categorias de despesa ativas (mais a atual, na edição). */
  categories: CategoryOption[];
  budgetId?: string;
  initial?: Partial<BudgetFormValues>;
};

const FIELDS = ["categoryId", "amountLimit", "startMonth", "endMonth"] as const;
const MONTHS_BACK = 12;
const MONTHS_AHEAD = 24;

function monthOptions(today: ISODate, extra: string[]): SelectOption[] {
  const first = startOfMonth(today);
  const values = new Map<string, SelectOption>();
  for (let n = -MONTHS_BACK; n <= MONTHS_AHEAD; n += 1) {
    const d = addMonths(first, n);
    values.set(d.slice(0, 7), {
      value: d.slice(0, 7),
      label: formatMonthBR(d, "long"),
    });
  }
  for (const month of extra) {
    if (month && !values.has(month)) {
      values.set(month, {
        value: month,
        label: formatMonthBR(`${month}-01` as ISODate, "long"),
      });
    }
  }
  return [...values.values()].sort((a, b) => a.value.localeCompare(b.value));
}

export function BudgetForm({
  mode,
  today,
  categories,
  budgetId,
  initial,
}: BudgetFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const edit = mode === "edit";

  // O formulário guarda texto; "" vira `null`/ausente antes de validar.
  const baseResolver = useMemo(() => zodResolver(budgetInputSchema), []);
  const resolver = useCallback<Resolver<BudgetFormValues>>(
    (values, context, options) =>
      baseResolver(
        {
          ...values,
          categoryId: values.categoryId || null,
          endMonth: values.endMonth || undefined,
        } as never,
        context,
        options as never,
      ) as never,
    [baseResolver],
  );

  const form = useForm<BudgetFormValues>({
    resolver,
    defaultValues: {
      categoryId: "",
      amountLimit: "",
      startMonth: today.slice(0, 7),
      endMonth: "",
      ...initial,
    },
  });

  const showGeneral = useCallback(
    (message: string) => setFormError(message),
    [],
  );
  const handleFailure = useFailureHandler(form.setError, FIELDS, showGeneral);

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
  const months = useMemo(
    () =>
      monthOptions(today, [initial?.startMonth ?? "", initial?.endMonth ?? ""]),
    [today, initial?.startMonth, initial?.endMonth],
  );

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result =
        edit && budgetId
          ? await safeAction(() =>
              updateBudget({
                budgetId,
                amountLimit: values.amountLimit,
                endMonth: values.endMonth || null,
              } as z.input<typeof updateBudgetSchema>),
            )
          : await safeAction(() =>
              createBudget({
                categoryId: values.categoryId || null,
                amountLimit: values.amountLimit,
                startMonth: values.startMonth,
                endMonth: values.endMonth || undefined,
              } as z.input<typeof budgetInputSchema>),
            );
      if (result.ok) {
        toast.success(edit ? "Orçamento atualizado" : "Orçamento criado");
        router.push("/orcamentos");
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
        name="categoryId"
        id="orcamento-categoria"
        label="Categoria"
        description={
          edit
            ? "A categoria não pode mudar depois que o orçamento é criado."
            : undefined
        }
      >
        {(f) => (
          <OptionSelect
            id={f.id}
            value={f.value}
            onValueChange={f.onChange}
            onBlur={f.onBlur}
            options={categoryOptions}
            emptyLabel={ALL_EXPENSES_LABEL}
            invalid={f.invalid}
            describedBy={f.describedBy}
            disabled={edit}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="amountLimit"
        id="orcamento-limite"
        label="Limite mensal"
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
          name="startMonth"
          id="orcamento-inicio"
          label="A partir de"
        >
          {(f) => (
            <OptionSelect
              id={f.id}
              value={f.value}
              onValueChange={f.onChange}
              onBlur={f.onBlur}
              options={months}
              invalid={f.invalid}
              describedBy={f.describedBy}
              disabled={edit}
            />
          )}
        </LabeledField>
        <LabeledField
          control={form.control}
          name="endMonth"
          id="orcamento-fim"
          label="Até (opcional)"
        >
          {(f) => (
            <OptionSelect
              id={f.id}
              value={f.value}
              onValueChange={f.onChange}
              onBlur={f.onBlur}
              options={months}
              emptyLabel="Sem data para terminar"
              invalid={f.invalid}
              describedBy={f.describedBy}
            />
          )}
        </LabeledField>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push("/orcamentos")}
        >
          Cancelar
        </Button>
        <Button type="submit" loading={pending} disabled={!hydrated}>
          {edit ? "Salvar alterações" : "Criar orçamento"}
        </Button>
      </div>
    </form>
  );
}
