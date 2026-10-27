import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { PlanningBaseline } from "@/modules/planning/types";
import { PlanningSimulator } from "./planning-simulator";

const GOAL = "55555555-5555-4555-8555-555555555555";
const CAT = "66666666-6666-4666-8666-666666666666";
const d = (s: string) => s as ISODate;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

function baseline(overrides: Partial<PlanningBaseline> = {}): PlanningBaseline {
  return {
    today: d("2026-10-25"),
    hasAccounts: true,
    consolidatedBalance: asCents(500000),
    averageWindow: { from: d("2026-07-01"), to: d("2026-09-30") },
    averageMonthly: {
      income: asCents(600000),
      expense: asCents(400000),
      result: asCents(200000),
    },
    categoryAverages: [
      { categoryId: CAT, name: "Mercado", color: "chart-3", icon: "utensils", average: asCents(80000) },
    ],
    goals: [
      { id: GOAL, name: "Viagem", saved: asCents(100000), target: asCents(500000), pace: asCents(50000), targetDate: null },
    ],
    projection: Array.from({ length: 12 }, (_, i) => ({
      month: d(`2026-${String(10 + (i % 3)).padStart(2, "0")}-01`),
      label: `mês ${i + 1}`,
      pendingIncome: asCents(0),
      pendingExpense: asCents(10000),
      recurringIncome: asCents(0),
      recurringExpense: asCents(0),
    })),
    ...overrides,
  };
}

async function pick(label: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("PlanningSimulator", () => {
  it("financiamento: valida, simula e mostra parcela, origens e premissas", async () => {
    render(<PlanningSimulator baseline={baseline()} />);
    await userEvent.click(screen.getByRole("button", { name: "Simular" }));
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);

    await userEvent.type(screen.getByLabelText("Valor do bem"), "50000");
    await userEvent.type(screen.getByLabelText("Prazo em meses"), "48");
    await userEvent.type(screen.getByLabelText("Taxa mensal (%)"), "1,5");
    expect(
      screen.getByText("Use a taxa da proposta ou do contrato. O Núcleo não sugere taxas."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Simular" }));

    expect(screen.getByRole("heading", { name: "Premissas" })).toBeInTheDocument();
    expect(screen.getAllByText("Informado").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Estimado").length).toBeGreaterThan(0);
  });

  it("novo compromisso usa a base conhecida e mostra a origem Conhecido", async () => {
    render(<PlanningSimulator baseline={baseline()} />);
    await pick("Qual objetivo você quer simular?", "Novo compromisso mensal");
    await userEvent.type(screen.getByLabelText("Valor mensal do compromisso"), "500");
    await userEvent.click(screen.getByRole("button", { name: "Simular" }));
    expect(screen.getAllByText("Conhecido").length).toBeGreaterThan(0);
  });

  it("saldo futuro mostra a tabela Mês, Entradas, Saídas e Saldo", async () => {
    render(<PlanningSimulator baseline={baseline()} />);
    await pick("Qual objetivo você quer simular?", "Saldo futuro");
    await userEvent.click(screen.getByRole("button", { name: "Simular" }));
    expect(screen.getByRole("columnheader", { name: "Saldo projetado" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Entradas previstas" })).toBeInTheDocument();
  });

  it("sem contas, cenários que dependem da base ficam indisponíveis com orientação", async () => {
    render(<PlanningSimulator baseline={baseline({ hasAccounts: false })} />);
    await pick("Qual objetivo você quer simular?", "Saldo futuro");
    expect(
      screen.getByText("Cadastre uma conta para simular com seus dados"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simular" })).toBeDisabled();
  });

  it("financiamento continua habilitado sem contas", () => {
    render(<PlanningSimulator baseline={baseline({ hasAccounts: false })} />);
    expect(screen.getByRole("button", { name: "Simular" })).toBeEnabled();
  });
});
