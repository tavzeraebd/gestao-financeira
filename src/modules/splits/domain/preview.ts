import { allocate, subCents, sumCents, type Cents } from "@/lib/money";

/**
 * D13: divisão igual por maior resto. `memberIds` já vem na ordem `joined_at, id`, e o centavo de empate vai
 * para o menor índice. Só prévia: o banco (`private.allocate_cents`) recalcula o valor gravado.
 */
export function previewEqualSplit(
  total: Cents,
  memberIds: readonly string[],
): { memberId: string; amount: Cents }[] {
  const amounts = allocate(total, "equal", memberIds.length);
  return memberIds.map((memberId, index) => ({
    memberId,
    amount: amounts[index] as Cents,
  }));
}

/** Total − Σ das partes: 0 fecha, positivo falta, negativo passou. */
export function amountSplitDifference(
  total: Cents,
  parts: readonly Cents[],
): Cents {
  return subCents(total, sumCents(parts));
}
