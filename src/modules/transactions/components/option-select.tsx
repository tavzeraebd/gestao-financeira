"use client";

import type { ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  /** Conteúdo visual (ex.: ícone + nome); o `label` continua sendo o nome acessível. */
  node?: ReactNode;
};

type OptionSelectProps = {
  id: string;
  /** `""` = nenhuma escolha. */
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Quando informado, acrescenta a opção "sem escolha" (valor `""`). */
  emptyLabel?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  onBlur?: () => void;
  className?: string;
};

const EMPTY = "__vazio__";

export function OptionSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Selecione",
  emptyLabel,
  invalid,
  describedBy,
  disabled,
  onBlur,
  className,
}: OptionSelectProps) {
  const items: SelectOption[] = emptyLabel
    ? [{ value: EMPTY, label: emptyLabel }, ...options]
    : options;
  const byValue = new Map(items.map((item) => [item.value, item]));
  const current = value === "" ? (emptyLabel ? EMPTY : null) : value;

  return (
    <Select
      value={current}
      onValueChange={(next) =>
        onValueChange(next === null || next === EMPTY ? "" : next)
      }
      items={items.map(({ value: v, label }) => ({ value: v, label }))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onBlur={onBlur}
        className={cn("w-full", className)}
      >
        <SelectValue placeholder={placeholder}>
          {(selected: string | null) => {
            const item = selected === null ? undefined : byValue.get(selected);
            return (
              item?.node ??
              item?.label ?? (
                <span className="text-muted-foreground">{placeholder}</span>
              )
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.node ?? item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
