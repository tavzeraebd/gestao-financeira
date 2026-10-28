"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon, CheckIcon, CopyIcon } from "lucide-react";
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
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  applyFieldErrors,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { createInvite } from "@/modules/family/actions";
import { formatDateTime } from "@/modules/family/components/invite-labels";
import { createInviteSchema } from "@/modules/family/schemas";
import type { ActionError } from "@/server/action";

type CreateInviteInput = z.input<typeof createInviteSchema>;
type CreatedInvite = { inviteUrl: string; expiresAt: string };

const ROLE_OPTIONS = [
  {
    value: "member",
    label: "Integrante",
    help: "Vê os dados da família e não gerencia convites.",
  },
  {
    value: "admin",
    label: "Administrador",
    help: "Também convida novos integrantes.",
  },
] as const;

export function CreateInviteForm({
  canCreateAdmin,
}: {
  canCreateAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [formError, setFormError] = useState<ActionError | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<
    CreateInviteInput,
    unknown,
    z.output<typeof createInviteSchema>
  >({
    resolver: zodResolver(createInviteSchema),
    defaultValues: { role: "member", email: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createInvite({
        role: canCreateAdmin ? values.role : "member",
        email: values.email,
      });
      if (result.ok) {
        setCreated(result.data);
        setCopied(false);
        form.reset({ role: "member", email: "" });
        return;
      }
      const { error } = result;
      if (sessionExpired(error)) return;
      if (applyFieldErrors(form.setError, error, ["email"])) return;
      setFormError(error);
    });
  });

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      setCopied(true);
      toast.success("Link copiado.");
    } catch {
      toast.error(
        "Não foi possível copiar. Selecione o link e copie manualmente.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {created ? (
        <Alert variant="success" data-testid="convite-criado">
          <CheckIcon aria-hidden="true" />
          <AlertTitle>Convite criado</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <p>
              Copie e envie o link agora: ele aparece só desta vez. Vale até{" "}
              {formatDateTime(created.expiresAt)}.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                readOnly
                value={created.inviteUrl}
                aria-label="Link do convite"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={copy}
              >
                {copied ? (
                  <CheckIcon aria-hidden="true" />
                ) : (
                  <CopyIcon aria-hidden="true" />
                )}
                {copied ? "Copiado" : "Copiar link"}
              </Button>
            </div>
            <div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreated(null)}
              >
                Ocultar link
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <form
        method="post"
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-4"
      >
        {formError ? (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Não foi possível criar o convite</AlertTitle>
            <AlertDescription>{formError.message}</AlertDescription>
          </Alert>
        ) : null}

        {canCreateAdmin ? (
          <Controller
            name="role"
            control={form.control}
            render={({ field }) => (
              <FieldSet>
                <FieldLegend variant="label">Papel na família</FieldLegend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ROLE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="border-input has-checked:border-primary-text has-checked:bg-primary-soft has-focus-visible:ring-ring flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-focus-visible:ring-3"
                    >
                      <input
                        type="radio"
                        name={field.name}
                        value={option.value}
                        checked={field.value === option.value}
                        onChange={() => field.onChange(option.value)}
                        onBlur={field.onBlur}
                        className="accent-primary-text mt-1 size-4 shrink-0"
                      />
                      <span className="flex flex-col">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-muted-foreground">
                          {option.help}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </FieldSet>
            )}
          />
        ) : null}

        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="convite-email">E-mail (opcional)</FieldLabel>
              <Input
                {...field}
                value={field.value ?? ""}
                id="convite-email"
                type="email"
                autoComplete="off"
                inputMode="email"
                placeholder="pessoa@exemplo.com"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid
                    ? "convite-email-erro convite-email-ajuda"
                    : "convite-email-ajuda"
                }
              />
              <FieldDescription id="convite-email-ajuda">
                Se informar, só a conta com esse e-mail poderá aceitar. O Núcleo
                não envia o convite: você compartilha o link.
              </FieldDescription>
              {fieldState.invalid ? (
                <FieldError
                  id="convite-email-erro"
                  errors={[fieldState.error]}
                />
              ) : null}
            </Field>
          )}
        />

        <div>
          <Button type="submit" loading={pending} disabled={!hydrated}>
            Gerar link de convite
          </Button>
        </div>
      </form>
    </div>
  );
}
