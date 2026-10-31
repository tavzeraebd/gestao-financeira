"use client";

import type { ComponentProps } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { maskBRLInput, parseBRL, toBRLInput } from "@/lib/money";

type MoneyInputProps = Omit<
  ComponentProps<"input">,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: string;
  onChange: (value: string) => void;
  /** Aceita um "-" inicial (saldo inicial de conta com cheque especial). */
  allowNegative?: boolean;
};

/**
 * Campo monetário em texto pt-BR ("1.234,56") com máscara de centavos: os dígitos digitados entram
 * como centavos ("3480" -> "34,80"). No blur, um valor inicial fora do formato canônico (ex.: "50")
 * é reescrito ("50,00"). Funciona com `{...field}`.
 */
export function MoneyInput({
  value,
  onChange,
  onBlur,
  allowNegative = false,
  className,
  placeholder = "0,00",
  ...props
}: MoneyInputProps) {
  return (
    <InputGroup>
      <InputGroupAddon aria-hidden="true">R$</InputGroupAddon>
      <InputGroupInput
        {...props}
        value={value}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        className={cn("tabular-nums", className)}
        onChange={(event) => {
          const input = event.target;
          const inputType = (event.nativeEvent as InputEvent).inputType;
          const masked = maskBRLInput(input.value, {
            allowNegative,
            deleting: inputType?.startsWith("delete") ?? false,
          });
          onChange(masked);
          // Cursor sempre no fim, depois que o React reescreve o valor.
          requestAnimationFrame(() => {
            const end = input.value.length;
            input.setSelectionRange?.(end, end);
          });
        }}
        onBlur={(event) => {
          const result = parseBRL(event.target.value, { allowNegative });
          if (result.ok) {
            const formatted = toBRLInput(result.value);
            if (formatted !== event.target.value) onChange(formatted);
          }
          onBlur?.(event);
        }}
      />
    </InputGroup>
  );
}
