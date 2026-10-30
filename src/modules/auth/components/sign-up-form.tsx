"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { InfoHint } from "@/components/shared/info-hint";
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
import { resendConfirmation, signUp } from "@/modules/auth/actions";
import { signUpSchema } from "@/modules/auth/schemas";
import type { ActionError } from "@/server/action";

type SignUpInput = z.input<typeof signUpSchema>;

export function SignUpForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const [resending, startResend] = useTransition();
  const [formError, setFormError] = useState<ActionError | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm<SignUpInput, unknown, z.output<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signUp({ ...values, next });
      if (result.ok) {
        setSentTo(result.data.email);
        return;
      }
      const { error } = result;
      if (
        applyFieldErrors(form.setError, error, [
          "displayName",
          "email",
          "password",
        ])
      ) {
        return;
      }
      setFormError(error);
    });
  });

  const resend = () => {
    if (!sentTo) return;
    startResend(async () => {
      const result = await resendConfirmation({ email: sentTo });
      if (result.ok) {
        toast.success("Se houver um cadastro pendente, enviamos um novo link.");
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  if (sentTo) {
    return (
      <div
        className="flex flex-col gap-5 text-center"
        data-testid="confirme-email"
      >
        <div className="bg-primary-soft-strong text-primary-text mx-auto flex size-12 items-center justify-center rounded-full">
          <MailCheckIcon aria-hidden="true" className="size-6" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">Confirme seu e-mail</h1>
          <p className="text-muted-foreground text-sm">
            Enviamos um link de confirmação para{" "}
            <strong className="text-foreground font-semibold break-all">
              {sentTo}
            </strong>
            . Abra a mensagem e clique no link para ativar sua conta.
          </p>
          <p className="text-muted-foreground text-sm">
            Não encontrou? Veja a caixa de spam ou peça um novo link.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          loading={resending}
          onClick={resend}
        >
          Reenviar confirmação
        </Button>
        <Link
          href={loginHref}
          className="text-primary-text inline-flex min-h-10 items-center justify-center text-sm font-medium underline-offset-4 hover:underline"
        >
          Já confirmei, entrar
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
      <div className="flex items-center gap-1">
        <h1 className="text-xl font-bold">Criar conta</h1>
        <InfoHint label="criar conta">
          Comece em poucos passos. Você confirma o e-mail e depois cria ou entra
          em uma família.
        </InfoHint>
      </div>

      {formError ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Não foi possível criar a conta</AlertTitle>
          <AlertDescription>{formError.message}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Controller
          name="displayName"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="cadastro-nome">Nome</FieldLabel>
              <Input
                {...field}
                id="cadastro-nome"
                autoComplete="name"
                placeholder="Como devemos chamar você?"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "cadastro-nome-erro" : undefined
                }
              />
              {fieldState.invalid ? (
                <FieldError
                  id="cadastro-nome-erro"
                  errors={[fieldState.error]}
                />
              ) : null}
            </Field>
          )}
        />
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="cadastro-email">E-mail</FieldLabel>
              <Input
                {...field}
                id="cadastro-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="voce@exemplo.com"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "cadastro-email-erro" : undefined
                }
              />
              {fieldState.invalid ? (
                <FieldError
                  id="cadastro-email-erro"
                  errors={[fieldState.error]}
                />
              ) : null}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="cadastro-senha">Senha</FieldLabel>
                <InfoHint label="a senha">
                  Use de 8 a 72 caracteres, com pelo menos uma letra e um
                  número.
                </InfoHint>
              </div>
              <PasswordInput
                {...field}
                id="cadastro-senha"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "cadastro-senha-erro" : undefined
                }
              />
              {fieldState.invalid ? (
                <FieldError
                  id="cadastro-senha-erro"
                  errors={[fieldState.error]}
                />
              ) : null}
            </Field>
          )}
        />
      </FieldGroup>

      <Button type="submit" size="lg" loading={pending} disabled={!hydrated}>
        Criar conta
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Já tem conta?{" "}
        <Link
          href={loginHref}
          className="text-primary-text inline-flex min-h-10 items-center font-medium underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </form>
  );
}
