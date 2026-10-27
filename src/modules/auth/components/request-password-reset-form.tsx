"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyFieldErrors } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { requestPasswordReset } from "@/modules/auth/actions";
import { requestPasswordResetSchema } from "@/modules/auth/schemas";
import type { ActionError } from "@/server/action";

type RequestInput = z.input<typeof requestPasswordResetSchema>;

export function RequestPasswordResetForm() {
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<ActionError | null>(null);
  const [done, setDone] = useState(false);

  const form = useForm<
    RequestInput,
    unknown,
    z.output<typeof requestPasswordResetSchema>
  >({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (result.ok) {
        setDone(true);
        return;
      }
      const { error } = result;
      if (applyFieldErrors(form.setError, error, ["email"])) return;
      setFormError(error);
    });
  });

  if (done) {
    return (
      <div className="flex flex-col gap-5 text-center">
        <div className="bg-primary-soft-strong text-primary-text mx-auto flex size-12 items-center justify-center rounded-full">
          <MailCheckIcon aria-hidden="true" className="size-6" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">Verifique seu e-mail</h1>
          <p role="status" className="text-muted-foreground text-sm">
            Se houver uma conta para este e-mail, enviaremos um link.
          </p>
        </div>
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>
          Voltar para entrar
        </Link>
      </div>
    );
  }

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">Recuperar senha</h1>
        <p className="text-muted-foreground text-sm">
          Informe o e-mail da conta. Enviaremos um link para criar uma nova
          senha.
        </p>
      </div>

      {formError ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Não foi possível enviar o link</AlertTitle>
          <AlertDescription>{formError.message}</AlertDescription>
        </Alert>
      ) : null}

      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="recuperar-email">E-mail</FieldLabel>
            <Input
              {...field}
              id="recuperar-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="voce@exemplo.com"
              aria-invalid={fieldState.invalid}
              aria-describedby={
                fieldState.invalid ? "recuperar-email-erro" : undefined
              }
            />
            {fieldState.invalid ? (
              <FieldError
                id="recuperar-email-erro"
                errors={[fieldState.error]}
              />
            ) : null}
          </Field>
        )}
      />

      <Button type="submit" size="lg" loading={pending} disabled={!hydrated}>
        Enviar link
      </Button>

      <Link
        href="/login"
        className="text-primary-text inline-flex min-h-10 items-center justify-center text-sm font-medium underline-offset-4 hover:underline"
      >
        Voltar para entrar
      </Link>
    </form>
  );
}
