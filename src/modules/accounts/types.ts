import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type { AccountType } from "@/modules/accounts/constants";
import type { CardInvoices } from "@/modules/reports/domain/card-invoices";

export type { AccountType };
export type {
  CardInvoices,
  ClosedInvoice,
  OpenInvoice,
} from "@/modules/reports/domain/card-invoices";

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
  /**
   * D25 (só cartão com fechamento e vencimento; senão `null`):
   * - `open`: fatura aberta (ciclo de hoje) = compras do ciclo ainda devidas + parcelas pendentes do ciclo;
   *   `closingDate`/`dueDate` são os da fatura aberta.
   * - `closed`: fatura fechada a pagar mais recente (inclui faturas anteriores não pagas); `amount` 0 = paga;
   *   `overdue` = vencimento anterior a hoje.
   */
  invoices: CardInvoices | null;
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
