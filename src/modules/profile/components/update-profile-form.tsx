"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  applyFieldErrors,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { updateProfile } from "@/modules/profile/actions";
import { updateProfileSchema } from "@/modules/profile/schemas";
import type { ActionError } from "@/server/action";

type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export function UpdateProfileForm({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [formError, setFormError] = useState<ActionError | null>(null);

  const form = useForm<
    UpdateProfileInput,
    unknown,
    z.output<typeof updateProfileSchema>
  >({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { displayName },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updateProfile(values);
      if (result.ok) {
        toast.success("Perfil atualizado.");
        form.reset(values);
        return;
      }
      const { error } = result;
      if (sessionExpired(error)) return;
      if (applyFieldErrors(form.setError, error, ["displayName"])) return;
      // Mantém o que foi digitado.
      setFormError(error);
    });
  });

  return (
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
          <AlertDescription>{formError.message}</AlertDescription>
        </Alert>
      ) : null}

      <Controller
        name="displayName"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="perfil-nome">Nome de exibição</FieldLabel>
            <Input
              {...field}
              id="perfil-nome"
              autoComplete="name"
              aria-invalid={fieldState.invalid}
              aria-describedby={
                fieldState.invalid ? "perfil-nome-erro" : undefined
              }
            />
            {fieldState.invalid ? (
              <FieldError id="perfil-nome-erro" errors={[fieldState.error]} />
            ) : null}
          </Field>
        )}
      />

      <Field>
        <FieldLabel htmlFor="perfil-email">E-mail</FieldLabel>
        <Input id="perfil-email" value={email} readOnly disabled />
        <FieldDescription>
          O e-mail da conta não pode ser alterado por aqui.
        </FieldDescription>
      </Field>

      <div>
        <Button
          type="submit"
          loading={pending}
          disabled={!hydrated || !form.formState.isDirty}
        >
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}
