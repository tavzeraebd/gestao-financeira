import { describe, expect, it } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { AccountBase } from "@/modules/accounts/repository";
import type { CategoryView } from "@/modules/categories/types";
import type { CategorySlice, CommitmentEntry } from "../types";
import {
  buildAccountRows,
  buildCategoryDetails,
  buildCommitmentDetails,
  buildMonthDetails,
  categoryNames,
  commitmentItemHref,
} from "./commitment-details";
import { buildCommitments } from "./commitments";
import { buildProjectedBalance } from "./projected-balance";

const d = (s: string) => s as ISODate;
const TODAY = d("2026-10-15");

const names = new Map([
  ["c1", "Moradia"],
  ["c2", "Saúde"],
  ["c3", "Lazer"],
]);

const entry = (over: Partial<CommitmentEntry>): CommitmentEntry => ({
  type: "expense",
  amount: asCents(10000),
  date: d("2026-10-20"),
  categoryId: "c1",
  description: "Conta",
  origin: "bill",
  sourceId: "t1",
  ...over,
});

const entries: CommitmentEntry[] = [
  entry({ sourceId: "t1", date: d("2026-10-05"), description: "Luz vencida" }),
  entry({ sourceId: "t2", date: d("2026-10-20"), description: "Água" }),
  entry({
    sourceId: "t3",
    type: "income",
    amount: asCents(50000),
    date: d("2026-10-25"),
    description: "Freela",
    categoryId: "c2",
  }),
  entry({
    origin: "series",
    sourceId: "s1",
    date: d("2026-11-05"),
    description: "Aluguel",
    amount: asCents(30000),
  }),
  entry({
    origin: "series",
    sourceId: "s2",
    date: d("2026-11-10"),
    description: "Consignado",
    amount: asCents(20000),
    categoryId: "c3",
    payroll: true,
  }),
  entry({
    origin: "series",
    sourceId: "s3",
    type: "income",
    amount: asCents(100000),
    date: d("2026-11-07"),
    description: "Salário",
    categoryId: "c2",
  }),
];

function built() {
  const {
    overview,
    entries: all,
    expenses,
  } = buildCommitments({
    today: TODAY,
    horizon: 6,
    pending: entries.filter((e) => e.origin === "bill"),
    series: [],
  });
  return { overview, all, expenses };
}

describe("commitmentItemHref", () => {
  it("conta em aberto vai para o compromisso e série para a edição da recorrência", () => {
    expect(commitmentItemHref("bill", "abc")).toBe("/compromissos/abc");
    expect(commitmentItemHref("series", "xyz")).toBe(
      "/recorrencias/xyz/editar",
    );
  });
});

describe("categoryNames", () => {
  it("categoria arquivada ganha o sufixo", () => {
    const map = categoryNames([
      { id: "a", name: "Antiga", archivedAt: "2026-01-01" },
      { id: "b", name: "Viva", archivedAt: null },
    ] as unknown as CategoryView[]);
    expect(map.get("a")).toBe("Antiga (arquivada)");
    expect(map.get("b")).toBe("Viva");
  });
});

