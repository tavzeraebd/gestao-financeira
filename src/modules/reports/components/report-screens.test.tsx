import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type {
  AccountReport,
  BudgetReport,
  CategoryReportRow,
  Comparison,
  GoalReport,
  MemberReport,
  ReportPeriod,
} from "@/modules/reports/types";

vi.mock("server-only", () => ({}));
// Os cartões de orçamento/meta importam botões que chamam Server Actions; aqui só se renderiza.
vi.mock("@/modules/budgets/components/budget-status-button", () => ({
  BudgetStatusButton: () => null,
}));

const replace = vi.fn();
let search = "";
let pathname = "/relatorios";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
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
  LazyDonutChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
  LazyCashFlowBarChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
  LazyHorizontalBarChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
}));

import { ReportAccounts } from "./report-accounts";
import { ReportBudgets } from "./report-budgets";
import { ReportCategoryTable } from "./report-category-table";
import { ReportCategoryTypeSwitch } from "./report-category-type-switch";
import { ReportGoals } from "./report-goals";
import { ReportMembers } from "./report-members";
import { ReportPeriodFilter } from "./report-period-filter";
import { ReportsSubNav } from "./reports-sub-nav";

const d = (s: string) => s as ISODate;
const TODAY = d("2026-10-24");

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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  search = "";
  pathname = "/relatorios";
});

const period: ReportPeriod = {
  preset: "30_dias",
  from: d("2026-09-25"),
  to: TODAY,
  previousFrom: d("2026-08-26"),
  previousTo: d("2026-09-24"),
  label: "25/09/2026 a 24/10/2026",
  previousLabel: "26/08/2026 a 24/09/2026",
  months: [d("2026-09-01"), d("2026-10-01")],
};

