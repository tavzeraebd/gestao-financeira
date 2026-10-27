import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type {
  CategoryBreakdown,
  CategorySlice,
  Comparison,
  Dashboard,
} from "@/modules/reports/types";
import type { BillListItem } from "@/modules/bills/types";
import type { TransactionListItem } from "@/modules/transactions/types";

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
  LazyDonutChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
  LazyCashFlowBarChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
}));

import { BalanceCard } from "./balance-card";
import { CashFlowCard } from "./cash-flow-card";
import { ComparisonText } from "./comparison-text";
import { DashboardPeriodFilter } from "./dashboard-period-filter";
import { ExpenseByCategoryCard } from "./expense-by-category-card";
import { GoalsCard } from "./goals-card";
import { IndicatorInfo } from "./indicator-info";
import { RecentTransactionsCard } from "./recent-transactions-card";
import { SummaryIndicators } from "./summary-indicators";
import { UpcomingBillsCard } from "./upcoming-bills-card";

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
  it("saldo total com faturas em aberto só quando há cartão", () => {
    const base = {
      consolidated: comparison(130000, 100000, 30),
      previousAsOf: d("2026-09-30"),
      openCardDebt: asCents(25000),
    };
    const { rerender } = render(<BalanceCard {...base} hasCreditCards />);
    const card = screen.getByTestId("indicador-saldo-total");
    expect(card).toHaveTextContent(/R\$\s1\.300,00/);
    expect(card).toHaveTextContent("+30,0% em relação a 30/09/2026");
    expect(card).toHaveTextContent(/Faturas em aberto/);
    expect(card).toHaveTextContent(/R\$\s250,00/);
    rerender(<BalanceCard {...base} hasCreditCards={false} />);
    expect(screen.queryByText(/Faturas em aberto/)).not.toBeInTheDocument();
  });

  it("receitas, despesas e resultado com valores e variação indefinida", () => {
    render(
      <SummaryIndicators
        income={comparison(50000, 0, null)}
        expense={comparison(20000, 10000, 100)}
        result={comparison(30000, -10000, 300)}
        previousLabel="setembro de 2026"
      />,
    );
    expect(screen.getByTestId("indicador-receitas")).toHaveTextContent(
      /R\$\s500,00/,
    );
    expect(screen.getByTestId("indicador-receitas")).toHaveTextContent(
      "Sem base de comparação",
    );
    expect(screen.getByTestId("indicador-despesas")).toHaveTextContent(
      /R\$\s200,00/,
    );
    expect(screen.getByTestId("indicador-despesas")).toHaveTextContent(
      "+100,0% em relação a setembro de 2026",
    );
    expect(screen.getByTestId("indicador-resultado")).toHaveTextContent(
      /R\$\s300,00/,
    );
  });

  it("'Como calculamos' abre a definição (CA-E4-60)", async () => {
    const user = userEvent.setup();
    render(<IndicatorInfo id="consolidatedBalance" />);
    await user.click(
      screen.getByRole("button", { name: "Como calculamos Saldo total" }),
    );
    expect(
      await screen.findByText(/Soma dos saldos das contas, sem cartões/),
    ).toBeInTheDocument();
  });
});

function slice(
  key: string,
  name: string,
  amount: number,
  percent: number,
): CategorySlice {
  return {
    key,
    categoryId: key,
    name,
    color: "chart-3",
    icon: "utensils",
    amount: asCents(amount),
    percent,
    archived: false,
  };
}

