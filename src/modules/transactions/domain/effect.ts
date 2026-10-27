import type { TransactionType } from "@/modules/transactions/constants";
import type { TransactionDirection } from "@/modules/transactions/types";

/**
 * Sinal exibido de um lançamento (D1/D5).
 * - receita entra, despesa sai; o estorno inverte (estorno de despesa é entrada);
 * - transferência é `neutral`, salvo com filtro de conta: sai da origem (`out`) e entra no destino (`in`).
 */
export function directionOf(tx: {
  type: TransactionType;
  isReversal: boolean;
  accountId: string;
  destinationAccountId: string | null;
  accountFilterId?: string;
}): TransactionDirection {
  if (tx.type === "transfer") {
    if (!tx.accountFilterId) return "neutral";
    if (tx.accountFilterId === tx.accountId) return "out";
    if (tx.accountFilterId === tx.destinationAccountId) return "in";
    return "neutral";
  }
  const entering = tx.type === "income";
  return entering !== tx.isReversal ? "in" : "out";
}
