"use client";

import type { ReactNode, RefCallback } from "react";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

import { InfoHint } from "@/components/shared/info-hint";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

export type FieldControlProps = {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  ref: RefCallback<HTMLElement>;
  invalid: boolean;
  describedBy: string | undefined;
};

type LabeledFieldProps<V extends FieldValues> = {
  control: Control<V>;
  name: Path<V>;
  id: string;
  label: string;
  description?: string;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
};

/**
 * `Field` + `Controller` com a ligação de acessibilidade pronta (label, `aria-invalid`,
 * `aria-describedby`, `FieldError` com `role="alert"`). Os valores do formulário são texto.
 */
export function LabeledField<V extends FieldValues>({
  control,
  name,
  id,
  label,
  description,
  className,
  children,
}: LabeledFieldProps<V>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const invalid = fieldState.invalid;
        const errorId = `${id}-erro`;
        // A ajuda mora no ⓘ ao lado do rótulo; só o erro entra no aria-describedby.
        const describedBy = invalid ? errorId : undefined;
        return (
          <Field data-invalid={invalid} className={className}>
            {description ? (
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
                <InfoHint label={label}>{description}</InfoHint>
              </div>
            ) : (
              <FieldLabel htmlFor={id}>{label}</FieldLabel>
            )}
            {children({
              id,
              name: field.name,
              value: typeof field.value === "string" ? field.value : "",
              onChange: field.onChange,
              onBlur: field.onBlur,
              ref: field.ref,
              invalid,
              describedBy,
            })}
            {invalid ? (
              <FieldError id={errorId} errors={[fieldState.error]} />
            ) : null}
          </Field>
        );
      }}
    />
  );
}
