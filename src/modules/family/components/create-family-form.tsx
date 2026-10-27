"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { createFamily } from "@/modules/family/actions";
import { createFamilySchema } from "@/modules/family/schemas";
import type { ActionError } from "@/server/action";

type CreateFamilyInput = z.input<typeof createFamilySchema>;

export function CreateFamilyForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [formError, setFormError] = useState<ActionError | null>(null);

  const form = useForm<
    CreateFamilyInput,
    unknown,
    z.output<typeof createFamilySchema>
  >({
    resolver: zodResolver(createFamilySchema),
    defaultValues: { name: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await createFamily(values);
      if (result.ok) return;
      const { error } = result;
      if (sessionExpired(error)) return;
      if (error.code === "ALREADY_IN_FAMILY") {
        router.replace("/inicio");
        return;
      }
      if (applyFieldErrors(form.setError, error, ["name"])) return;
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
      {formError ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertTitle>Não foi possível criar a família</AlertTitle>
          <AlertDescription>{formError.message}</AlertDescription>
        </Alert>
      ) : null}

      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="familia-nome">Nome da família</FieldLabel>
            <Input
              {...field}
              id="familia-nome"
              autoComplete="off"
              placeholder="Ex.: Família Silva"
              aria-invalid={fieldState.invalid}
              aria-describedby={
                fieldState.invalid
                  ? "familia-nome-erro familia-nome-ajuda"
                  : "familia-nome-ajuda"
              }
            />
            <FieldDescription id="familia-nome-ajuda">
              Aparece para todas as pessoas que você convidar.
            </FieldDescription>
            {fieldState.invalid ? (
              <FieldError id="familia-nome-erro" errors={[fieldState.error]} />
            ) : null}
          </Field>
        )}
      />

      <Button type="submit" size="lg" loading={pending} disabled={!hydrated}>
        Criar família
      </Button>
    </form>
  );
}
