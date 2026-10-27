import { asAggregateCents, type Cents } from "./cents";

export function addCents(a: Cents, b: Cents): Cents {
  return asAggregateCents(a + b);
}

export function subCents(a: Cents, b: Cents): Cents {
  return asAggregateCents(a - b);
}

export function negCents(c: Cents): Cents {
  return asAggregateCents(-c);
}

export function sumCents(list: readonly Cents[]): Cents {
  let total = asAggregateCents(0);
  for (const item of list) total = addCents(total, item);
  return total;
}

/**
 * Distribuição por maior resto (D13): a soma das partes é exatamente `total`.
 * `weights` são inteiros não negativos (ex.: pesos ou pontos-base); `"equal"` divide em `parts`
 * partes iguais. Empate de resto -> a parte de menor índice recebe o centavo.
 * O produto `total × peso` usa BigInt para não perder precisão.
 */
export function allocate(
  total: Cents,
  weights: readonly number[] | "equal",
  parts?: number,
): Cents[] {
  let list: readonly number[];
  if (weights === "equal") {
    if (parts === undefined || !Number.isInteger(parts) || parts < 1) {
      throw new RangeError('Informe o número de partes (>= 1) para "equal".');
    }
    list = Array.from({ length: parts }, () => 1);
  } else {
    list = weights;
  }
  if (list.length === 0) throw new RangeError("Informe ao menos uma parte.");
  if (list.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new RangeError("Os pesos devem ser inteiros não negativos.");
  }

  const bigWeights = list.map((w) => BigInt(w));
  const weightSum = bigWeights.reduce((acc, w) => acc + w, BigInt(0));
  if (weightSum === BigInt(0)) {
    throw new RangeError("A soma dos pesos deve ser maior que zero.");
  }

  const negative = total < 0;
  const absTotal = BigInt(Math.abs(total));
  const shares = bigWeights.map((w, index) => {
    const numerator = absTotal * w;
    return {
      index,
      base: numerator / weightSum,
      remainder: numerator % weightSum,
    };
  });

  const assigned = shares.reduce((acc, s) => acc + s.base, BigInt(0));
  let leftover = Number(absTotal - assigned);
  const byRemainder = [...shares].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  const extra = new Set<number>();
  for (const share of byRemainder) {
    if (leftover === 0) break;
    extra.add(share.index);
    leftover -= 1;
  }

  return shares.map((s) => {
    const value = Number(s.base) + (extra.has(s.index) ? 1 : 0);
    return asAggregateCents(negative ? -value : value);
  });
}

/** Percentual (0–100+) só para exibição; `whole = 0` -> `null`. */
export function percentOf(part: Cents, whole: Cents): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}
