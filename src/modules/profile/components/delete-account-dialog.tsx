"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { PasswordInput } from "@/components/shared/password-input";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  applyFieldErrors,
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { deleteAccount } from "@/modules/profile/actions";
import { deleteAccountSchema } from "@/modules/profile/schemas";
import type { ActionError } from "@/server/action";

/** Mesmas regras e mensagens do servidor; a confirmação digitada entra como texto livre no formulário. */
const formSchema = z.object({
  password: deleteAccountSchema.shape.password,
  confirmation: z.string().pipe(deleteAccountSchema.shape.confirmation),
});

type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

const FIELDS = ["password", "confirmation"] as const;

export function DeleteAccountDialog({
  willEraseFamily,
}: {
  willEraseFamily: boolean;
}) {
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<ActionError | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { password: "", confirmation: "" },
  });

  // Erro geral: o foco vai ao aviso para quem navega pelo teclado e por leitor de tela.
  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  const reset = () => {
    form.reset();
    setFormError(null);
  };

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await safeAction(() => deleteAccount(values));
      // Sucesso redireciona a /login?conta=excluida pelo servidor; só falha volta aqui.
      if (result.ok) return;
      const { error } = result;
      if (sessionExpired(error)) return;

      if (applyFieldErrors(form.setError, error, FIELDS)) {
        const first = FIELDS.find((name) => error.fieldErrors?.[name]?.[0]);
        if (first) form.setFocus(first);
        return;
      }
      if (error.code === "INVALID_CREDENTIALS") {
        // Limpa só a senha; a confirmação digitada fica.
        form.resetField("password");
        form.setError("password", { message: error.message });
        form.setFocus("password");
        return;
      }
      setFormError(error);
    });
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <AlertDialogTrigger
        render={<Button type="button" variant="destructive" />}
        disabled={!hydrated}
      >
        <Trash2Icon aria-hidden="true" data-icon="inline-start" />
        Excluir minha conta
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
        <form
          method="post"
          onSubmit={onSubmit}
          noValidate
          className="grid gap-4"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
            <AlertDialogDescription>
              {willEraseFamily
                ? "Você é a única pessoa da família: ela e todos os dados dela serão apagados agora. Não há como desfazer."
                : "Você sai da família e seu perfil é anonimizado agora. Não há como desfazer."}{" "}
              Para confirmar, informe sua senha e digite EXCLUIR.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {formError ? (
            <Alert
              ref={alertRef}
              variant="destructive"
              tabIndex={-1}
              className="focus-visible:ring-ring outline-none focus-visible:ring-3"
            >
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>Não foi possível excluir a conta</AlertTitle>
              <AlertDescription>
                <p>{formError.message}</p>
                {formError.code === "OWNER_MUST_TRANSFER" ? (
                  <Link
                    href="/familia"
                    className="text-primary-text inline-flex min-h-10 items-center font-medium underline underline-offset-4"
                  >
                    Ir para Família e transferir a propriedade
                  </Link>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="excluir-conta-senha">Senha</FieldLabel>
                  <PasswordInput
                    {...field}
                    id="excluir-conta-senha"
                    autoComplete="current-password"
                    placeholder="Informe sua senha"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid
                        ? "excluir-conta-senha-erro"
                        : undefined
                    }
                  />
                  {fieldState.invalid ? (
                    <FieldError
                      id="excluir-conta-senha-erro"
                      errors={[fieldState.error]}
                    />
                  ) : null}
                </Field>
              )}
            />
            <Controller
              name="confirmation"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="excluir-conta-confirmacao">
                    Digite EXCLUIR para confirmar
                  </FieldLabel>
                  <Input
                    {...field}
                    id="excluir-conta-confirmacao"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid
                        ? "excluir-conta-confirmacao-erro excluir-conta-confirmacao-dica"
                        : "excluir-conta-confirmacao-dica"
                    }
                  />
                  <FieldDescription id="excluir-conta-confirmacao-dica">
                    Use letras maiúsculas, exatamente como está escrito.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError
                      id="excluir-conta-confirmacao-erro"
                      errors={[fieldState.error]}
                    />
                  ) : null}
                </Field>
              )}
            />
          </FieldGroup>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              Manter minha conta
            </AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              loading={pending}
              disabled={!hydrated}
            >
              Excluir conta definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