function comparison(current: number, previous: number): Comparison {
  return {
    current: asCents(current),
    previous: asCents(previous),
    delta: asCents(current - previous),
    percent: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}

describe("ReportPeriodFilter (CA-E7-50)", () => {
  function renderFilter(preset: ReportPeriod["preset"] = "30_dias") {
    return render(
      <ReportPeriodFilter
        preset={preset}
        from={period.from}
        to={period.to}
        today={TODAY}
      />,
    );
  }

  it("oferece os cinco períodos e marca o atual", () => {
    renderFilter();
    for (const name of [
      "7 dias",
      "30 dias",
      "3 meses",
      "12 meses",
      "Personalizado",
    ]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "30 dias" })).toBeChecked();
  });

  it("trocar o preset atualiza a URL com replace e preserva outros parâmetros", async () => {
    search = "tipo=receitas&periodo=30_dias&de=2026-01-01";
    renderFilter();
    await userEvent.setup().click(screen.getByRole("radio", { name: "3 meses" }));
    expect(replace).toHaveBeenCalledOnce();
    const url = new URL(replace.mock.calls[0]?.[0] as string, "http://x");
    expect(url.pathname).toBe("/relatorios");
    expect(url.searchParams.get("periodo")).toBe("3_meses");
    expect(url.searchParams.get("tipo")).toBe("receitas");
    expect(url.searchParams.has("de")).toBe(false);
  });

  it("personalizado mostra De/Até e só navega depois de Aplicar", async () => {
    renderFilter();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Personalizado" }));
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("De")).toBeInTheDocument();
    expect(screen.getByText("Até")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    const url = new URL(replace.mock.calls[0]?.[0] as string, "http://x");
    expect(url.searchParams.get("periodo")).toBe("personalizado");
    expect(url.searchParams.get("de")).toBe("2026-09-25");
    expect(url.searchParams.get("ate")).toBe("2026-10-24");
  });

  it("intervalo inválido mostra o erro e não navega", async () => {
    render(
      <ReportPeriodFilter
        preset="personalizado"
        from={d("2026-10-24")}
        to={d("2026-10-01")}
        today={TODAY}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A data De não pode ser depois da data Até.",
    );
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("ReportsSubNav", () => {
  it("lista as seis seções e leva o período nos links, sem o tipo", () => {
    search = "periodo=7_dias&tipo=receitas";
    pathname = "/relatorios/categorias";
    render(<ReportsSubNav />);
    const nav = screen.getByRole("navigation", { name: "Seções dos relatórios" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Visão geral",
      "Categorias",
      "Contas",
      "Integrantes",
      "Orçamentos",
      "Metas",
    ]);
    expect(screen.getByRole("link", { name: "Contas" })).toHaveAttribute(
      "href",
      "/relatorios/contas?periodo=7_dias",
    );
    expect(screen.getByRole("link", { name: "Categorias" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Visão geral" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("visão geral fica ativa só em /relatorios", () => {
    render(<ReportsSubNav />);
    expect(screen.getByRole("link", { name: "Visão geral" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Metas" })).toHaveAttribute(
      "href",
      "/relatorios/metas",
    );
  });
});

describe("ReportCategoryTypeSwitch", () => {
  it("troca o tipo na URL e mantém o período", async () => {
    search = "periodo=12_meses";
    render(<ReportCategoryTypeSwitch value="despesas" />);
    await userEvent.setup().click(screen.getByRole("radio", { name: "Receitas" }));
    const url = new URL(replace.mock.calls[0]?.[0] as string, "http://x");
    expect(url.searchParams.get("tipo")).toBe("receitas");
    expect(url.searchParams.get("periodo")).toBe("12_meses");
  });
});

describe("ReportCategoryTable", () => {
  const rows: CategoryReportRow[] = [
    {
      categoryId: "c1",
      name: "Mercado",
      color: "chart-1",
      icon: "utensils",
      archived: false,
      current: asCents(15000),
      previous: asCents(10000),
      comparison: comparison(15000, 10000),
    },
    {
      categoryId: "c2",
      name: "Lazer",
      color: "chart-2",
      icon: null,
      archived: true,
      current: asCents(5000),
      previous: asCents(0),
      comparison: comparison(5000, 0),
    },
  ];

  it("mostra período, anterior e variação com sinal em texto", () => {
    render(
      <ReportCategoryTable
        rows={rows}
        periodLabel={period.label}
        previousLabel={period.previousLabel}
        type="expense"
      />,
    );
    expect(
      screen.getByRole("columnheader", { name: period.label }),
    ).toBeInTheDocument();
    const [mercado, lazer] = screen.getAllByTestId("linha-categoria");
    expect(mercado).toHaveTextContent("Mercado");
    expect(mercado).toHaveTextContent("+50,0%");
    expect(lazer).toHaveTextContent("Arquivada");
    expect(lazer).toHaveTextContent("Sem base de comparação");
    expect(document.body).not.toHaveTextContent(/NaN|Infinity/);
  });
});

describe("ReportAccounts (CA-E7-52)", () => {
  const report: AccountReport = {
    period,
    accounts: [
      {
        id: "a1",
        name: "Corrente",
        type: "checking",
        archived: false,
        opening: asCents(100000),
        inflow: asCents(50000),
        outflow: asCents(30000),
        net: asCents(20000),
        closing: asCents(120000),
      },
      {
        id: "a2",
        name: "Poupança",
        type: "savings",
        archived: false,
        opening: asCents(0),
        inflow: asCents(10000),
        outflow: asCents(0),
        net: asCents(10000),
        closing: asCents(10000),
      },
    ],
    assetNet: asCents(30000),
    consolidated: comparison(130000, 100000),
  };

  it("tabela, nota sobre transferências e variação do saldo total", () => {
    render(<ReportAccounts report={report} canManageAccounts />);
    expect(screen.getAllByTestId("linha-conta")).toHaveLength(2);
    expect(screen.getByTestId("nota-transferencias")).toHaveTextContent(
      "Transferências entre contas aparecem aqui. No saldo total elas se anulam.",
    );
    expect(screen.getByTestId("variacao-saldo-total")).toHaveTextContent(
      "Variação do saldo total",
    );
    expect(screen.getByTestId("variacao-saldo-total")).toHaveTextContent(
      /300,00/,
    );
    expect(
      screen.getByRole("img", { name: /Líquido por conta em .*Corrente/ }),
    ).toBeInTheDocument();
  });

  it("sem contas: estado vazio com atalho para quem administra", () => {
    render(
      <ReportAccounts
        report={{ ...report, accounts: [] }}
        canManageAccounts
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Nenhuma conta com movimento" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nova conta" })).toHaveAttribute(
      "href",
      "/contas/nova",
    );
  });

  it("sem contas e sem permissão: orientação sem botão", () => {
    render(
      <ReportAccounts
        report={{ ...report, accounts: [] }}
        canManageAccounts={false}
      />,
    );
    expect(screen.queryByRole("link", { name: "Nova conta" })).toBeNull();
  });
});

describe("ReportMembers (CA-E7-52)", () => {
  const report: MemberReport = {
    period,
    total: asCents(30000),
    rows: [
      {
        member: { id: "m1", displayName: "Ana Souza" },
        amount: asCents(20000),
        percent: 66.7,
      },
      { member: null, amount: asCents(10000), percent: 33.3 },
    ],
  };

  it("mostra a linha Família (sem responsável), o Total e a nota", () => {
    render(<ReportMembers report={report} />);
    const rows = screen.getAllByTestId("linha-integrante");
    expect(rows[0]).toHaveTextContent("Ana Souza");
    expect(rows[1]).toHaveTextContent("Família (sem responsável)");
    expect(screen.getByTestId("total-integrantes")).toHaveTextContent(/300,00/);
    expect(screen.getByTestId("nota-integrantes")).toHaveTextContent(
      "Despesas divididas entram pela parte de cada um; sem divisão, pelo responsável; sem responsável, em Família.",
    );
  });

  it("sem despesas: estado vazio e sem tabela", () => {
    render(<ReportMembers report={{ ...report, total: asCents(0), rows: [] }} />);
    expect(
      screen.getByRole("heading", { name: `Sem despesas em ${period.label}` }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("total-integrantes")).toBeNull();
  });
});

describe("ReportBudgets (CA-E7-53)", () => {
  const report: BudgetReport = {
    period,
    months: [
      {
        month: d("2026-09-01"),
        label: "setembro de 2026",
        rows: [],
      },
      {
        month: d("2026-10-01"),
        label: "outubro de 2026",
        rows: [
          {
            budgetId: "b1",
            category: {
              id: "c1",
              name: "Mercado",
              color: "chart-1",
              icon: "utensils",
              archived: false,
            },
            limit: asCents(100000),
            spent: asCents(112000),
            percent: 112,
            status: "exceeded",
          },
        ],
      },
    ],
  };

  it("estado em Badge com ícone e texto, ProgressMeter e mês mais recente primeiro", () => {
    render(<ReportBudgets report={report} canManage />);
    const months = screen.getAllByTestId("mes-orcamentos");
    expect(months[0]).toHaveTextContent("outubro de 2026");
    expect(months[1]).toHaveTextContent("Nenhum orçamento vigente neste mês.");
    const row = screen.getByTestId("linha-orcamento");
    expect(row).toHaveTextContent("Limite estourado");
    expect(row).toHaveTextContent("112%");
    expect(
      within(row).getByRole("progressbar", { name: "Uso do orçamento Mercado" }),
    ).toHaveAttribute("aria-valuetext", "112% do limite");
  });

  it("vazio: Criar orçamento só para owner/admin", () => {
    const empty = { ...report, months: [] };
    const { unmount } = render(<ReportBudgets report={empty} canManage />);
    expect(screen.getByRole("link", { name: "Criar orçamento" })).toHaveAttribute(
      "href",
      "/orcamentos/novo",
    );
    unmount();
    render(<ReportBudgets report={empty} canManage={false} />);
    expect(screen.queryByRole("link", { name: "Criar orçamento" })).toBeNull();
    expect(screen.getByText(/Peça a quem administra/)).toBeInTheDocument();
  });
});

describe("ReportGoals (CA-E7-53)", () => {
  const report: GoalReport = {
    period,
    goals: [
      {
        id: "g1",
        name: "Viagem",
        icon: "plane",
        status: "active",
        target: asCents(1000000),
        saved: asCents(250000),
        deposits: asCents(50000),
        withdrawals: asCents(10000),
        percent: 25,
      },
    ],
  };

  it("progresso, estado e aportes/retiradas do período", () => {
    render(<ReportGoals report={report} canManage />);
    const goal = screen.getByTestId("meta-relatorio");
    expect(goal).toHaveTextContent("Viagem");
    expect(goal).toHaveTextContent("Ativa");
    expect(goal).toHaveTextContent("Aportes no período");
    expect(goal).toHaveTextContent("Retiradas no período");
    expect(
      within(goal).getByRole("progressbar", { name: "Progresso da meta Viagem" }),
    ).toHaveAttribute("aria-valuetext", "25% da meta");
    expect(screen.getByRole("link", { name: "Viagem" })).toHaveAttribute(
      "href",
      "/metas/g1",
    );
  });

  it("vazio: Criar meta só para owner/admin", () => {
    const { unmount } = render(
      <ReportGoals report={{ ...report, goals: [] }} canManage />,
    );
    expect(screen.getByRole("link", { name: "Criar meta" })).toHaveAttribute(
      "href",
      "/metas/nova",
    );
    unmount();
    render(<ReportGoals report={{ ...report, goals: [] }} canManage={false} />);
    expect(screen.queryByRole("link", { name: "Criar meta" })).toBeNull();
  });
});
