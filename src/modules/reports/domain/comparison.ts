import { negCents, percentOf, subCents, type Cents } from "@/lib/money";
import type { Comparison } from "../types";

/** D4/D20: variação sobre o valor absoluto do anterior; `previous = 0` -> `percent = null`. */
export function compare(current: Cents, previous: Cents): Comparison {
  const delta = subCents(current, previous);
  const base = previous < 0 ? negCents(previous) : previous;
  return { current, previous, delta, percent: percentOf(delta, base) };
}
