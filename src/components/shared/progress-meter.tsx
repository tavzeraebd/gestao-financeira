"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type ProgressMeterProps = {
  /** Percentual já calculado por quem usa; `null` = sem dado (barra vazia). Acima de 100 a barra fica cheia. */
  value: number | null;
  tone: "default" | "warning" | "danger";
  /** Nome acessível da barra (ex.: "Alimentação"). */
  label: string;
  /** Texto real lido por leitores de tela (ex.: "112% do limite"). */
  valueText: string;
  className?: string;
};

const INDICATOR_TONE = {
  default: "[&_[data-slot=progress-indicator]]:bg-primary",
  warning: "[&_[data-slot=progress-indicator]]:bg-warning",
  danger: "[&_[data-slot=progress-indicator]]:bg-danger",
} as const;

export function ProgressMeter({
  value,
  tone,
  label,
  valueText,
  className,
}: ProgressMeterProps) {
  const clamped =
    value === null || Number.isNaN(value)
      ? 0
      : Math.min(100, Math.max(0, value));
  return (
    <Progress
      value={clamped}
      aria-label={label}
      getAriaValueText={() => valueText}
      data-slot="progress-meter"
      className={cn("w-full", INDICATOR_TONE[tone], className)}
    />
  );
}
