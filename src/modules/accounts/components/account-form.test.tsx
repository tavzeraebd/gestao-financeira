import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";

const createAccount = vi.fn();
const push = vi.fn();

vi.mock("@/modules/accounts/actions", () => ({
  createAccount: (...args: unknown[]) => createAccount(...args),
  updateAccount: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/contas/nova",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AccountForm } from "./account-form";

const TODAY = "2026-10-23" as ISODate;

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AccountForm", () => {
  it("conta corrente não mostra os campos de cartão", () => {
    render(<AccountForm mode="create" today={TODAY} />);
    expect(screen.getByLabelText("Saldo inicial")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Dia de fechamento"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Limite do cartão/)).not.toBeInTheDocument();
  });

  it("cartão mostra fatura, limite, fechamento e vencimento", () => {
    render(
      <AccountForm
        mode="create"
        today={TODAY}
        initial={{ type: "credit_card" }}
      />,
    );
    expect(
      screen.getByLabelText("Fatura atual (valor devido)"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Limite do cartão/)).toBeInTheDocument();
    expect(screen.getByLabelText("Dia de fechamento")).toBeInTheDocument();
    expect(screen.getByLabelText("Dia de vencimento")).toBeInTheDocument();
  });

  it("cartão exige fechamento e vencimento", async () => {
    const user = userEvent.setup();
    render(
      <AccountForm
        mode="create"
        today={TODAY}
        initial={{ type: "credit_card", name: "Visa", openingBalance: "0,00" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Dia de fechamento")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("exige o nome e mantém os dados quando o servidor recusa", async () => {
    const user = userEvent.setup();
    render(<AccountForm mode="create" today={TODAY} />);
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(
      await screen.findByText("Informe o nome da conta."),
    ).toBeInTheDocument();

    createAccount.mockResolvedValue({
      ok: false,
      error: {
        code: "NAME_TAKEN",
        message: "Já existe uma conta com este nome.",
        fieldErrors: { name: ["Já existe uma conta com este nome."] },
        requestId: "r",
      },
    });
    await user.type(screen.getByLabelText("Nome da conta"), "Principal");
    await user.type(screen.getByLabelText("Saldo inicial"), "1000");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(
      await screen.findByText("Já existe uma conta com este nome."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nome da conta")).toHaveValue("Principal");
  });

  it("tipo fica travado na edição", () => {
    render(
      <AccountForm
        mode="edit"
        accountId="11111111-1111-4111-8111-111111111111"
        today={TODAY}
        initial={{ name: "Principal", openingBalance: "0,00" }}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Tipo" })).toBeDisabled();
  });
});
