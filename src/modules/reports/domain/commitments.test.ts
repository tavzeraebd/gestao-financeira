import { describe, expect, it } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { CommitmentEntry, CommitmentSeries } from "../types";
import {
  buildCommitments,
  entriesOfMonth,
  expandSeries,
  totalsByCategory,
} from "./commitments";
import { openPurchaseEntries } from "./card-invoices";

const d = (s: string) => s as ISODate;

const entry = (
  type: "income" | "expense",
  date: string,
  cents: number,
  categoryId = "c1",
): CommitmentEntry => ({
  type,
  date: d(date),
  amount: asCents(cents),
  categoryId,
  description: `${type} ${date}`,
  origin: "bill",
  sourceId: `t-${type}-${date}`,
});

const series = (over: Partial<CommitmentSeries> = {}): CommitmentSeries => ({
  id: "s1",
  type: "expense",
  amount: asCents(10000),
  description: "Aluguel",
  categoryId: "c1",
  frequency: "monthly",
  intervalCount: 1,
  startDate: d("2026-01-05"),
  endDate: null,
  nextOccurrenceDate: d("2026-11-05"),
  payrollDeduction: false,
  ...over,
});

describe("expandSeries", () => {
  it("recorrência sem fim é limitada pelo fim do horizonte", () => {
    const list = expandSeries(series(), d("2026-10-29"), d("2027-11-01"));
    expect(list).toHaveLength(12);
    expect(list[0]?.date).toBe("2026-11-05");
    expect(list[11]?.date).toBe("2027-10-05");
  });

  it("respeita a data final da série", () => {
    const list = expandSeries(
      series({ endDate: d("2027-01-05") }),
      d("2026-10-29"),
      d("2027-11-01"),
    );
    expect(list.map((e) => e.date)).toEqual([
      "2026-11-05",
      "2026-12-05",
      "2027-01-05",
    ]);
  });

  it("dia 31 vira o último dia do mês curto e a âncora volta no seguinte", () => {
    const list = expandSeries(
      series({
        startDate: d("2026-01-31"),
        nextOccurrenceDate: d("2026-01-31"),
      }),
      d("2026-02-01"),
      d("2026-05-01"),
    );
    expect(list.map((e) => e.date)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("semanal e anual", () => {
    const weekly = expandSeries(
      series({
        frequency: "weekly",
        intervalCount: 2,
        startDate: d("2026-10-01"),
        nextOccurrenceDate: d("2026-10-29"),
      }),
      d("2026-10-29"),
      d("2026-12-01"),
    );
    expect(weekly.map((e) => e.date)).toEqual([
      "2026-10-29",
      "2026-11-12",
      "2026-11-26",
    ]);
    const yearly = expandSeries(
      series({
        frequency: "yearly",
        startDate: d("2024-12-20"),
        nextOccurrenceDate: d("2026-12-20"),
      }),
      d("2026-10-29"),
      d("2028-01-01"),
    );
    expect(yearly.map((e) => e.date)).toEqual(["2026-12-20", "2027-12-20"]);
  });

  it("ocorrência anterior a hoje já foi lançada e não entra", () => {
    const list = expandSeries(
      series({ nextOccurrenceDate: d("2026-10-05") }),
      d("2026-10-29"),
      d("2026-12-01"),
    );
    expect(list.map((e) => e.date)).toEqual(["2026-11-05"]);
  });
});

const totalOf = (overview: { months: { committed: number }[] }) =>
  overview.months.reduce((sum, m) => sum + m.committed, 0);

describe("buildCommitments", () => {
  const today = d("2026-10-29");

  it("próximo vencimento é só do mês corrente: conta de novembro não conta", () => {
    const { overview } = buildCommitments({
      today,
      horizon: 12,
      pending: [entry("expense", "2026-11-03", 5000)],
      series: [],
    });
    expect(overview.nextDue).toBeNull();
    const withCurrent = buildCommitments({
      today,
      horizon: 12,
      pending: [
        entry("expense", "2026-11-03", 5000),
        entry("expense", "2026-10-31", 700),
      ],
      series: [],
    });
    expect(withCurrent.overview.nextDue).toMatchObject({
      date: "2026-10-31",
      amount: 700,
    });
  });

  it("13 meses para horizonte 12, virando o ano", () => {
    const { overview } = buildCommitments({
      today,
      horizon: 12,
      pending: [],
      series: [],
    });
    expect(overview.months).toHaveLength(13);
    expect(overview.months[0]?.month).toBe("2026-10-01");
    expect(overview.months[3]?.month).toBe("2027-01-01");
    expect(overview.months[12]?.month).toBe("2027-10-01");
    expect(overview.months[0]?.label).toBe("out/26");
    expect(totalOf(overview)).toBe(0);
    expect(overview.nextDue).toBeNull();
    expect(overview.hasIncome).toBe(false);
  });

  it("horizonte 6 gera 7 meses", () => {
    const { overview } = buildCommitments({
      today,
      horizon: 6,
      pending: [],
      series: [],
    });
    expect(overview.months).toHaveLength(7);
    expect(overview.to).toBe("2027-04-01");
  });

  it("soma contas em aberto e recorrências; vencidas entram no mês atual; além do horizonte, fora", () => {
    const { overview, expenses } = buildCommitments({
      today,
      horizon: 6,
      pending: [
        entry("expense", "2026-10-10", 5000), // vencida
        entry("expense", "2026-12-15", 20000),
        entry("expense", "2027-05-01", 99999), // fora (horizonte termina em abr/2027)
      ],
      series: [series()],
    });
    const [oct, nov, dec] = overview.months;
    expect(oct?.pending).toBe(5000);
    expect(oct?.recurring).toBe(0);
    expect(nov?.recurring).toBe(10000);
    expect(dec?.pending).toBe(20000);
    expect(dec?.committed).toBe(30000);
    expect(totalOf(overview)).toBe(5000 + 7 * 0 + 6 * 10000 + 20000);
    expect(oct?.committed).toBe(5000);
    expect(overview.nextDue).toMatchObject({
      date: "2026-10-10",
      overdue: true,
    });
    expect(expenses).toHaveLength(2 + 6);
  });

  it("sem receita: percentual nulo e hasIncome falso", () => {
    const { overview } = buildCommitments({
      today,
      horizon: 6,
      pending: [entry("expense", "2026-11-10", 5000)],
      series: [],
    });
    expect(overview.months.every((m) => m.percent === null)).toBe(true);
    expect(overview.hasIncome).toBe(false);
  });

  it("com receita: percentual de comprometimento por mês", () => {
    const { overview } = buildCommitments({
      today,
      horizon: 6,
      pending: [entry("expense", "2026-11-10", 5000)],
      series: [
        series({
          type: "income",
          amount: asCents(20000),
          description: "Salário",
          nextOccurrenceDate: d("2026-11-05"),
        }),
      ],
    });
    const nov = overview.months[1];
    expect(nov?.income).toBe(20000);
    expect(nov?.percent).toBe(25);
    expect(overview.hasIncome).toBe(true);
    // Receita não compromete.
    expect(totalOf(overview)).toBe(5000);
  });
});

describe("desconto em folha", () => {
  const today = d("2026-10-29");
  const payroll = (over: Partial<CommitmentSeries> = {}) =>
    series({
      payrollDeduction: true,
      description: "Empréstimo consignado",
      amount: asCents(50000),
      categoryId: "emprestimo",
      endDate: d("2027-01-05"),
      ...over,
    });

  it("entra no comprometido em coluna própria e fica fora do caixa", () => {
    const { overview, expenses } = buildCommitments({
      today,
      horizon: 6,
      pending: [entry("expense", "2026-11-10", 5000)],
      series: [payroll()],
    });
    const [oct, nov, dec, jan, feb] = overview.months;
    expect(oct?.payroll).toBe(0);
    expect(nov?.payroll).toBe(50000);
    expect(nov?.recurring).toBe(0);
    expect(nov?.cashCommitted).toBe(5000);
    expect(nov?.committed).toBe(55000);
    expect(dec?.payroll).toBe(50000);
    expect(jan?.payroll).toBe(50000);
    // Termina em end_date: nada depois de 05/01/2027.
    expect(feb?.payroll).toBe(0);
    expect(totalOf(overview)).toBe(5000 + 3 * 50000);
    expect(expenses.filter((e) => e.payroll)).toHaveLength(3);
  });

  it("o % de comprometimento inclui o desconto em folha", () => {
    const { overview } = buildCommitments({
      today,
      horizon: 6,
      pending: [],
      series: [
        payroll(),
        series({
          type: "income",
          amount: asCents(200000),
          description: "Salário líquido",
          nextOccurrenceDate: d("2026-11-05"),
        }),
      ],
    });
    expect(overview.months[1]?.percent).toBe(25);
  });

  it("série com término no passado não entra", () => {
    const { overview, expenses } = buildCommitments({
      today,
      horizon: 6,
      pending: [],
      series: [payroll({ endDate: d("2026-09-05") })],
    });
    expect(totalOf(overview)).toBe(0);
    expect(expenses).toHaveLength(0);
  });

  it("não é próximo vencimento, mas entra no total por categoria", () => {
    const { overview, expenses } = buildCommitments({
      today,
      horizon: 6,
      pending: [],
      series: [payroll()],
    });
    expect(overview.nextDue).toBeNull();
    expect(totalsByCategory(expenses)).toEqual([
      { categoryId: "emprestimo", amount: 150000 },
    ]);
  });
});

describe("entriesOfMonth", () => {
  it("só o mês pedido; vencidas contam no mês de hoje", () => {
    const list = [
      entry("expense", "2026-09-30", 1),
      entry("expense", "2026-10-31", 2),
      entry("expense", "2026-11-01", 3),
    ];
    expect(entriesOfMonth(list, d("2026-10-01")).map((e) => e.amount)).toEqual([
      1, 2,
    ]);
  });
});

describe("totalsByCategory", () => {
  it("agrupa por categoria", () => {
    const totals = totalsByCategory([
      entry("expense", "2026-11-01", 100, "a"),
      entry("expense", "2026-12-01", 250, "a"),
      entry("expense", "2026-12-01", 50, "b"),
    ]);
    expect(totals).toEqual([
      { categoryId: "a", amount: 350 },
      { categoryId: "b", amount: 50 },
    ]);
  });
});

describe("buildCommitments: entradas com origem", () => {
  it("devolve contas em aberto e ocorrências de série com id e origem", () => {
    const result = buildCommitments({
      today: d("2026-10-29"),
      horizon: 1 as 6,
      pending: [entry("expense", "2026-10-30", 5000)],
      series: [series()],
    });
    const bill = result.entries.find((e) => e.origin === "bill");
    const recurring = result.entries.find((e) => e.origin === "series");
    expect(bill?.sourceId).toBe("t-expense-2026-10-30");
    expect(recurring?.sourceId).toBe("s1");
    expect(result.overview.nextDue).toMatchObject({
      origin: "bill",
      sourceId: "t-expense-2026-10-30",
    });
  });
});

describe("buildCommitments com cartão (D24)", () => {
  const card = { id: "card", name: "Visa", closingDay: 11, dueDay: 16 };
  const TODAY = d("2026-10-13");
  const open = (id: string, date: string, cents: number) =>
    openPurchaseEntries(
      [
        {
          id,
          accountId: "card",
          description: id,
          amount: asCents(cents),
          date: d(date),
          categoryId: "c1",
        },
      ],
      card,
      asCents(cents),
    ).entries;

  it("pendente no cartão conta no mês do vencimento da fatura, não no da compra", () => {
    const pendingCard: CommitmentEntry = {
      ...entry("expense", "2026-10-12", 5000),
      accountId: "card",
    };
    const result = buildCommitments({
      today: TODAY,
      horizon: 2,
      pending: [pendingCard],
      series: [],
      cards: [card],
    });
    expect(result.overview.months[0]?.pending).toBe(0);
    expect(result.overview.months[1]?.pending).toBe(5000);
    expect(result.entries[0]?.purchaseDate).toBe("2026-10-12");
  });

  it("compra efetivada em aberto entra no mês da fatura, sem duplicar pendentes", () => {
    const pendingCard: CommitmentEntry = {
      ...entry("expense", "2026-10-05", 2000),
      accountId: "card",
    };
    const result = buildCommitments({
      today: TODAY,
      horizon: 2,
      pending: [pendingCard],
      series: [],
      cards: [card],
      cardPurchases: open("p1", "2026-10-12", 3000),
    });
    const [oct, nov] = result.overview.months;
    expect(oct?.pending).toBe(2000);
    expect(nov?.pending).toBe(3000);
    expect(result.expenses).toHaveLength(2);
  });

  it("fatura vencida e não paga entra no mês atual", () => {
    const result = buildCommitments({
      today: TODAY,
      horizon: 2,
      pending: [],
      series: [],
      cards: [card],
      cardPurchases: open("p1", "2026-10-02", 1500),
    });
    expect(result.overview.months[0]?.pending).toBe(1500);
  });

  it("ocorrência de recorrência em cartão segue a regra da fatura", () => {
    const result = buildCommitments({
      today: TODAY,
      horizon: 2,
      pending: [],
      series: [
        series({
          accountId: "card",
          nextOccurrenceDate: d("2026-11-12"),
          startDate: d("2026-11-12"),
        }),
      ],
      cards: [card],
    });
    // 12/11 fecha 11/12 e vence 16/12.
    expect(result.overview.months[2]?.recurring).toBe(10000);
    expect(result.overview.months[1]?.recurring).toBe(0);
  });

  it("fatura além do horizonte fica de fora", () => {
    const result = buildCommitments({
      today: TODAY,
      horizon: 1,
      pending: [{ ...entry("expense", "2026-11-12", 100), accountId: "card" }],
      series: [],
      cards: [card],
    });
    expect(result.expenses).toHaveLength(0);
  });
});
