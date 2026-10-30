import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import type { BillKind } from "@/modules/bills/constants";

const updateRecurrence = vi.fn();
const push = vi.fn();

vi.mock("@/modules/recurrences/actions", () => ({
  updateRecurrence: (...args: unknown[]) => updateRecurrence(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/recorrencias/x/editar",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RecurrenceForm } from "./recurrence-form";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";
const SERIES_ID = "55555555-5555-4555-8555-555555555555";

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

function renderForm(kind: BillKind, payrollDeduction = false) {
  return render(
    <RecurrenceForm
      today={"2026-10-30" as ISODate}
      recurrenceId={SERIES_ID}
      kind={kind}
      scheduleLabel="Todo mês, dia 5"
      startDate={"2026-01-05" as ISODate}
      accounts={[{ id: ACCOUNT_ID, name: "Conta corrente" }]}
      categories={[
        {
          id: CATEGORY_ID,
          name: "Empréstimos",
          parentId: null,
          color: "chart-3",
          icon: "house",
        },
      ]}
      members={[]}
      initial={{
        description: "Empréstimo",
        amount: "500,00",
        categoryId: CATEGORY_ID,
        accountId: ACCOUNT_ID,
        assignedMemberId: "",
        endDate: "",
        payrollDeduction,
      }}
    />,
  );
}

describe("RecurrenceForm: desconto em folha", () => {
  it("despesa mostra o interruptor com rótulo e ajuda", () => {
    renderForm("pagar");
    const folha = screen.getByRole("switch", { name: "Desconto em folha" });
    expect(folha).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByText(
        "O valor entra no comprometimento, mas não sai do saldo da conta. Use para parcelas descontadas direto no salário.",
      ),
    ).toBeInTheDocument();
  });

  it("receita não mostra o interruptor", () => {
    renderForm("receber");
    expect(
      screen.queryByRole("switch", { name: "Desconto em folha" }),
    ).not.toBeInTheDocument();
  });

  it("envia payrollDeduction conforme o interruptor", async () => {
    const user = userEvent.setup();
    updateRecurrence.mockResolvedValue({ ok: true, data: null });
    renderForm("pagar", true);
    expect(
      screen.getByRole("switch", { name: "Desconto em folha" }),
    ).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(updateRecurrence).toHaveBeenCalledTimes(1));
    expect(updateRecurrence.mock.calls[0]?.[0]).toMatchObject({
      recurrenceId: SERIES_ID,
      kind: "pagar",
      payrollDeduction: true,
    });
  });

  it("receita envia payrollDeduction falso, mesmo com valor guardado verdadeiro", async () => {
    const user = userEvent.setup();
    updateRecurrence.mockResolvedValue({ ok: true, data: null });
    renderForm("receber", true);
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() => expect(updateRecurrence).toHaveBeenCalledTimes(1));
    expect(updateRecurrence.mock.calls[0]?.[0]).toMatchObject({
      payrollDeduction: false,
    });
  });
});
