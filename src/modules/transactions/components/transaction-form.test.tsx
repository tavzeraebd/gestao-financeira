import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import type { CategoryOption } from "@/modules/categories/types";

const createTransaction = vi.fn();
const updateTransaction = vi.fn();
const push = vi.fn();
const replace = vi.fn();

vi.mock("@/modules/transactions/actions", () => ({
  createTransaction: (...args: unknown[]) => createTransaction(...args),
  updateTransaction: (...args: unknown[]) => updateTransaction(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
  usePathname: () => "/transacoes/nova",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TransactionForm } from "./transaction-form";

const TODAY = "2026-10-23" as ISODate;
const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";

const categories: { income: CategoryOption[]; expense: CategoryOption[] } = {
  income: [],
  expense: [
    {
      id: CATEGORY_ID,
      name: "Mercado",
      parentId: null,
      color: "chart-3",
      icon: "utensils",
    },
  ],
};
const accounts = [
  { id: ACCOUNT_ID, name: "Conta corrente" },
  { id: OTHER_ACCOUNT_ID, name: "Poupança" },
];

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

function renderForm(initial: Record<string, string> = {}) {
  return render(
    <TransactionForm
      mode="create"
      today={TODAY}
      accounts={accounts}
      categories={categories}
      members={[]}
      initial={{
        description: "Feira",
        categoryId: CATEGORY_ID,
        accountId: ACCOUNT_ID,
        amount: "200,00",
        ...initial,
      }}
    />,
  );
}

describe("TransactionForm", () => {
  it.each(["0", "", "-5", "1,234.56"])(
    "recusa o valor %j no campo Valor e não envia",
    async (value) => {
      const user = userEvent.setup();
      renderForm({ amount: "" });
      const field = screen.getByLabelText("Valor");
      if (value) await user.type(field, value);
      await user.click(screen.getByRole("button", { name: "Salvar despesa" }));
      await waitFor(() =>
        expect(field).toHaveAttribute("aria-invalid", "true"),
      );
      expect(createTransaction).not.toHaveBeenCalled();
    },
  );

  it("troca os campos e o botão ao mudar o tipo", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.getByLabelText("Categoria")).toBeInTheDocument();
    expect(screen.getByLabelText("Conta ou cartão")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Receita" }));
    expect(
      screen.getByRole("button", { name: "Salvar receita" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Transferência" }));
    expect(
      screen.getByRole("button", { name: "Salvar transferência" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Categoria")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Conta de origem")).toBeInTheDocument();
    expect(screen.getByLabelText("Conta de destino")).toBeInTheDocument();
  });

  it("envia a despesa, mostra loading e vai para a lista", async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => {};
    createTransaction.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderForm();
    await user.click(screen.getByRole("button", { name: "Salvar despesa" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar despesa" }),
      ).toHaveAttribute("aria-busy", "true"),
    );
    expect(createTransaction).toHaveBeenCalledTimes(1);
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "expense",
        description: "Feira",
        amount: "200,00",
        accountId: ACCOUNT_ID,
        categoryId: CATEGORY_ID,
        transactionDate: TODAY,
        idempotencyKey: expect.any(String),
      }),
    );

    resolve({ ok: true, data: { id: "x" } });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/transacoes"));
  });

  it("mostra o erro de campo do servidor e mantém os dados", async () => {
    const user = userEvent.setup();
    createTransaction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Dados inválidos.",
        fieldErrors: { amount: ["Informe um valor maior que zero."] },
        requestId: "r",
      },
    });
    renderForm();
    await user.click(screen.getByRole("button", { name: "Salvar despesa" }));

    expect(
      await screen.findByText("Informe um valor maior que zero."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Valor")).toHaveValue("200,00");
    expect(screen.getByLabelText("Descrição")).toHaveValue("Feira");
  });

  it("erro de campo que a tela não exibe vira erro geral", async () => {
    const user = userEvent.setup();
    createTransaction.mockResolvedValue({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Chave inválida.",
        fieldErrors: { idempotencyKey: ["Chave inválida."] },
        requestId: "r",
      },
    });
    renderForm();
    await user.click(screen.getByRole("button", { name: "Salvar despesa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Chave inválida.",
    );
  });

  it("falha de rede mostra erro geral e mantém os valores", async () => {
    const user = userEvent.setup();
    createTransaction.mockRejectedValue(new TypeError("Failed to fetch"));
    renderForm();
    await user.click(screen.getByRole("button", { name: "Salvar despesa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível falar com o servidor",
    );
    expect(screen.getByLabelText("Descrição")).toHaveValue("Feira");
    expect(push).not.toHaveBeenCalled();
  });

  it("sessão expirada leva ao login com a rota atual", async () => {
    const user = userEvent.setup();
    createTransaction.mockResolvedValue({
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Sessão expirada.",
        requestId: "r",
      },
    });
    renderForm();
    await user.click(screen.getByRole("button", { name: "Salvar despesa" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/login?motivo=sessao_expirada&next=%2Ftransacoes%2Fnova",
      ),
    );
  });
});
