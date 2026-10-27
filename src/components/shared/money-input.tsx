"use client";

import type { ComponentProps } from "react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { parseBRL, toBRLInput } from "@/lib/money";

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
 * Campo monetário em texto pt-BR ("1.234,56"). No blur, um valor válido é reescrito no formato
 * canônico; um inválido é mantido para o schema explicar o erro. Funciona com `{...field}`.
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
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        className={cn("tabular-nums", className)}
        onChange={(event) => onChange(event.target.value)}
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
