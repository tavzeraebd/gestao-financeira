/** Dinheiro no domínio: centavos inteiros (nunca ponto flutuante). Ver `financial-definitions.md` §1. */
export type Cents = number & { readonly __brand: "Cents" };

/** Teto por valor digitado/aceito (lançamento, saldo inicial, limite): 99.999.999,99 (SEC-18). */
export const MAX_CENTS = 9_999_999_999;

/** Teto de agregados (saldos, somas, `period_summary`): qualquer inteiro seguro de centavos. */
export const MAX_AGGREGATE_CENTS = Number.MAX_SAFE_INTEGER;

export function isCentsInRange(n: number): boolean {
  return Number.isSafeInteger(n) && Math.abs(n) <= MAX_CENTS;
}

/** Converte um inteiro em `Cents`. Lança se não for inteiro seguro dentro da faixa. */
export function asCents(n: number): Cents {
  if (!isCentsInRange(n)) {
    throw new RangeError("Valor em centavos fora da faixa permitida.");
  }
  // Normaliza -0 para 0.
  return (n === 0 ? 0 : n) as Cents;
}

/**
 * Converte um agregado (soma de valores válidos) em `Cents`. Aceita qualquer inteiro seguro, de modo
 * que somar lançamentos dentro do teto nunca lança; só um agregado acima do inteiro seguro lança.
 */
export function asAggregateCents(n: number): Cents {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError("Agregado em centavos acima do inteiro seguro.");
  }
  return (n === 0 ? 0 : n) as Cents;
}
