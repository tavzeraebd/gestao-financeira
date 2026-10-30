import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import { buildProjectedBalance } from "@/modules/reports/domain/projected-balance";
import type {
  BalanceSnapshot,
  CommitmentMonth,
  CommitmentOverview,
} from "@/modules/reports/types";

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
  LazyCommitmentBarChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
}));

import { CommitmentByCategoryCard } from "./commitment-by-category-card";
import { CommitmentHorizonFilter } from "./commitment-horizon-filter";
import { CommitmentMonthlyCard } from "./commitment-monthly-card";
import { CommitmentSummaryCards } from "./commitment-summary-cards";

afterEach(cleanup);

const d = (s: string) => s as ISODate;

function month(
  m: string,
  pending: number,
  recurring: number,
  income: number,
  payroll = 0,
): CommitmentMonth {
  const cashCommitted = pending + recurring;
  const committed = cashCommitted + payroll;
  return {
    month: d(`${m}-01`),
    label: m,
    longLabel: `mês ${m}`,
    pending: asCents(pending),
    recurring: asCents(recurring),
    payroll: asCents(payroll),
    cashCommitted: asCents(cashCommitted),
    committed: asCents(committed),
    income: asCents(income),
    percent: income > 0 ? (committed / income) * 100 : null,
  };
}

function overview(
  months: CommitmentMonth[],
  over: Partial<CommitmentOverview> = {},
): CommitmentOverview {
  const total = months.reduce((s, m) => s + m.committed, 0);
  return {
    from: d("2026-10-01"),
    to: d("2027-10-01"),
    horizon: 12,
    label: "outubro de 2026 a outubro de 2027",
    months,
    totalCommitted: asCents(total),
    currentMonthCommitted: months[0]?.committed ?? asCents(0),
    heaviest: null,
    nextDue: null,
    hasIncome: months.some((m) => m.income > 0),
    ...over,
  };
}

const projectionOf = (months: CommitmentMonth[], current = 0) =>
  buildProjectedBalance(asCents(current), months);

function balanceOf(current: number): BalanceSnapshot {
  return {
    consolidated: {
      current: asCents(current),
      previous: asCents(0),
      delta: asCents(current),
      percent: null,
    },
    previousAsOf: d("2026-09-30"),
    openCardDebt: asCents(0),
    hasCreditCards: false,
  };
}

