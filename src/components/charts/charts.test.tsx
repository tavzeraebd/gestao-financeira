import { cleanup, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ChartCard } from "@/components/charts/chart-card";
import { ChartLegend } from "@/components/charts/chart-legend";
import CashFlowBarChart from "@/components/charts/cash-flow-bar-chart";
import { chartColorVar } from "@/components/charts/colors";
import DonutChart from "@/components/charts/donut-chart";
import { useReducedMotion } from "@/components/charts/use-reduced-motion";
import { asCents, formatBRL } from "@/lib/money";

let reduceMotion = false;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia = ((query: string) => ({
    matches: reduceMotion && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  reduceMotion = false;
});

const donutData = [
  {
    key: "a",
    label: "Mercado",
    value: asCents(123456),
    color: "chart-1" as const,
  },
  {
    key: "b",
    label: "<b>Casa</b>",
    value: asCents(50000),
    color: "chart-2" as const,
  },
];

const cashData = [
  {
    key: "2026-09",
    label: "set",
    income: asCents(500000),
    expense: asCents(320000),
  },
  {
    key: "2026-10",
    label: "out",
    income: asCents(450000),
    expense: asCents(410000),
  },
];

const table = {
  caption: "Despesas por categoria",
  columns: [
    { id: "cat", header: "Categoria" },
    { id: "val", header: "Valor", align: "end" as const },
  ],
  rows: [
    { key: "a", cells: ["Mercado", formatBRL(asCents(123456))] },
    { key: "b", cells: ["<b>Casa</b>", formatBRL(asCents(50000))] },
  ],
};

function renderCard(isEmpty = false) {
  return render(
    <ChartCard
      title="Despesas por categoria"
      period="1 a 31 de outubro de 2026"
      isEmpty={isEmpty}
      empty={{ title: "Sem despesas no período" }}
      table={table}
      legend={
        <ChartLegend
          items={[
            {
              key: "a",
              label: "Mercado",
              color: "chart-1",
              value: "R$ 1.234,56",
            },
          ]}
        />
      }
    >
      <div>grafico</div>
    </ChartCard>,
  );
}

describe("chartColorVar", () => {
  it("converte o token em variável CSS", () => {
    expect(chartColorVar("chart-3")).toBe("var(--chart-3)");
    expect(chartColorVar("chart-income")).toBe("var(--chart-income)");
  });
});

describe("ChartLegend", () => {
  it("mostra nome e valor em texto", () => {
    render(
      <ChartLegend
        items={[
          { key: "a", label: "Mercado", color: "chart-1", value: "R$ 10,00" },
        ]}
      />,
    );
    expect(
      screen.getByRole("list", { name: "Legenda do gráfico" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.getByText("R$ 10,00")).toBeInTheDocument();
  });
});

describe("ChartCard", () => {
  it("mostra título, período e legenda", () => {
    renderCard();
    expect(
      screen.getByRole("heading", { level: 2, name: "Despesas por categoria" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 a 31 de outubro de 2026")).toBeInTheDocument();
    expect(screen.getByText("grafico")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.234,56")).toBeInTheDocument();
  });

  it("alterna gráfico e tabela por teclado, com aria-expanded", async () => {
    const user = userEvent.setup();
    renderCard();
    const button = screen.getByRole("button", { name: "Ver tabela" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls");

    button.focus();
    await user.keyboard("{Enter}");
    const back = screen.getByRole("button", { name: "Ver gráfico" });
    expect(back).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("grafico")).not.toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Despesas por categoria" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("R$ 1.234,56", { selector: "td" }),
    ).toBeInTheDocument();
    // nome com HTML aparece como texto
    expect(screen.getByText("<b>Casa</b>")).toBeInTheDocument();

    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "Ver tabela" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByText("grafico")).toBeInTheDocument();
  });

  it("vazio: mostra o estado vazio e não oferece tabela", () => {
    renderCard(true);
    expect(screen.getByText("Sem despesas no período")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ver tabela/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("grafico")).not.toBeInTheDocument();
  });
});

describe("DonutChart", () => {
  it("monta com dados e expõe role=img com aria-label", () => {
    render(
      <DonutChart
        data={donutData}
        centerLabel="Total"
        centerValue="R$ 1.734,56"
        ariaLabel="Despesas por categoria: Mercado R$ 1.234,56"
      />,
    );
    expect(
      screen.getByRole("img", { name: /Despesas por categoria/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("R$ 1.734,56")).toBeInTheDocument();
  });

  it("monta com lista vazia", () => {
    render(
      <DonutChart
        data={[]}
        centerLabel="Total"
        centerValue="R$ 0,00"
        ariaLabel="Sem dados"
      />,
    );
    expect(screen.getByRole("img", { name: "Sem dados" })).toBeInTheDocument();
  });

  it("respeita prefers-reduced-motion (CA-E4-74)", () => {
    reduceMotion = true;
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
    reduceMotion = false;
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
    reduceMotion = true;
    const spy = vi.spyOn(console, "error");
    render(
      <DonutChart
        data={donutData}
        centerLabel="Total"
        centerValue="R$ 1,00"
        ariaLabel="x"
      />,
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("CashFlowBarChart", () => {
  it("monta com dados, role=img e legenda em texto", () => {
    render(
      <CashFlowBarChart
        data={cashData}
        ariaLabel="Receitas e despesas por mês"
      />,
    );
    expect(
      screen.getByRole("img", { name: "Receitas e despesas por mês" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Receitas")).toBeInTheDocument();
    expect(screen.getByText("Despesas")).toBeInTheDocument();
  });

  it("monta com lista vazia", () => {
    render(<CashFlowBarChart data={[]} ariaLabel="Sem dados" />);
    expect(screen.getByRole("img", { name: "Sem dados" })).toBeInTheDocument();
  });

  it("monta com prefers-reduced-motion", () => {
    reduceMotion = true;
    const spy = vi.spyOn(console, "error");
    render(<CashFlowBarChart data={cashData} ariaLabel="x" />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
