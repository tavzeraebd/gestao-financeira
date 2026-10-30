import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import { buildCommitmentDetails } from "@/modules/reports/domain/commitment-details";
import {
  buildCommitments,
  entriesOfMonth,
} from "@/modules/reports/domain/commitments";
import { buildProjectedBalance } from "@/modules/reports/domain/projected-balance";
import type {
  BalanceSnapshot,
  CommitmentEntry,
  CommitmentSeries,
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
  LazyDonutChart: ({
    ariaLabel,
    onSelect,
  }: {
    ariaLabel: string;
    onSelect?: (key: string) => void;
  }) => (
    <div role="img" aria-label={ariaLabel}>
      <span data-testid="fatia" onClick={() => onSelect?.("c1")} />
    </div>
  ),
  LazyCommitmentBarChart: ({
    ariaLabel,
    onSelect,
  }: {
    ariaLabel: string;
    onSelect?: (key: string) => void;
  }) => (
    <div role="img" aria-label={ariaLabel}>
      <span data-testid="barra" onClick={() => onSelect?.("2026-11-01")} />
    </div>
  ),
}));

import { CommitmentByCategoryCard } from "./commitment-by-category-card";
import { CommitmentDetailProvider } from "./commitment-detail-provider";
import { CommitmentMonthlyCard } from "./commitment-monthly-card";
import { CommitmentSummaryCards } from "./commitment-summary-cards";

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
afterEach(cleanup);

const d = (s: string) => s as ISODate;
const TODAY = d("2026-10-15");

const pending: CommitmentEntry[] = [
  {
    type: "expense",
    amount: asCents(30000),
    date: d("2026-10-20"),
    categoryId: "c1",
    description: "Condomínio",
    origin: "bill",
    sourceId: "t-condominio",
  },
  {
    type: "expense",
    amount: asCents(600000),
    date: d("2026-11-10"),
    categoryId: "c1",
    description: "Seguro do carro",
    origin: "bill",
    sourceId: "t-seguro",
  },
];

const baseSeries = {
  intervalCount: 1,
  frequency: "monthly" as const,
  startDate: d("2026-01-05"),
};
const series: CommitmentSeries[] = [
  {
    ...baseSeries,
    id: "s-aluguel",
    type: "expense",
    amount: asCents(100000),
    description: "Aluguel",
    categoryId: "c1",
    endDate: d("2026-11-05"),
    nextOccurrenceDate: d("2026-11-05"),
    payrollDeduction: false,
  },
  {
    ...baseSeries,
    id: "s-consig",
    startDate: d("2026-01-08"),
    type: "expense",
    amount: asCents(20000),
    description: "Consignado",
    categoryId: "c2",
    endDate: d("2026-11-08"),
    nextOccurrenceDate: d("2026-11-08"),
    payrollDeduction: true,
  },
  {
    ...baseSeries,
    id: "s-salario",
    startDate: d("2026-01-07"),
    type: "income",
    amount: asCents(500000),
    description: "Salário",
    categoryId: "c3",
    endDate: d("2026-11-07"),
    nextOccurrenceDate: d("2026-11-07"),
    payrollDeduction: false,
  },
];

function setup(extraPending: CommitmentEntry[] = []) {
  const result = buildCommitments({
    today: TODAY,
    horizon: 2,
    pending: [...pending, ...extraPending],
    series,
  });
  const { overview } = result;
  const current = asCents(50000);
  const projection = buildProjectedBalance(current, overview.months);
  const slices = [
    {
      key: "c1",
      categoryId: "c1",
      name: "Moradia",
      color: "chart-1" as const,
      icon: null,
      amount: asCents(30000),
      percent: 100,
      archived: false,
    },
  ];
  const details = buildCommitmentDetails({
    today: TODAY,
    currentBalance: current,
    openCardDebt: asCents(25000),
    months: overview.months,
    projection,
    entries: result.entries,
    // Como no servidor: a rosca e o detalhe por categoria só têm o mês corrente.
    expenses: entriesOfMonth(
      result.expenses,
      overview.months[0]?.month ?? TODAY,
    ),
    slices,
    names: new Map([
      ["c1", "Moradia"],
      ["c2", "Empréstimos"],
      ["c3", "Renda"],
    ]),
    accounts: [
      {
        id: "a1",
        name: "Conta Itaú",
        type: "checking",
        balance: current,
        archived: false,
      },
      {
        id: "a2",
        name: "Cartão Nubank",
        type: "credit_card",
        balance: asCents(-25000),
        archived: false,
      },
    ],
  });
  const balance: BalanceSnapshot = {
    consolidated: {
      current,
      previous: asCents(0),
      delta: current,
      percent: null,
    },
    previousAsOf: d("2026-09-30"),
    openCardDebt: asCents(25000),
    hasCreditCards: true,
  };
  return { overview, projection, details, balance, slices };
}

