import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import type { CategoryOption } from "@/modules/categories/types";

const createBudget = vi.fn();
const updateBudget = vi.fn();
const push = vi.fn();

vi.mock("@/modules/budgets/actions", () => ({
  createBudget: (...args: unknown[]) => createBudget(...args),
  updateBudget: (...args: unknown[]) => updateBudget(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/orcamentos/novo",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BudgetForm } from "./budget-form";

const TODAY = "2026-10-23" as ISODate;
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";

const categories: CategoryOption[] = [
  {
    id: CATEGORY_ID,
    name: "Alimentação",
    parentId: null,
    color: "chart-3",
    icon: "utensils",
  },
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

describe("BudgetForm", () => {
  it("recusa limite vazio e não envia", async () => {
    const user = userEvent.setup();
    render(<BudgetForm mode="create" today={TODAY} categories={categories} />);
    const field = screen.getByLabelText("Limite mensal");
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
    expect(createBudget).not.toHaveBeenCalled();
  });

  it("cria o orçamento de todas as despesas, com loading, e volta à lista", async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => {};
    createBudget.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(
      <BudgetForm
        mode="create"
        today={TODAY}
        categories={categories}
        initial={{ amountLimit: "500,00" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Criar orçamento" }),
      ).toHaveAttribute("aria-busy", "true"),
    );
    expect(createBudget).toHaveBeenCalledTimes(1);
    expect(createBudget).toHaveBeenCalledWith({
      categoryId: null,
      amountLimit: "500,00",
      startMonth: "2026-10",
      endMonth: undefined,
    });
    resolve({ ok: true, data: { id: "x" } });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orcamentos"));
  });

  it("mostra BUDGET_ALREADY_EXISTS no campo categoria e mantém os dados", async () => {
    const user = userEvent.setup();
    createBudget.mockResolvedValue({
      ok: false,
      error: {
        code: "BUDGET_ALREADY_EXISTS",
        message:
          "Já existe um orçamento ativo para esta categoria. Edite o existente.",
        fieldErrors: {
          categoryId: [
            "Já existe um orçamento ativo para esta categoria. Edite o existente.",
          ],
        },
        requestId: "r",
      },
    });
    render(
      <BudgetForm
        mode="create"
        today={TODAY}
        categories={categories}
        initial={{ categoryId: CATEGORY_ID, amountLimit: "500,00" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));
    expect(
      await screen.findByText(/Já existe um orçamento ativo/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Limite mensal")).toHaveValue("500,00");
    expect(push).not.toHaveBeenCalled();
  });

  it("falha de rede mostra erro geral e mantém o valor", async () => {
    const user = userEvent.setup();
    createBudget.mockRejectedValue(new TypeError("Failed to fetch"));
    render(
      <BudgetForm
        mode="create"
        today={TODAY}
        categories={categories}
        initial={{ amountLimit: "500,00" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Criar orçamento" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Não foi possível/,
    );
    expect(screen.getByLabelText("Limite mensal")).toHaveValue("500,00");
  });

  it("na edição trava categoria e início e envia só limite e término", async () => {
    const user = userEvent.setup();
    updateBudget.mockResolvedValue({ ok: true, data: null });
    render(
      <BudgetForm
        mode="edit"
        budgetId="44444444-4444-4444-8444-444444444444"
        today={TODAY}
        categories={categories}
        initial={{
          categoryId: CATEGORY_ID,
          amountLimit: "500,00",
          startMonth: "2026-08",
        }}
      />,
    );
    expect(screen.getByLabelText("Categoria")).toBeDisabled();
    expect(screen.getByLabelText("A partir de")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await waitFor(() =>
      expect(updateBudget).toHaveBeenCalledWith({
        budgetId: "44444444-4444-4444-8444-444444444444",
        amountLimit: "500,00",
        endMonth: null,
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orcamentos"));
  });
});
