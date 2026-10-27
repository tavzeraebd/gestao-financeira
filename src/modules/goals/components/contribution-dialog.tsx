"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, MinusIcon, PlusIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { safeAction, useFailureHandler } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ISODate } from "@/lib/dates";
import { addContribution } from "@/modules/goals/actions";
import {
  CONTRIBUTION_NOTES_MAX,
  type ContributionKind,
} from "@/modules/goals/constants";
import { contributionSchema } from "@/modules/goals/schemas";
import type { MemberRef } from "@/modules/goals/types";
import { LabeledField } from "@/modules/transactions/components/labeled-field";
import { OptionSelect } from "@/modules/transactions/components/option-select";
import { goalErrorMessage } from "./goal-error-message";

type ContributionValues = {
  contributionDate: string;
  amount: string;
  memberId: string;
  notes: string;
};

const FIELDS = ["contributionDate", "amount", "memberId", "notes"] as const;

const COPY = {
  deposit: {
    trigger: "Registrar aporte",
    title: "Registrar aporte",
    description:
      "O valor entra no que a família já guardou para esta meta. Ele não sai das contas.",
    submit: "Salvar aporte",
    success: "Aporte registrado",
    icon: PlusIcon,
  },
  withdrawal: {
    trigger: "Registrar retirada",
    title: "Registrar retirada",
    description:
      "O valor sai do que a família guardou para esta meta. Ele não volta para as contas.",
    submit: "Salvar retirada",
    success: "Retirada registrada",
    icon: MinusIcon,
  },
} as const;

export type ContributionDialogProps = {
  goalId: string;
  kind: ContributionKind;
  today: ISODate;
  /** Integrantes ativos (opções para quem administra). */
  members: MemberRef[];
  /** Owner/admin escolhem o integrante; member registra sempre no próprio nome. */
  canChooseMember: boolean;
};

/** O formulário só existe com o diálogo aberto: cada abertura recomeça e gera uma nova chave. */
export function ContributionDialog(props: ContributionDialogProps) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const copy = COPY[props.kind];
  const Icon = copy.icon;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={!hydrated} />}>
        <Icon aria-hidden="true" data-icon="inline-start" />
        {copy.trigger}
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        {open ? (
          <ContributionForm {...props} onClose={() => setOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ContributionForm({
  goalId,
  kind,
  today,
  members,
  canChooseMember,
  onClose,
}: ContributionDialogProps & { onClose: () => void }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const copy = COPY[kind];

  const baseResolver = useMemo(() => zodResolver(contributionSchema), []);
  const resolver = useCallback<Resolver<ContributionValues>>(
    (values, context, options) =>
      baseResolver(
        {
          ...values,
          goalId,
          kind,
          idempotencyKey,
          memberId: values.memberId || undefined,
        } as never,
        context,
        options as never,
      ) as never,
    [baseResolver, goalId, kind, idempotencyKey],
  );

  const form = useForm<ContributionValues>({
    resolver,
    defaultValues: {
      contributionDate: today,
      amount: "",
      memberId: "",
      notes: "",
    },
  });

  const showGeneral = useCallback(
    (message: string) => setFormError(message),
    [],
  );
  const handleFailure = useFailureHandler(form.setError, FIELDS, showGeneral);
  const memberOptions = useMemo(
    () => members.map((m) => ({ value: m.id, label: m.displayName })),
    [members],
  );

  const onSubmit = form.handleSubmit(() => {
    const v = form.getValues();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await safeAction(() =>
        addContribution({
          goalId,
          kind,
          amount: v.amount,
          contributionDate: v.contributionDate,
          memberId: canChooseMember && v.memberId ? v.memberId : undefined,
          notes: v.notes,
          idempotencyKey,
        }),
      );
      if (result.ok) {
        toast.success(copy.success);
        onClose();
        router.refresh();
        return;
      }
      handleFailure({ ...result.error, message: goalErrorMessage(result.error) });
    });
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
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
            <AlertTitle>Não foi possível salvar</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <LabeledField
          control={form.control}
          name="amount"
          id="aporte-valor"
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
          name="contributionDate"
          id="aporte-data"
          label="Data"
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
        {canChooseMember ? (
          <LabeledField
            control={form.control}
            name="memberId"
            id="aporte-integrante"
            label="Integrante"
          >
            {(f) => (
              <OptionSelect
                id={f.id}
                value={f.value}
                onValueChange={f.onChange}
                onBlur={f.onBlur}
                options={memberOptions}
                emptyLabel="Você"
                invalid={f.invalid}
                describedBy={f.describedBy}
              />
            )}
          </LabeledField>
        ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="aporte-integrante" className="text-sm font-medium">
              Integrante
            </label>
            <Input
              id="aporte-integrante"
              value="Você"
              readOnly
              disabled
              aria-describedby="aporte-integrante-ajuda"
            />
            <p
              id="aporte-integrante-ajuda"
              className="text-muted-foreground text-sm"
            >
              O registro fica no seu nome. Quem administra a família pode
              registrar por outro integrante.
            </p>
          </div>
        )}
        <LabeledField
          control={form.control}
          name="notes"
          id="aporte-observacao"
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
              rows={2}
              maxLength={CONTRIBUTION_NOTES_MAX + 100}
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
            {copy.submit}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
