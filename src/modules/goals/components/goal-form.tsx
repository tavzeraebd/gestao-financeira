"use client";

import { Radio } from "@base-ui/react/radio";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { DatePicker } from "@/components/shared/date-picker";
import { GoalIcon } from "@/components/shared/goal-icon";
import { MoneyInput } from "@/components/shared/money-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { safeAction, useFailureHandler } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ISODate } from "@/lib/dates";
import { createGoal, updateGoal } from "@/modules/goals/actions";
import {
  DEFAULT_GOAL_ICON,
  GOAL_DESCRIPTION_MAX,
  GOAL_ICON_LABELS,
  GOAL_ICONS,
  GOAL_NAME_MAX,
} from "@/modules/goals/constants";
import { goalInputSchema, updateGoalSchema } from "@/modules/goals/schemas";
import { LabeledField } from "@/modules/transactions/components/labeled-field";

export type GoalFormValues = {
  name: string;
  icon: string;
  targetAmount: string;
  /** `YYYY-MM-DD` ou `""` (sem data-alvo). */
  targetDate: string;
  description: string;
};

type GoalFormProps = {
  mode: "create" | "edit";
  today: ISODate;
  goalId?: string;
  initial?: Partial<GoalFormValues>;
};

const FIELDS = [
  "name",
  "icon",
  "targetAmount",
  "targetDate",
  "description",
] as const;

export function GoalForm({ mode, today, goalId, initial }: GoalFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const edit = mode === "edit";

  // O formulário guarda texto; a chave e o id entram só para validar com o schema da action.
  const baseResolver = useMemo(
    () => zodResolver(edit ? updateGoalSchema : goalInputSchema),
    [edit],
  );
  const resolver = useCallback<Resolver<GoalFormValues>>(
    (values, context, options) =>
      baseResolver(
        { ...values, goalId, idempotencyKey } as never,
        context,
        options as never,
      ) as never,
    [baseResolver, goalId, idempotencyKey],
  );

  const form = useForm<GoalFormValues>({
    resolver,
    defaultValues: {
      name: "",
      icon: DEFAULT_GOAL_ICON,
      targetAmount: "",
      targetDate: "",
      description: "",
      ...initial,
    },
  });

  const showGeneral = useCallback(
    (message: string) => setFormError(message),
    [],
  );
  const handleFailure = useFailureHandler(form.setError, FIELDS, showGeneral);

  const onSubmit = form.handleSubmit(() => {
    const v = form.getValues();
    if (pending) return;
    setFormError(null);
    const common = {
      name: v.name,
      description: v.description,
      targetAmount: v.targetAmount,
      targetDate: v.targetDate || undefined,
      icon: v.icon,
    };
    startTransition(async () => {
      const result =
        edit && goalId
          ? await safeAction(() =>
              updateGoal({ goalId, ...common } as z.input<
                typeof updateGoalSchema
              >),
            )
          : await safeAction(() =>
              createGoal({ ...common, idempotencyKey } as z.input<
                typeof goalInputSchema
              >),
            );
      if (result.ok) {
        toast.success(edit ? "Meta atualizada" : "Meta criada");
        const id = edit ? goalId : (result.data as { id: string } | null)?.id;
        router.push(id ? `/metas/${id}` : "/metas");
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
        id="meta-nome"
        label="Nome"
      >
        {(f) => (
          <Input
            id={f.id}
            name={f.name}
            ref={f.ref}
            value={f.value}
            onChange={(event) => f.onChange(event.target.value)}
            onBlur={f.onBlur}
            maxLength={GOAL_NAME_MAX + 20}
            placeholder="Ex.: Viagem em família"
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="icon"
        id="meta-icone"
        label="Ícone"
      >
        {(f) => (
          <RadioGroup
            id={f.id}
            value={f.value}
            onValueChange={(next) => f.onChange(next as string)}
            aria-label="Ícone da meta"
            className="grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {GOAL_ICONS.map((icon) => (
              <Radio.Root
                key={icon}
                value={icon}
                aria-label={GOAL_ICON_LABELS[icon]}
                className="focus-visible:ring-ring hover:bg-muted data-checked:border-primary data-checked:bg-primary/5 flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-3"
              >
                <GoalIcon icon={icon} size="sm" />
                <span className="min-w-0 leading-tight">
                  {GOAL_ICON_LABELS[icon]}
                </span>
              </Radio.Root>
            ))}
          </RadioGroup>
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="targetAmount"
        id="meta-valor"
        label="Valor da meta"
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
        name="targetDate"
        id="meta-data"
        label="Data-alvo (opcional)"
      >
        {(f) => (
          <DatePicker
            id={f.id}
            value={f.value}
            onChange={f.onChange}
            today={today}
            {...(edit ? {} : { min: today })}
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <LabeledField
        control={form.control}
        name="description"
        id="meta-descricao"
        label="Descrição (opcional)"
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
            maxLength={GOAL_DESCRIPTION_MAX + 100}
            aria-invalid={f.invalid}
            aria-describedby={f.describedBy}
          />
        )}
      </LabeledField>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push(goalId ? `/metas/${goalId}` : "/metas")}
        >
          Cancelar
        </Button>
        <Button type="submit" loading={pending} disabled={!hydrated}>
          Salvar meta
        </Button>
      </div>
    </form>
  );
}
