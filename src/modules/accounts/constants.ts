export const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "digital_wallet",
  "investment",
  "other",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  cash: "Dinheiro",
  credit_card: "Cartão de crédito",
  digital_wallet: "Carteira digital",
  investment: "Investimento",
  other: "Outra",
};

export function toAccountType(value: string): AccountType {
  if (!(ACCOUNT_TYPES as readonly string[]).includes(value)) {
    throw new Error("Tipo de conta desconhecido no banco.");
  }
  return value as AccountType;
}
