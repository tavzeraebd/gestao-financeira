"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, MailWarningIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { PasswordInput } from "@/components/shared/password-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { applyFieldErrors } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { resendConfirmation, signIn } from "@/modules/auth/actions";
import { signInSchema } from "@/modules/auth/schemas";
import type { ActionError } from "@/server/action";

type SignInInput = z.input<typeof signInSchema>;

export function SignInForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [resending, startResend] = useTransition();
  const [formError, setFormError] = useState<ActionError | null>(null);

  const form = useForm<SignInInput, unknown, z.output<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signIn({ ...values, next });
      if (result.ok) return;
      const { error } = result;
      if (applyFieldErrors(form.setError, error, ["email", "password"])) {
        return;
      }
      // Mantém o e-mail digitado; limpa só a senha.
      form.resetField("password");
      setFormError(error);
    });
  });

  const resend = () => {
    const email = form.getValues("email");
    startResend(async () => {
      const result = await resendConfirmation({ email });
      if (result.ok) {
        toast.success("Se houver um cadastro pendente, enviamos um novo link.");
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const unconfirmed = formError?.code === "EMAIL_NOT_CONFIRMED";

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      {formError ? (
        <Alert variant={unconfirmed ? "warning" : "destructive"}>
          {unconfirmed ? (
            <MailWarningIcon aria-hidden="true" />
          ) : (
            <AlertCircleIcon aria-hidden="true" />
          )}
          <AlertTitle>
            {unconfirmed
              ? "E-mail ainda não confirmado"
              : "Não foi possível entrar"}
          </AlertTitle>
          <AlertDescription>
            <p>{formError.message}</p>
            {unconfirmed ? (
              <Button
                type="button"
                variant="outline"
                className="mt-2"
                loading={resending}
                onClick={resend}
              >
                Reenviar confirmação
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-email">E-mail</FieldLabel>
              <Input
                {...field}
                id="login-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="voce@exemplo.com"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "login-email-erro" : undefined
                }
              />
              {fieldState.invalid ? (
                <FieldError id="login-email-erro" errors={[fieldState.error]} />
              ) : null}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="login-senha">Senha</FieldLabel>
              <PasswordInput
                {...field}
                id="login-senha"
                autoComplete="current-password"
                placeholder="Informe sua senha"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "login-senha-erro" : undefined
                }
              />
              {fieldState.invalid ? (
                <FieldError id="login-senha-erro" errors={[fieldState.error]} />
              ) : null}
            </Field>
          )}
        />
      </FieldGroup>

      <Button type="submit" size="lg" loading={pending} disabled={!hydrated}>
        Entrar
      </Button>

      <div className="flex flex-col items-center gap-2 text-sm">
        <Link
          href="/recuperar-senha"
          className="text-primary-text inline-flex min-h-10 items-center underline-offset-4 hover:underline"
        >
          Esqueci minha senha
        </Link>
        <p className="text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link
            href={
              next ? `/cadastro?next=${encodeURIComponent(next)}` : "/cadastro"
            }
            className="text-primary-text inline-flex min-h-10 items-center font-medium underline-offset-4 hover:underline"
          >
            Criar conta
          </Link>
        </p>
      </div>
    </form>
  );
}