describe("ExpenseByCategoryCard", () => {
  it("estado vazio explica e oferece a ação", () => {
    const breakdown: CategoryBreakdown = {
      total: asCents(0),
      slices: [],
      negative: [],
      rows: [],
    };
    render(
      <ExpenseByCategoryCard
        breakdown={breakdown}
        periodLabel="outubro de 2026"
      />,
    );
    expect(
      screen.getByText("Sem despesas em outubro de 2026"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Nova transação" }),
    ).toHaveAttribute("href", "/transacoes/nova");
    expect(
      screen.queryByRole("button", { name: "Ver tabela" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("com dados: legenda em texto, aria-label com BRL e tabela", async () => {
    const user = userEvent.setup();
    const alimentacao = slice("a", "Alimentação", 20000, 100);
    render(
      <ExpenseByCategoryCard
        breakdown={{
          total: asCents(20000),
          slices: [alimentacao],
          negative: [],
          rows: [alimentacao],
        }}
        periodLabel="outubro de 2026"
      />,
    );
    const legend = screen.getByRole("list", {
      name: "Legenda: categorias de gastos",
    });
    expect(legend).toHaveTextContent("Alimentação");
    expect(legend).toHaveTextContent("100,0%");
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /Despesas por categoria em outubro de 2026\. Total R\$\s200,00\. Alimentação R\$\s200,00, 100,0%/,
    );
    const toggle = screen.getByRole("button", { name: "Ver tabela" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    const table = screen.getByRole("table", {
      name: "Despesas por categoria em outubro de 2026",
    });
    expect(within(table).getByText("Alimentação")).toBeInTheDocument();
    expect(table).toHaveTextContent(/R\$\s200,00/);
  });

  it("estornos maiores que o gasto entram na tabela com nota", async () => {
    const user = userEvent.setup();
    const ok = slice("a", "Alimentação", 20000, 100);
    const neg = { ...slice("b", "Lazer", -5000, 0) };
    render(
      <ExpenseByCategoryCard
        breakdown={{
          total: asCents(15000),
          slices: [ok],
          negative: [neg],
          rows: [ok, neg],
        }}
        periodLabel="outubro de 2026"
      />,
    );
    expect(
      screen.getByText(/Estornos maiores que os gastos no período/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver tabela" }));
    expect(screen.getByText("Lazer (estorno)")).toBeInTheDocument();
  });
});

describe("CashFlowCard", () => {
  const month = (m: string, income: number, expense: number) => ({
    month: d(`${m}-01`),
    label: "mês",
    longLabel: `mês ${m}`,
    income: asCents(income),
    expense: asCents(expense),
    result: asCents(income - expense),
  });

  it("todos os meses zerados: estado vazio, sem gráfico", () => {
    render(
      <CashFlowCard
        cashFlow={{
          from: d("2026-05-01"),
          to: d("2026-10-31"),
          months: [month("2026-05", 0, 0), month("2026-10", 0, 0)],
        }}
      />,
    );
    expect(
      screen.getByText("Sem movimentações nos últimos 6 meses"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("com dados: tabela com receitas e despesas do mês", async () => {
    const user = userEvent.setup();
    render(
      <CashFlowCard
        cashFlow={{
          from: d("2026-05-01"),
          to: d("2026-10-31"),
          months: [month("2026-05", 0, 0), month("2026-10", 50000, 20000)],
        }}
      />,
    );
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /receitas R\$\s500,00, despesas R\$\s200,00/,
    );
    await user.click(screen.getByRole("button", { name: "Ver tabela" }));
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent(/R\$\s500,00/);
    expect(table).toHaveTextContent(/R\$\s200,00/);
    expect(table).toHaveTextContent(/R\$\s300,00/);
  });
});

describe("RecentTransactionsCard (CA-E4-59)", () => {
  const item = (id: string): TransactionListItem => ({
    id,
    type: "expense",
    description: `Compra ${id}`,
    amount: asCents(1000),
    direction: "out",
    transactionDate: d("2026-10-10"),
    status: "paid",
    account: { id: "c", name: "Corrente" },
    destinationAccount: null,
    category: null,
    assignedMember: null,
    reversalOfId: null,
    recurrenceId: null,
    canManage: true,
  });

  it("lista com links ao detalhe e 'Ver todas' com o período", () => {
    render(
      <RecentTransactionsCard
        items={[item("1"), item("2")]}
        from={d("2026-10-01")}
        to={d("2026-10-31")}
        periodLabel="outubro de 2026"
      />,
    );
    expect(screen.getByRole("link", { name: /Compra 1/ })).toHaveAttribute(
      "href",
      "/transacoes/1",
    );
    expect(screen.getByRole("link", { name: "Ver todas" })).toHaveAttribute(
      "href",
      "/transacoes?de=2026-10-01&ate=2026-10-31",
    );
  });

  it("vazio: explica e oferece Nova transação", () => {
    render(
      <RecentTransactionsCard
        items={[]}
        from={d("2026-10-01")}
        to={d("2026-10-31")}
        periodLabel="outubro de 2026"
      />,
    );
    expect(
      screen.getByText("Nenhum lançamento em outubro de 2026"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nova transação" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Ver todas" }),
    ).not.toBeInTheDocument();
  });
});

describe("Próximos vencimentos e Metas (CA-E5-58)", () => {
  const bill = {
    id: "b1",
    kind: "pagar",
    description: "Aluguel",
    amount: asCents(150000),
    dueDate: d("2026-10-28"),
    paidOn: null,
    status: "pending",
    days: 4,
    account: { id: "a1", name: "Corrente" },
    category: { id: "c1", name: "Moradia", color: "chart-3", icon: "house" },
    assignedMember: null,
    recurrence: null,
    canPay: true,
    canEdit: true,
    canCancel: true,
  } as unknown as BillListItem;

  it("sem vencimentos: estado vazio com a ação Novo compromisso", () => {
    render(<UpcomingBillsCard items={[]} />);
    expect(
      screen.getByText("Nenhum vencimento nos próximos 30 dias"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Novo compromisso" }),
    ).toHaveAttribute("href", "/compromissos/novo");
    expect(
      screen.queryByRole("link", { name: "Ver todos" }),
    ).not.toBeInTheDocument();
  });

  it("lista no máximo 5, com link ao item, status em texto e Ver todos", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      ...bill,
      id: `b${i}`,
      description: `Conta ${i}`,
    }));
    render(<UpcomingBillsCard items={items} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("link", { name: /Conta 0/ })).toHaveAttribute(
      "href",
      "/compromissos/b0",
    );
    expect(screen.getAllByText("Pendente")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "Ver todos" })).toHaveAttribute(
      "href",
      "/compromissos",
    );
  });

  it("Metas vazio: orienta e oferece Criar meta só a quem administra", () => {
    const { rerender } = render(<GoalsCard goals={[]} canManage />);
    expect(screen.getByText("Nenhuma meta ativa")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Criar meta" })).toHaveAttribute(
      "href",
      "/metas/nova",
    );
    rerender(<GoalsCard goals={[]} canManage={false} />);
    expect(
      screen.queryByRole("link", { name: "Criar meta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Peça a um administrador para criar a primeira meta/),
    ).toBeInTheDocument();
  });

  it("Metas com dados: nome, percentual, barra e Ver todas", () => {
    render(
      <GoalsCard
        canManage={false}
        goals={[
          {
            id: "g1",
            name: "Viagem",
            icon: "plane",
            saved: asCents(240000),
            target: asCents(500000),
            percent: 48,
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Viagem" })).toHaveAttribute(
      "href",
      "/metas/g1",
    );
    expect(screen.getByText("48%")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Progresso da meta Viagem" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todas" })).toHaveAttribute(
      "href",
      "/metas",
    );
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
