"use client";

import { Radio } from "@base-ui/react/radio";
import type { LucideIcon } from "lucide-react";

import { RadioGroup } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  tone?: "default" | "income" | "expense";
};

type SegmentedControlProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentOption<T>[];
  "aria-label": string;
  disabled?: boolean;
  className?: string;
};

const CHECKED_TONE = {
  default:
    "data-checked:bg-card data-checked:text-foreground data-checked:shadow-sm",
  income:
    "data-checked:bg-success-soft data-checked:text-foreground data-checked:shadow-sm",
  expense:
    "data-checked:bg-danger-soft data-checked:text-foreground data-checked:shadow-sm",
} as const;

const CHECKED_ICON = {
  default: "group-data-checked/segment:text-primary-text",
  income: "group-data-checked/segment:text-success",
  expense: "group-data-checked/segment:text-danger",
} as const;

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
  disabled,
  className,
}: SegmentedControlProps<T>) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "bg-muted inline-flex w-full flex-row gap-1 rounded-lg p-1",
        disabled && "opacity-60",
        className,
      )}
    >
      {options.map((option) => {
        const tone = option.tone ?? "default";
        const Icon = option.icon;
        return (
          <Radio.Root
            key={option.value}
            value={option.value}
            data-slot="segmented-item"
            className={cn(
              "group/segment text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:border-ring flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 disabled:cursor-not-allowed data-checked:cursor-default",
              CHECKED_TONE[tone],
            )}
          >
            {Icon ? (
              <Icon
                aria-hidden="true"
                className={cn("size-4", CHECKED_ICON[tone])}
              />
            ) : null}
            {option.label}
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
}
