"use client";

import { AlertCircleIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Money } from "@/components/shared/money";
import { MoneyInput } from "@/components/shared/money-input";
import { SegmentedControl } from "@/components/shared/segmented-control";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { parseBRL, toBRLInput, type Cents } from "@/lib/money";
import { setTransactionSplits } from "@/modules/splits/actions";
import {
  MAX_PARTS,
  MIN_PARTS,
  SPLIT_MODE_LABELS,
  SPLIT_MODES,
  type SplitMode,
} from "@/modules/splits/constants";
import {
  amountSplitDifference,
  previewEqualSplit,
} from "@/modules/splits/domain/preview";
import type { SplitDetail } from "@/modules/splits/types";

type SplitFormProps = { detail: SplitDetail };

function initialSelection(detail: SplitDetail): string[] {
  const inDivision = detail.parts.map((p) => p.member.id);
  if (inDivision.length > 0) return inDivision;
  return detail.candidates.filter((c) => c.active).map((c) => c.id);
}

function initialAmounts(detail: SplitDetail): Record<string, string> {
  return Object.fromEntries(
    detail.parts.map((p) => [p.member.id, toBRLInput(p.amount)]),
  );
}

export function SplitForm({ detail }: SplitFormProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<SplitMode>(detail.mode ?? "equal");
  const [selected, setSelected] = useState<string[]>(() =>
    initialSelection(detail),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    initialAmounts(detail),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const total = detail.transaction.amount;
  // Ordem dos candidatos = ordem de entrada (D13); o centavo de empate vai para o primeiro.
  const chosen = detail.candidates.filter((c) => selected.includes(c.id));
  const equalPreview = previewEqualSplit(
    total,
    chosen.map((c) => c.id),
  );

  const parsed = chosen.map((c) => {
    const result = parseBRL(amounts[c.id] ?? "");
    return result.ok ? result.value : null;
  });
  const allValid = parsed.every((v) => v !== null && v > 0);
  const difference = amountSplitDifference(
    total,
    parsed.filter((v): v is Cents => v !== null),
  );

  const enoughParts = chosen.length >= MIN_PARTS && chosen.length <= MAX_PARTS;
  const canSave =
    enoughParts && (mode === "equal" || (allValid && difference === 0));
  let disabledReason: string | null = null;
  if (!enoughParts) {
    disabledReason = `Escolha de ${MIN_PARTS} a ${MAX_PARTS} integrantes para salvar.`;
  } else if (mode === "amounts" && !allValid) {
    disabledReason = "Informe um valor maior que zero para cada integrante.";
  } else if (mode === "amounts" && difference !== 0) {
    disabledReason = "A soma das partes precisa ser igual ao valor da despesa.";
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((x) => x !== id),
    );
  }

  function submit(
    input: Parameters<typeof setTransactionSplits>[0],
    successMessage: string,
  ) {
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = await safeAction(() => setTransactionSplits(input));
      if (result.ok) {
        toast.success(successMessage);
        router.refresh();
        return;
      }
      if (sessionExpired(result.error)) return;
      setFormError(result.error.message);
    });
  }

  function save() {
    if (!canSave) return;
    const transactionId = detail.transaction.id;
    if (mode === "equal") {
      submit(
        { mode: "equal", transactionId, memberIds: chosen.map((c) => c.id) },
        "Divisão salva",
      );
    } else {
      submit(
        {
          mode: "amounts",
          transactionId,
          shares: chosen.map((c) => ({
            memberId: c.id,
            amount: amounts[c.id] ?? "",
          })),
        },
        "Divisão salva",
      );
    }
  }

  function remove() {
    submit(
      { mode: "none", transactionId: detail.transaction.id },
      "Divisão removida",
    );
  }

  const previewById = new Map(equalPreview.map((p) => [p.memberId, p.amount]));
  const hasDivision = detail.parts.length > 0;

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="flex flex-col gap-4"
    >
      {formError ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Não foi possível salvar a divisão</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <SegmentedControl
        aria-label="Modo da divisão"
        value={mode}
        onValueChange={setMode}
        disabled={pending}
        options={SPLIT_MODES.map((value) => ({
          value,
          label: SPLIT_MODE_LABELS[value],
        }))}
      />

      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="mb-1 text-sm font-medium">
          Quem divide esta despesa
        </legend>
        {detail.candidates.map((candidate) => {
          const isChecked = selected.includes(candidate.id);
          const inputId = `parte-valor-${candidate.id}`;
          return (
            <div
              key={candidate.id}
              className="flex min-h-10 flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-1"
            >
              <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(checked) =>
                    toggle(candidate.id, checked === true)
                  }
                />
                <span>
                  {candidate.displayName}
                  {!candidate.active ? (
                    <span className="text-muted-foreground"> (saiu da família)</span>
                  ) : null}
                </span>
              </label>
              {isChecked && mode === "equal" ? (
                <Money
                  cents={previewById.get(candidate.id) ?? (0 as Cents)}
                  className="text-sm font-medium"
                />
              ) : null}
              {isChecked && mode === "amounts" ? (
                <div className="w-40">
                  <Label htmlFor={inputId} className="sr-only">
                    Valor de {candidate.displayName}
                  </Label>
                  <MoneyInput
                    id={inputId}
                    value={amounts[candidate.id] ?? ""}
                    onChange={(value) =>
                      setAmounts((current) => ({
                        ...current,
                        [candidate.id]: value,
                      }))
                    }
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </fieldset>

      {mode === "amounts" && enoughParts ? (
        <p
          className="text-sm font-medium"
          role="status"
          aria-live="polite"
          data-testid="split-difference"
        >
          {difference === 0 ? (
            "Fecha com o valor da despesa"
          ) : difference > 0 ? (
            <>
              Faltam <Money cents={difference} />
            </>
          ) : (
            <>
              Passou <Money cents={Math.abs(difference) as Cents} />
            </>
          )}
        </p>
      ) : null}

      {disabledReason ? (
        <p id="split-disabled-reason" className="text-muted-foreground text-sm">
          {disabledReason}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          loading={pending}
          disabled={!hydrated || !canSave}
          aria-describedby={disabledReason ? "split-disabled-reason" : undefined}
        >
          Salvar divisão
        </Button>
        {hasDivision ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={!hydrated || pending}
                />
              }
            >
              <Trash2Icon aria-hidden="true" data-icon="inline-start" />
              Remover divisão
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover a divisão?</AlertDialogTitle>
                <AlertDialogDescription>
                  A despesa deixa de aparecer em Divisão de contas e os saldos
                  entre integrantes são recalculados. A despesa em si continua
                  igual.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>
                  Manter divisão
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  loading={pending}
                  onClick={remove}
                >
                  Remover divisão
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </form>
  );
}
