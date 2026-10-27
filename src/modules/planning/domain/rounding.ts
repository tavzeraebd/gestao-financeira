import { asAggregateCents, MAX_CENTS, type Cents } from "@/lib/money";

/**
 * D15 / R19: único ponto que converte `number` (cálculo da simulação) em centavos, com meio para longe do zero.
 * Devolve `null` para `NaN`, `Infinity` ou valor acima do teto de agregados (a simulação vira `OUT_OF_RANGE`).
 */
export function roundToCents(value: number): Cents | null {
  if (!Number.isFinite(value)) return null;
  const rounded = value < 0 ? -Math.round(-value) : Math.round(value);
  return Number.isSafeInteger(rounded) ? asAggregateCents(rounded) : null;
}

/** Inteiro positivo de centavos válido como entrada (1..teto por valor). */
export function isPositiveCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_CENTS;
}

/** Divisão inteira arredondada para cima (só inteiros ≥ 0; divisor > 0). */
export function ceilDiv(value: number, divisor: number): number {
  return Math.floor((value + divisor - 1) / divisor);
}

/** `true` se `value` é inteiro entre `min` e `max`. */
export function isIntegerInRange(value: number, min: number, max: number) {
  return Number.isInteger(value) && value >= min && value <= max;
}
