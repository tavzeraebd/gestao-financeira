import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { AccountView } from "@/modules/accounts/types";

vi.mock("@/modules/accounts/actions", () => ({
  archiveAccount: vi.fn(),
  reactivateAccount: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/contas",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AccountCard } from "./account-card";

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const d = (s: string) => s as ISODate;

function account(overrides: Partial<AccountView>): AccountView {
  return {
    id: "a1",
    name: "Cartão Azul",
    type: "credit_card",
    institutionName: null,
    isActive: true,
    openingBalance: asCents(0),
    openingBalanceDate: d("2026-01-01"),
    creditLimit: asCents(500000),
    statementClosingDay: 25,
    statementDueDay: 5,
    balance: asCents(-30000),
    availableCredit: asCents(470000),
    invoices: null,
    ...overrides,
  };
}

const OPEN = {
  closingDate: d("2026-11-25"),
  dueDate: d("2026-12-05"),
  amount: asCents(12000),
};

describe("AccountCard — faturas", () => {
  it("fatura aberta sem fechada a pagar", () => {
    render(
      <AccountCard
        canManage={false}
        account={account({
          invoices: {
            open: OPEN,
            closed: { ...OPEN, amount: asCents(0), overdue: false },
          },
        })}
      />,
    );
    const aberta = screen.getByTestId("fatura-aberta");
    expect(within(aberta).getByText("Fatura de dezembro")).toBeInTheDocument();
    expect(aberta).toHaveTextContent("Fecha 25/11 · vence 05/12");
    expect(
      within(aberta).getByRole("button", {
        name: "Mais informações sobre fatura em aberto",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("fatura-fechada")).not.toBeInTheDocument();
    expect(screen.getByText("Limite disponível")).toBeInTheDocument();
  });

  it("fatura fechada a vencer não mostra Vencida", () => {
    render(
      <AccountCard
        canManage={false}
        account={account({
          invoices: {
            open: OPEN,
            closed: {
              closingDate: d("2026-10-25"),
              dueDate: d("2026-11-05"),
              amount: asCents(8000),
              overdue: false,
            },
          },
        })}
      />,
    );
    const fechada = screen.getByTestId("fatura-fechada");
    expect(fechada).toHaveTextContent("Fatura de novembro");
    expect(fechada).toHaveTextContent("Vence 05/11");
    expect(within(fechada).queryByText("Vencida")).not.toBeInTheDocument();
  });

  it("fatura fechada vencida mostra Vencida e a data", () => {
    render(
      <AccountCard
        canManage={false}
        account={account({
          invoices: {
            open: OPEN,
            closed: {
              closingDate: d("2026-09-25"),
              dueDate: d("2026-10-05"),
              amount: asCents(8000),
              overdue: true,
            },
          },
        })}
      />,
    );
    const fechada = screen.getByTestId("fatura-fechada");
    expect(within(fechada).getByText("Vencida")).toBeInTheDocument();
    expect(fechada).toHaveTextContent("Venceu 05/10");
  });

  it("conta que não é cartão não mostra faturas", () => {
    render(
      <AccountCard
        canManage={false}
        account={account({
          type: "checking",
          creditLimit: null,
          availableCredit: null,
          balance: asCents(10000),
        })}
      />,
    );
    expect(screen.queryByTestId("fatura-aberta")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fatura-fechada")).not.toBeInTheDocument();
    expect(screen.getByText("Saldo")).toBeInTheDocument();
  });
});
