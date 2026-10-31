import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { TransactionListItem } from "@/modules/transactions/types";

import { TransactionList } from "./transaction-list";

afterEach(() => {
  cleanup();
});

function item(overrides: Partial<TransactionListItem>): TransactionListItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "expense",
    description: "Mercado",
    amount: asCents(10000),
    direction: "out",
    transactionDate: "2026-10-15" as ISODate,
    reportingDate: "2026-10-15" as ISODate,
    status: "paid",
    account: { id: "a1", name: "Nubank" },
    destinationAccount: null,
    category: null,
    assignedMember: null,
    reversalOfId: null,
    recurrenceId: null,
    installmentGroupId: null,
    installmentNumber: null,
    installmentTotal: null,
    canManage: true,
    ...overrides,
  };
}

describe("TransactionList", () => {
  it("mostra a badge da fatura em despesa de cartão cujo mês de referência difere da data", () => {
    render(
      <TransactionList
        items={[
          item({
            description: "Compra no cartão",
            account: { id: "c1", name: "Visa" },
            transactionDate: "2026-10-31" as ISODate,
            reportingDate: "2026-11-20" as ISODate,
          }),
        ]}
      />,
    );

    // A tabela e a lista de cartões renderizam o mesmo item (CSS esconde uma delas).
    expect(screen.getAllByText("Fatura nov/26").length).toBeGreaterThan(0);
  });

  it("não mostra a badge da fatura em conta corrente", () => {
    render(
      <TransactionList
        items={[
          item({
            description: "Salário",
            type: "income",
            direction: "in",
            account: { id: "b1", name: "Itaú" },
          }),
        ]}
      />,
    );

    expect(screen.queryByText(/^Fatura /)).not.toBeInTheDocument();
  });
});