function renderAll(
  extraPending: CommitmentEntry[] = [],
  cardUnderestimated?: boolean,
) {
  const { overview, projection, details, balance, slices } =
    setup(extraPending);
  render(
    <CommitmentDetailProvider details={details}>
      <CommitmentSummaryCards
        overview={overview}
        balance={balance}
        projection={projection}
      />
      <CommitmentMonthlyCard
        overview={overview}
        projection={projection}
        cardUnderestimated={cardUnderestimated}
      />
      <CommitmentByCategoryCard
        periodLabel="outubro de 2026"
        breakdown={{
          total: asCents(30000),
          slices,
          negative: [],
          rows: slices,
        }}
      />
    </CommitmentDetailProvider>,
  );
}

const NOVEMBER = { name: "Ver detalhes de novembro de 2026" };

/** O detalhe por mês sai do gráfico; o caminho de teclado é a tabela alternativa ("Ver tabela"). */
async function openMonthlyTable(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getAllByRole("button", { name: "Ver tabela" })[0] as HTMLElement,
  );
}

describe("detalhamento do /inicio", () => {
  it("mês da tabela abre o detalhe com resumo, grupos, links e a conta do saldo", async () => {
    const user = userEvent.setup();
    renderAll();
    await openMonthlyTable(user);
    await user.click(screen.getByRole("button", NOVEMBER));
    const dialog = await screen.findByRole("dialog", {
      name: "novembro de 2026",
    });
    const view = within(dialog);
    for (const name of [
      "Contas em aberto (1)",
      "Recorrências (1)",
      "Desconto em folha (1)",
      "Receitas esperadas (1)",
    ]) {
      expect(view.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(view.getByRole("link", { name: "Seguro do carro" })).toHaveAttribute(
      "href",
      "/compromissos/t-seguro",
    );
    expect(view.getByRole("link", { name: "Aluguel" })).toHaveAttribute(
      "href",
      "/recorrencias/s-aluguel/editar",
    );
    expect(view.getByText("Folha")).toBeInTheDocument();
    // 500 - 300 (out) + 5.000 de receita - 6.000 - 1.000 = -1.800
    const closing = view.getByText("Saldo ao fim do mês").nextElementSibling;
    expect(closing).toHaveTextContent(/1\.800,00/);
    expect(closing).toHaveTextContent("(negativo)");
  });

  it("item de cartão mostra cartão, data da compra e vencimento da fatura", async () => {
    const user = userEvent.setup();
    renderAll([
      {
        type: "expense",
        amount: asCents(45000),
        date: d("2026-11-16"),
        categoryId: "c1",
        description: "Notebook",
        origin: "card",
        sourceId: "t-notebook",
        accountId: "a2",
        cardName: "Nubank Roxinho",
        purchaseDate: d("2026-10-12"),
        invoiceMonth: d("2026-11-01"),
      },
    ]);
    await openMonthlyTable(user);
    await user.click(screen.getByRole("button", NOVEMBER));
    const dialog = await screen.findByRole("dialog", {
      name: "novembro de 2026",
    });
    const view = within(dialog);
    expect(
      view.getByText("Nubank Roxinho · Compra 12/10 · Fatura vence 16/11"),
    ).toBeInTheDocument();
    expect(view.getByRole("link", { name: "Notebook" })).toHaveAttribute(
      "href",
      "/transacoes/t-notebook",
    );
  });

  it("aviso do cartão aparece só quando a flag é true", () => {
    renderAll([], true);
    expect(
      screen.getByRole("button", {
        name: "Aviso: comprometido do cartão pode estar menor que o real",
      }),
    ).toBeInTheDocument();
    cleanup();
    renderAll([], false);
    expect(
      screen.queryByRole("button", { name: /Aviso: comprometido do cartão/ }),
    ).not.toBeInTheDocument();
  });

  it("Enter no botão do mês abre; Esc e Fechar fecham", async () => {
    const user = userEvent.setup();
    renderAll();
    await openMonthlyTable(user);
    screen.getByRole("button", NOVEMBER).focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", NOVEMBER));
    await user.click(await screen.findByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mês sem compromissos mostra o estado vazio informativo", async () => {
    const user = userEvent.setup();
    renderAll();
    await openMonthlyTable(user);
    await user.click(
      screen.getByRole("button", { name: "Ver detalhes de dezembro de 2026" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "dezembro de 2026",
    });
    expect(
      within(dialog).getByText("Nada comprometido neste mês."),
    ).toBeInTheDocument();
  });

  it("clique na barra do gráfico abre o mês", async () => {
    const user = userEvent.setup();
    renderAll();
    await user.click(screen.getByTestId("barra"));
    expect(
      await screen.findByRole("dialog", { name: "novembro de 2026" }),
    ).toBeInTheDocument();
  });

  it("linha da tabela alternativa abre o mês", async () => {
    const user = userEvent.setup();
    renderAll();
    await user.click(
      screen.getAllByRole("button", { name: "Ver tabela" })[0] as HTMLElement,
    );
    await user.click(
      screen.getByRole("button", { name: "Ver detalhes de dezembro de 2026" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "dezembro de 2026" }),
    ).toBeInTheDocument();
  });

  it("legenda e fatia da categoria abrem os itens, com total e participação", async () => {
    const user = userEvent.setup();
    renderAll();
    await user.click(
      // O nome acessível contém o texto visível da legenda (rótulo + percentual), WCAG 2.5.3.
      screen.getByRole("button", { name: /^Ver itens de Moradia( [\d,]+%)?$/ }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Moradia" });
    const view = within(dialog);
    expect(view.getByText("100,0%")).toBeInTheDocument();
    expect(view.getByRole("link", { name: "Condomínio" })).toBeVisible();
    // Só o mês corrente: o que vence em novembro não aparece na categoria.
    for (const outro of ["Seguro do carro", "Aluguel", "Consignado"]) {
      expect(view.queryByRole("link", { name: outro })).not.toBeInTheDocument();
    }
    await user.keyboard("{Escape}");

    await user.click(screen.getByTestId("fatia"));
    expect(
      await screen.findByRole("dialog", { name: "Moradia" }),
    ).toBeInTheDocument();
  });

  it("saldo atual lista as contas e a fatura do cartão", async () => {
    const user = userEvent.setup();
    renderAll();
    await user.click(
      screen.getByRole("button", { name: /Ver saldo por conta/ }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Saldo atual" });
    const view = within(dialog);
    expect(view.getByText("Conta Itaú")).toBeInTheDocument();
    expect(view.getByText("Cartão Nubank")).toBeInTheDocument();
    expect(view.getByText("Faturas de cartão em aberto")).toBeInTheDocument();
  });

  it("cards do mês corrente abrem o detalhe do mês atual", async () => {
    const user = userEvent.setup();
    renderAll();
    for (const id of ["resumo-mes-atual", "resumo-saldo-fim-do-mes"]) {
      await user.click(within(screen.getByTestId(id)).getByRole("button"));
      const dialog = await screen.findByRole("dialog", {
        name: "outubro de 2026",
      });
      expect(
        within(dialog).getByRole("link", { name: "Condomínio" }),
      ).toBeVisible();
      await user.keyboard("{Escape}");
    }
    expect(
      screen.queryByTestId("resumo-total-comprometido"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("resumo-mes-mais-pesado"),
    ).not.toBeInTheDocument();
  });

  it("próximo vencimento é link para o item, não botão", () => {
    const { overview, projection, details, balance } = setup();
    render(
      <CommitmentDetailProvider details={details}>
        <CommitmentSummaryCards
          overview={{
            ...overview,
            nextDue: {
              date: d("2026-11-10"),
              description: "Seguro do carro",
              amount: asCents(600000),
              overdue: false,
              origin: "bill",
              sourceId: "t-seguro",
            },
          }}
          balance={balance}
          projection={projection}
        />
      </CommitmentDetailProvider>,
    );
    const card = screen.getByTestId("resumo-proximo-vencimento");
    expect(within(card).getByRole("link")).toHaveAttribute(
      "href",
      "/compromissos/t-seguro",
    );
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });
});
