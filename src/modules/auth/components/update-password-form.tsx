"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { PasswordInput } from "@/components/shared/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  applyFieldErrors,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { updatePassword } from "@/modules/auth/actions";
import { updatePasswordSchema } from "@/modules/auth/schemas";
import type { ActionError } from "@/server/action";

type UpdatePasswordInput = z.input<typeof updatePasswordSchema>;

export function UpdatePasswordForm() {
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [formError, setFormError] = useState<ActionError | null>(null);

  const form = useForm<
    UpdatePasswordInput,
    unknown,
    z.output<typeof updatePasswordSchema>
  >({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (result.ok) return;
      const { error } = result;
      if (sessionExpired(error)) return;
      if (error.code === "WEAK_PASSWORD" || error.code === "SAME_PASSWORD") {
        form.setError("password", { message: error.message });
        return;
      }
      if (
        applyFieldErrors(form.setError, error, ["password", "confirmPassword"])
      ) {
        return;
      }
      setFormError(error);
    });
  });

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">Criar nova senha</h1>
        <p className="text-muted-foreground text-sm">
          Escolha uma senha nova para continuar usando o Núcleo.
        </p>
      </div>

      {formError ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Não foi possível salvar a senha</AlertTitle>
          <AlertDescription>{formError.message}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="nova-senha">Nova senha</FieldLabel>
              <PasswordInput
                {...field}
                id="nova-senha"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid
                    ? "nova-senha-erro nova-senha-ajuda"
                    : "nova-senha-ajuda"
                }
              />
              <FieldDescription id="nova-senha-ajuda">
                Use de 8 a 72 caracteres, com pelo menos uma letra e um número.
              </FieldDescription>
              {fieldState.invalid ? (
                <FieldError id="nova-senha-erro" errors={[fieldState.error]} />
              ) : null}
            </Field>
          )}
        />
        <Controller
          name="confirmPassword"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="confirmar-senha">
                Confirmar nova senha
              </FieldLabel>
              <PasswordInput
                {...field}
                id="confirmar-senha"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "confirmar-senha-erro" : undefined
                }
              />
              {fieldState.invalid ? (
                <FieldError
                  id="confirmar-senha-erro"
                  errors={[fieldState.error]}
                />
              ) : null}
            </Field>
          )}
        />
      </FieldGroup>

      <Button type="submit" size="lg" loading={pending} disabled={!hydrated}>
        Salvar nova senha
      </Button>
    </form>
  );
}
