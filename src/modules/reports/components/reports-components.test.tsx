import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { Comparison, Dashboard } from "@/modules/reports/types";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
  usePathname: () => "/inicio",
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/charts/lazy", () => ({
  LazyCashFlowBarChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
}));

import { ComparisonText } from "./comparison-text";
import { DashboardPeriodFilter } from "./dashboard-period-filter";
import { IndicatorInfo } from "./indicator-info";

const TODAY = "2026-10-24" as ISODate;
const d = (s: string) => s as ISODate;

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
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function comparison(
  current: number,
  previous: number,
  percent: number | null,
): Comparison {
  return {
    current: asCents(current),
    previous: asCents(previous),
    delta: asCents(current - previous),
    percent,
  };
}

describe("ComparisonText (CA-E4-53)", () => {
  it("mostra o sinal em texto", () => {
    render(
      <ComparisonText
        comparison={comparison(130000, 100000, 30)}
        against="30/09/2026"
      />,
    );
    expect(
      screen.getByText("+30,0% em relação a 30/09/2026"),
    ).toBeInTheDocument();
  });

  it("variação negativa vem com sinal em texto", () => {
    render(
      <ComparisonText
        comparison={comparison(50000, 100000, -50)}
        against="setembro de 2026"
      />,
    );
    expect(screen.getByTestId("variacao").textContent).toMatch(
      /^[-−]50,0% em relação a setembro de 2026$/,
    );
  });

  it("período anterior zerado: sem base de comparação, sem NaN", () => {
    const { container } = render(
      <ComparisonText comparison={comparison(50000, 0, null)} against="x" />,
    );
    expect(screen.getByText("Sem base de comparação")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|Infinity|∞/);
  });
});

describe("indicadores", () => {
  it("'Como calculamos' abre a definição (CA-E4-60)", async () => {
    const user = userEvent.setup();
    render(<IndicatorInfo id="consolidatedBalance" />);
    await user.click(
      screen.getByRole("button", { name: "Como calculamos Saldo atual" }),
    );
    expect(
      await screen.findByText(/Soma dos saldos das contas, sem cartões/),
    ).toBeInTheDocument();
  });
});

describe("DashboardPeriodFilter (CA-E4-52)", () => {
  function renderFilter(preset: Dashboard["period"]["preset"] = "mes_atual") {
    return render(
      <DashboardPeriodFilter
        preset={preset}
        from={d("2026-10-01")}
        to={d("2026-10-15")}
        today={TODAY}
      />,
    );
  }

  it("Mês anterior navega com ?periodo=mes_anterior; Este mês limpa a URL", async () => {
    const user = userEvent.setup();
    renderFilter();
    await user.click(screen.getByRole("radio", { name: "Mês anterior" }));
    expect(replace).toHaveBeenLastCalledWith("/inicio?periodo=mes_anterior");
    await user.click(screen.getByRole("radio", { name: "Este mês" }));
    expect(replace).toHaveBeenLastCalledWith("/inicio");
  });

  it("Personalizado só mostra os campos e não navega até Aplicar", async () => {
    const user = userEvent.setup();
    renderFilter();
    await user.click(screen.getByRole("radio", { name: "Personalizado" }));
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("De")).toBeInTheDocument();
    expect(screen.getByLabelText("Até")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeVisible();
  });

  it("intervalo invertido não navega e mostra o erro; corrigido, aplica", async () => {
    const user = userEvent.setup();
    renderFilter("personalizado");
    await user.click(screen.getByRole("button", { name: "De" }));
    await user.click(
      await screen.findByRole("button", { name: /20 de outubro de 2026/ }),
    );
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A data De não pode ser depois da data Até.",
    );
    expect(replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Até" }));
    await user.click(
      await screen.findByRole("button", { name: /25 de outubro de 2026/ }),
    );
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(replace).toHaveBeenCalledWith(
      "/inicio?periodo=personalizado&de=2026-10-20&ate=2026-10-25",
    );
  });
});
