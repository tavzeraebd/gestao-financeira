import {
  addCents,
  asCents,
  negCents,
  subCents,
  sumCents,
  type Cents,
} from "@/lib/money";
import type { AccountType } from "@/modules/accounts/constants";

type BalanceInput = { type: AccountType; balance: Cents };

/** D3: soma dos saldos das contas de ativo (inclusive arquivadas); cartões ficam fora. */
export function consolidatedBalance(accounts: readonly BalanceInput[]): Cents {
  return sumCents(
    accounts.filter((a) => a.type !== "credit_card").map((a) => a.balance),
  );
}

/** D8: soma de −saldo dos cartões com saldo negativo. */
export function openCardDebt(accounts: readonly BalanceInput[]): Cents {
  return sumCents(
    accounts
      .filter((a) => a.type === "credit_card" && a.balance < 0)
      .map((a) => negCents(a.balance)),
  );
}

/**
 * D8/D23: limite disponível = limite + saldo (a dívida é negativa) − parcelas pendentes do cartão.
 * `null` fora de cartão ou sem limite.
 */
export function availableCredit(
  type: AccountType,
  creditLimit: Cents | null,
  balance: Cents,
  pendingInstallments: Cents = asCents(0),
): Cents | null {
  if (type !== "credit_card" || creditLimit === null) return null;
  return subCents(addCents(creditLimit, balance), pendingInstallments);
}
