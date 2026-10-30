import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import type { CategoryOption } from "@/modules/categories/types";

const createBill = vi.fn();
const updateBill = vi.fn();
const push = vi.fn();

vi.mock("@/modules/bills/actions", () => ({
  createBill: (...args: unknown[]) => createBill(...args),
  updateBill: (...args: unknown[]) => updateBill(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/compromissos/novo",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BillForm } from "./bill-form";

const TODAY = "2026-10-23" as ISODate;
const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const EXPENSE_CATEGORY = "33333333-3333-4333-8333-333333333333";
const INCOME_CATEGORY = "44444444-4444-4444-8444-444444444444";

const categories: { income: CategoryOption[]; expense: CategoryOption[] } = {
  income: [
    {
      id: INCOME_CATEGORY,
      name: "Salário",
      parentId: null,
      color: "chart-1",
      icon: "briefcase",
    },
  ],
  expense: [
    {
      id: EXPENSE_CATEGORY,
      name: "Moradia",
      parentId: null,
      color: "chart-3",
      icon: "house",
    },
  ],
};

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

function renderForm(initial: Record<string, unknown> = {}) {
  return render(
    <BillForm
      mode="create"
      today={TODAY}
      accounts={[{ id: ACCOUNT_ID, name: "Conta corrente" }]}
      categories={categories}
      members={[]}
      initial={{
        description: "Aluguel",
        categoryId: EXPENSE_CATEGORY,
        accountId: ACCOUNT_ID,
        amount: "1500,00",
        ...initial,
      }}
    />,
  );
}

describe("BillForm", () => {
  it("troca o botão e as categorias ao alternar A pagar / A receber", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(
      screen.getByRole("button", { name: "Salvar conta a pagar" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "A receber" }));
    expect(
      screen.getByRole("button", { name: "Salvar conta a receber" }),
    ).toBeInTheDocument();
    // A categoria de despesa foi limpa ao trocar o tipo.
    expect(screen.getByLabelText("Categoria")).toHaveTextContent(
      "Selecione a categoria",
    );
    await user.click(screen.getByLabelText("Categoria"));
    expect(
      await screen.findByRole("option", { name: "Salário" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Moradia" }),
    ).not.toBeInTheDocument();
  });

  it("o interruptor Repetir revela os campos da série e troca o botão", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByLabelText("Frequência")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Observações")).toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Repetir" }));
    expect(screen.getByLabelText("Frequência")).toHaveTextContent("Todo mês");
    expect(screen.getByLabelText("A cada")).toHaveTextContent("1");
    expect(screen.getByLabelText("Termina em (opcional)")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Mais informações sobre Termina em (opcional)",
      }),
    );
    expect(
      await screen.findByText("Sem data para terminar."),
    ).toBeInTheDocument();
    // A série não aceita observações.
    expect(screen.queryByLabelText("Observações")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Salvar recorrência" }),
    ).toBeInTheDocument();
  });

  it("Desconto em folha: só em despesa recorrente, com ajuda, e vai no payload", async () => {
    const user = userEvent.setup();
    createBill.mockResolvedValue({
      ok: true,
      data: { id: "x", kind: "recurrence" },
    });
    renderForm();
    expect(
      screen.queryByRole("switch", { name: "Desconto em folha" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Repetir" }));
    const folha = screen.getByRole("switch", { name: "Desconto em folha" });
    await user.click(
      screen.getByRole("button", {
        name: "Mais informações sobre Desconto em folha",
      }),
    );
    expect(
      await screen.findByText(/não sai do saldo da conta/),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(folha);
    await user.click(
      screen.getByRole("button", { name: "Salvar recorrência" }),
    );
    await waitFor(() => expect(createBill).toHaveBeenCalledTimes(1));
    expect(createBill.mock.calls[0]?.[0]).toMatchObject({
      payrollDeduction: true,
    });
  });

  it("Desconto em folha some e é desmarcado ao mudar para A receber", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("switch", { name: "Repetir" }));
    await user.click(screen.getByRole("switch", { name: "Desconto em folha" }));
    await user.click(screen.getByRole("radio", { name: "A receber" }));
    expect(
      screen.queryByRole("switch", { name: "Desconto em folha" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "A pagar" }));
    expect(
      screen.getByRole("switch", { name: "Desconto em folha" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("valida o término da série no campo (antes do primeiro vencimento) e não envia", async () => {
    const user = userEvent.setup();
    renderForm({ dueDate: "2026-11-10", endDate: "2026-11-01" });
    await user.click(screen.getByRole("switch", { name: "Repetir" }));
    await user.click(
      screen.getByRole("button", { name: "Salvar recorrência" }),
    );

    const field = screen.getByLabelText("Termina em (opcional)");
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
    expect(
      screen.getByText(
        "A data final deve ser igual ou posterior ao primeiro vencimento.",
      ),
    ).toBeInTheDocument();
    expect(createBill).not.toHaveBeenCalled();
  });

  it("envia a série com frequência, intervalo e sem observações", async () => {
    const user = userEvent.setup();
    createBill.mockResolvedValue({
      ok: true,
      data: { id: "x", kind: "recurrence" },
    });
    renderForm();
    await user.click(screen.getByRole("switch", { name: "Repetir" }));
    await user.click(
      screen.getByRole("button", { name: "Salvar recorrência" }),
    );

    await waitFor(() => expect(createBill).toHaveBeenCalledTimes(1));
    const payload = createBill.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      repeat: true,
      kind: "pagar",
      frequency: "monthly",
      intervalCount: 1,
      dueDate: TODAY,
      amount: "1500,00",
    });
    expect(payload).not.toHaveProperty("notes");
    expect(payload).not.toHaveProperty("endDate");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/compromissos"));
  });

  it("mostra fieldErrors do servidor no campo e mantém o que foi digitado", async () => {
    const user = userEvent.setup();
    createBill.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos.",
        requestId: "r",
        fieldErrors: { description: ["Já existe um compromisso igual."] },
      },
    });
    renderForm();
    await user.click(
      screen.getByRole("button", { name: "Salvar conta a pagar" }),
    );
    expect(
      await screen.findByText("Já existe um compromisso igual."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Descrição")).toHaveValue("Aluguel");
    expect(screen.getByLabelText("Valor previsto")).toHaveValue("1500,00");
    expect(push).not.toHaveBeenCalled();
  });

  it("erro geral aparece em alerta, mantém os dados e permite tentar de novo", async () => {
    const user = userEvent.setup();
    createBill.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "ACCOUNT_ARCHIVED",
        message: "A conta está arquivada. Escolha outra conta.",
        requestId: "r",
      },
    });
    renderForm();
    await user.click(
      screen.getByRole("button", { name: "Salvar conta a pagar" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escolha outra conta",
    );
    expect(screen.getByLabelText("Descrição")).toHaveValue("Aluguel");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar conta a pagar" }),
      ).toBeEnabled(),
    );
  });
});