describe("buildMonthDetails", () => {
  const months = buildCommitments({
    today: TODAY,
    horizon: 2 as 6,
    pending: [],
    series: [],
  }).overview.months;

  it("cada mês reúne os itens nos grupos certos e a soma bate com o resumo", () => {
    // Monta o resumo a partir das mesmas entradas, como o servidor faz.
    const input = entries.filter((e) => e.origin === "bill");
    const result = buildCommitments({
      today: TODAY,
      horizon: 2 as 6,
      pending: input,
      series: [],
    });
    const projection = buildProjectedBalance(
      asCents(100000),
      result.overview.months,
    );
    const details = buildMonthDetails(
      result.overview.months,
      projection,
      asCents(100000),
      result.entries,
      { today: TODAY, names },
    );
    const october = details[0];
    expect(october?.groups.bills.map((i) => i.description)).toEqual([
      "Luz vencida",
      "Água",
    ]);
    expect(october?.groups.bills[0]?.overdue).toBe(true);
    expect(october?.groups.bills[1]?.overdue).toBe(false);
    expect(october?.groups.income.map((i) => i.description)).toEqual([
      "Freela",
    ]);
    expect(october?.groups.bills[0]?.categoryName).toBe("Moradia");
    const sum = (list: { amount: number }[]) =>
      list.reduce((acc, i) => acc + i.amount, 0);
    expect(sum(october?.groups.bills ?? [])).toBe(october?.pending);
    expect(sum(october?.groups.income ?? [])).toBe(october?.income);
  });

  it("recorrências e folha ficam em grupos próprios, com a origem preservada", () => {
    const monthsWithSeries = buildCommitments({
      today: TODAY,
      horizon: 2 as 6,
      pending: [],
      series: [],
    }).overview.months;
    const projection = buildProjectedBalance(asCents(0), monthsWithSeries);
    const details = buildMonthDetails(
      monthsWithSeries,
      projection,
      asCents(0),
      entries,
      { today: TODAY, names },
    );
    const november = details[1];
    expect(november?.groups.recurring).toHaveLength(1);
    expect(november?.groups.recurring[0]).toMatchObject({
      origin: "series",
      sourceId: "s1",
      description: "Aluguel",
    });
    expect(november?.groups.payroll.map((i) => i.description)).toEqual([
      "Consignado",
    ]);
    expect(november?.groups.income.map((i) => i.description)).toEqual([
      "Salário",
    ]);
  });

  it("saldo de abertura encadeia com o fechamento do mês anterior e o fechamento bate com a projeção", () => {
    const result = buildCommitments({
      today: TODAY,
      horizon: 2 as 6,
      pending: [
        entry({ sourceId: "a", amount: asCents(30000) }),
        entry({
          sourceId: "b",
          type: "income",
          amount: asCents(10000),
          date: d("2026-11-03"),
        }),
        entry({ sourceId: "c", date: d("2026-12-02"), amount: asCents(5000) }),
      ],
      series: [],
    });
    const projection = buildProjectedBalance(
      asCents(20000),
      result.overview.months,
    );
    const details = buildMonthDetails(
      result.overview.months,
      projection,
      asCents(20000),
      result.entries,
      { today: TODAY, names },
    );
    expect(details.map((m) => m.opening)).toEqual([20000, -10000, 0]);
    // outubro: 200 - 300 = -100; novembro: -100 + 100 = 0; dezembro: 0 - 50 = -50
    expect(details.map((m) => m.closing)).toEqual([-10000, 0, -5000]);
    expect(details.map((m) => m.closing)).toEqual(
      projection.months.map((m) => m.balance),
    );
    expect(details.map((m) => m.negative)).toEqual([true, false, true]);
    // abertura + receita - caixa = fechamento, em todo mês
    for (const m of details) {
      expect(m.opening + m.income - m.cashCommitted).toBe(m.closing);
    }
  });

  it("mês sem nada fica com grupos vazios", () => {
    const projection = buildProjectedBalance(asCents(0), months);
    const details = buildMonthDetails(months, projection, asCents(0), [], {
      today: TODAY,
      names,
    });
    expect(details[0]?.groups).toEqual({
      bills: [],
      recurring: [],
      payroll: [],
      income: [],
    });
  });
});

