import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import HorizontalBarChart from "@/components/charts/horizontal-bar-chart";
import { asCents } from "@/lib/money";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
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
});

afterEach(cleanup);

describe("HorizontalBarChart", () => {
  it("expõe role=img com o aria-label recebido e escala a altura pelas linhas", () => {
    render(
      <HorizontalBarChart
        ariaLabel="Líquido por conta. Corrente: R$ 200,00."
        data={[
          {
            key: "a",
            label: "Corrente",
            value: asCents(20000),
            color: "chart-income",
          },
          {
            key: "b",
            label: "Cartão",
            value: asCents(-5000),
            color: "chart-expense",
          },
        ]}
      />,
    );
    const chart = screen.getByRole("img", {
      name: "Líquido por conta. Corrente: R$ 200,00.",
    });
    expect(chart).toHaveStyle({ height: "120px" });
  });
});