describe("CommitmentMonthlyCard", () => {
  it("sem compromissos: estado vazio informativo, sem gráfico nem link", () => {
    render(
      <CommitmentMonthlyCard
        overview={overview([month("2026-10", 0, 0, 0)])}
        projection={projectionOf([month("2026-10", 0, 0, 0)])}
      />,
    );
    expect(
      screen.getByText("Nenhum compromisso em aberto neste período"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("sem receita: aria-label só com valores", () => {
    render(
      <CommitmentMonthlyCard
        overview={overview([month("2026-10", 10000, 5000, 0)])}
        projection={projectionOf([month("2026-10", 10000, 5000, 0)])}
      />,
    );
    const label = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toMatch(/comprometido R\$\s150,00/);
    expect(label).not.toMatch(/receita esperada R\$/);
  });

  it("com receita: aria-label traz receita e percentual", () => {
    render(
      <CommitmentMonthlyCard
        overview={overview([month("2026-10", 10000, 5000, 30000)])}
        projection={projectionOf([month("2026-10", 10000, 5000, 30000)])}
      />,
    );
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /receita esperada R\$\s300,00, 50,0% comprometido/,
    );
  });
});

describe("CommitmentMonthlyCard: saldo projetado", () => {
  it("negativo: sem aviso fixo na tela; aria-label traz o saldo negativo", () => {
    const months = [
      month("2026-10", 10000, 0, 0),
      month("2026-11", 20000, 0, 0),
    ];
    render(
      <CommitmentMonthlyCard
        overview={overview(months)}
        projection={projectionOf(months, 15000)}
      />,
    );
    expect(
      screen.queryByTestId("alerta-saldo-negativo"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(
      /saldo projetado .*\(negativo\)/,
    );
  });

  it("positivo: sem aviso e sem fileira de botões de mês", () => {
    const months = [month("2026-10", 10000, 0, 0)];
    render(
      <CommitmentMonthlyCard
        overview={overview(months)}
        projection={projectionOf(months, 50000)}
      />,
    );
    expect(
      screen.queryByTestId("alerta-saldo-negativo"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Detalhar mês" }),
    ).not.toBeInTheDocument();
  });
});

describe("CommitmentByCategoryCard", () => {
  it("vazio: informativo, sem botão de criar", () => {
    render(
      <CommitmentByCategoryCard
        periodLabel="out"
        breakdown={{ total: asCents(0), slices: [], negative: [], rows: [] }}
      />,
    );
    expect(
      screen.getByText("Nenhum compromisso por categoria neste período"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("com dados: legenda em texto e aria-label", () => {
    const slice = {
      key: "a",
      categoryId: "a",
      name: "Moradia",
      color: "chart-3" as const,
      icon: "house" as const,
      amount: asCents(20000),
      percent: 100,
      archived: false,
    };
    render(
      <CommitmentByCategoryCard
        periodLabel="out"
        breakdown={{
          total: asCents(20000),
          slices: [slice],
          negative: [],
          rows: [slice],
        }}
      />,
    );
    expect(
      screen.getByRole("list", {
        name: "Legenda: comprometimento por categoria",
      }),
    ).toHaveTextContent("Moradia");
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /Total R\$\s200,00\. Moradia R\$\s200,00, 100,0%/,
    );
  });
});

describe("CommitmentSummaryCards", () => {
  it("sem dados: traços e mensagens, sem NaN", () => {
    const { container } = render(
      <CommitmentSummaryCards
        overview={overview([month("2026-10", 0, 0, 0)])}
        balance={balanceOf(0)}
        projection={projectionOf([month("2026-10", 0, 0, 0)])}
      />,
    );
    expect(screen.getByText("Nenhum vencimento em aberto")).toBeInTheDocument();
    expect(
      screen.getByText("Sem receita esperada para calcular o percentual"),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("com dados: total, mês, próximo vencimento e mês mais pesado", () => {
    const months = [
      month("2026-10", 10000, 0, 40000),
      month("2026-11", 0, 30000, 0),
    ];
    render(
      <CommitmentSummaryCards
        overview={overview(months, {
          heaviest: {
            month: d("2026-11-01"),
            longLabel: "novembro de 2026",
            committed: asCents(30000),
          },
          nextDue: {
            date: d("2026-10-30"),
            description: "Luz",
            amount: asCents(8000),
            overdue: false,
            origin: "bill",
            sourceId: "t1",
          },
        })}
        balance={balanceOf(50000)}
        projection={projectionOf(months, 50000)}
      />,
    );
    expect(screen.getByTestId("resumo-total-comprometido")).toHaveTextContent(
      /R\$\s400,00/,
    );
    expect(screen.getByTestId("resumo-mes-atual")).toHaveTextContent(
      "25,0% da receita esperada do mês",
    );
    expect(screen.getByTestId("resumo-proximo-vencimento")).toHaveTextContent(
      "Luz, vence em 30/10/2026",
    );
    expect(screen.getByTestId("resumo-mes-mais-pesado")).toHaveTextContent(
      "novembro de 2026",
    );
    // 500 + 400 - 100 = 800 em out; 800 - 300 = 500 em nov (menor).
    expect(screen.getByTestId("indicador-saldo-total")).toHaveTextContent(
      /Saldo atual.*R\$\s500,00/,
    );
    const menor = screen.getByTestId("resumo-menor-saldo-projetado");
    expect(menor).toHaveTextContent(/R\$\s500,00/);
    expect(menor).toHaveTextContent("Em mês 2026-11");
    expect(menor).not.toHaveTextContent("negativo");
  });

  it("saldo projetado negativo: valor, mês e aviso em texto", () => {
    const months = [month("2026-10", 30000, 0, 0)];
    render(
      <CommitmentSummaryCards
        overview={overview(months)}
        balance={balanceOf(10000)}
        projection={projectionOf(months, 10000)}
      />,
    );
    const menor = screen.getByTestId("resumo-menor-saldo-projetado");
    expect(menor).toHaveTextContent(/-R\$\s200,00|−R\$\s200,00|R\$\s-?200,00/);
    expect(menor).toHaveTextContent("Saldo negativo em mês 2026-10");
  });
});

describe("CommitmentHorizonFilter", () => {
  it("12 meses é o padrão (sem parâmetro) e 6 meses usa ?horizonte=6", () => {
    render(<CommitmentHorizonFilter horizon={12} />);
    expect(screen.getByRole("link", { name: "12 meses" })).toHaveAttribute(
      "href",
      "/inicio",
    );
    expect(screen.getByRole("link", { name: "12 meses" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "6 meses" })).toHaveAttribute(
      "href",
      "/inicio?horizonte=6",
    );
  });
});