describe("buildCategoryDetails", () => {
  const slice = (
    key: string,
    categoryId: string | null,
    name: string,
    amount: number,
    percent: number,
  ): CategorySlice => ({
    key,
    categoryId,
    name,
    color: "chart-1",
    icon: null,
    amount: asCents(amount),
    percent,
    archived: false,
  });

  it("agrupa por mês dentro da categoria, com total por mês e sem receitas", () => {
    const { overview, expenses } = built();
    const result = buildCategoryDetails(
      [slice("c1", "c1", "Moradia", 20000, 100)],
      [
        ...expenses,
        entry({
          sourceId: "n1",
          date: d("2026-11-12"),
          amount: asCents(7000),
          description: "Condomínio",
        }),
      ],
      overview.months,
      { today: TODAY, names },
    );
    const moradia = result[0];
    expect(moradia?.name).toBe("Moradia");
    expect(moradia?.months.map((m) => m.month)).toEqual([
      "2026-10-01",
      "2026-11-01",
    ]);
    expect(moradia?.months[0]?.items.map((i) => i.description)).toEqual([
      "Luz vencida",
      "Água",
    ]);
    expect(moradia?.months[0]?.total).toBe(20000);
    expect(moradia?.months[1]?.total).toBe(7000);
  });

  it("'Outras categorias' reúne as categorias fora das fatias nomeadas", () => {
    const { overview } = built();
    const expenses = [
      entry({ sourceId: "x1", categoryId: "c1", amount: asCents(5000) }),
      entry({ sourceId: "x2", categoryId: "c2", amount: asCents(2000) }),
      entry({ sourceId: "x3", categoryId: "c3", amount: asCents(1000) }),
    ];
    const result = buildCategoryDetails(
      [
        slice("c1", "c1", "Moradia", 5000, 62.5),
        slice("outras-categorias", null, "Outras categorias", 3000, 37.5),
      ],
      expenses,
      overview.months,
      { today: TODAY, names },
    );
    const other = result.find((c) => c.key === "outras-categorias");
    expect(other?.months[0]?.items.map((i) => i.categoryName).sort()).toEqual([
      "Lazer",
      "Saúde",
    ]);
    expect(other?.months[0]?.total).toBe(3000);
    expect(other?.total).toBe(3000);
  });

  it("categoria sem itens no horizonte volta com a lista de meses vazia", () => {
    const { overview } = built();
    const result = buildCategoryDetails(
      [slice("c9", "c9", "Vazia", 0, 0)],
      [],
      overview.months,
      { today: TODAY, names },
    );
    expect(result[0]?.months).toEqual([]);
  });
});

describe("buildAccountRows", () => {
  const account = (
    id: string,
    name: string,
    type: AccountBase["type"],
    isActive = true,
  ) => ({ id, name, type, isActive }) as AccountBase;

  it("ativos por nome, cartões por último; inativa só com saldo", () => {
    const rows = buildAccountRows(
      [
        account("1", "Nubank", "credit_card"),
        account("2", "Itaú", "checking"),
        account("3", "Carteira", "cash"),
        account("4", "Antiga zerada", "savings", false),
        account("5", "Antiga com saldo", "savings", false),
      ],
      new Map([
        ["1", asCents(-30000)],
        ["2", asCents(150000)],
        ["3", asCents(5000)],
        ["5", asCents(1000)],
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual([
      "Antiga com saldo",
      "Carteira",
      "Itaú",
      "Nubank",
    ]);
    expect(rows.find((r) => r.id === "5")?.archived).toBe(true);
  });

  it("a soma das contas que não são cartão é o saldo atual", () => {
    const rows = buildAccountRows(
      [account("2", "Itaú", "checking"), account("3", "Carteira", "cash")],
      new Map([
        ["2", asCents(150000)],
        ["3", asCents(5000)],
      ]),
    );
    expect(rows.reduce((s, r) => s + r.balance, 0)).toBe(155000);
  });
});

describe("buildCommitmentDetails", () => {
  it("compõe meses, categorias e contas", () => {
    const result = buildCommitments({
      today: TODAY,
      horizon: 1 as 6,
      pending: [entry({ sourceId: "p1", amount: asCents(40000) })],
      series: [],
    });
    const projection = buildProjectedBalance(
      asCents(10000),
      result.overview.months,
    );
    const details = buildCommitmentDetails({
      today: TODAY,
      currentBalance: asCents(10000),
      openCardDebt: asCents(0),
      months: result.overview.months,
      projection,
      entries: result.entries,
      expenses: result.expenses,
      slices: [
        {
          key: "c1",
          categoryId: "c1",
          name: "Moradia",
          color: "chart-1",
          icon: null,
          amount: asCents(40000),
          percent: 100,
          archived: false,
        },
      ],
      names,
      accounts: [],
    });
    expect(details.months).toHaveLength(2);
    expect(details.categories[0]?.months[0]?.total).toBe(40000);
    expect(details.months[0]?.closing).toBe(-30000);
  });
});
