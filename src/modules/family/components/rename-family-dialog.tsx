"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, PencilIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  applyFieldErrors,
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { renameFamily } from "@/modules/family/actions";
import { renameFamilySchema } from "@/modules/family/schemas";

type RenameInput = z.input<typeof renameFamilySchema>;

export function RenameFamilyDialog({ currentName }: { currentName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <PencilIcon aria-hidden="true" data-icon="inline-start" />
        Editar
        <span className="sr-only">nome da família</span>
      </DialogTrigger>
      {/* Recria o formulário a cada abertura: o campo sempre parte do nome atual. */}
      {open ? (
        <RenameForm currentName={currentName} onClose={() => setOpen(false)} />
      ) : null}
    </Dialog>
  );
}

function RenameForm({
  currentName,
  onClose,
}: {
  currentName: string;
  onClose: () => void;
}) {
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<
    RenameInput,
    unknown,
    z.output<typeof renameFamilySchema>
  >({
    resolver: zodResolver(renameFamilySchema),
    defaultValues: { name: currentName },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await safeAction(() => renameFamily(values));
      if (result.ok) {
        toast.success("Nome da família atualizado.");
        onClose();
        return;
      }
      const { error } = result;
      if (sessionExpired(error)) return;
      if (applyFieldErrors(form.setError, error, ["name"])) return;
      setFormError(error.message);
    });
  });

  return (
    <DialogContent showCloseButton={false} className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Nome da família</DialogTitle>
        <DialogDescription>
          Aparece para todas as pessoas da família.
        </DialogDescription>
      </DialogHeader>
      <form
        method="post"
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-5"
      >
        {formError ? (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Não foi possível salvar o nome</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="familia-novo-nome">
                Nome da família
              </FieldLabel>
              <Input
                {...field}
                id="familia-novo-nome"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "familia-novo-nome-erro" : undefined
                }
              />
              {fieldState.invalid ? (
                <FieldError
                  id="familia-novo-nome-erro"
                  errors={[fieldState.error]}
                />
              ) : null}
            </Field>
          )}
        />
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
            Salvar nome
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
