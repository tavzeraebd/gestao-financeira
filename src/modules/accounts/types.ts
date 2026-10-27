import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type { AccountType } from "@/modules/accounts/constants";

export type { AccountType };

export type AccountView = {
  id: string;
  name: string;
  type: AccountType;
  institutionName: string | null;
  isActive: boolean;
  openingBalance: Cents;
  openingBalanceDate: ISODate;
  creditLimit: Cents | null;
  statementClosingDay: number | null;
  statementDueDay: number | null;
  balance: Cents;
  availableCredit: Cents | null;
};

export type AccountsOverview = {
  accounts: AccountView[];
  /** D3: soma dos saldos das contas de ativo (inclusive arquivadas; sem cartões). */
  consolidatedBalance: Cents;
  /** D8: soma de −saldo dos cartões com saldo negativo. */
  openCardDebt: Cents;
};

export type AccountOption = {
  id: string;
  name: string;
  type: AccountType;
  isActive: boolean;
};
