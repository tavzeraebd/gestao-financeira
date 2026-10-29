import { describe, expect, it } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { CommitmentEntry, CommitmentSeries } from "../types";
import {
  buildCommitments,
  expandSeries,
  totalsByCategory,
} from "./commitments";

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
});

const series = (over: Partial<CommitmentSeries> = {}): CommitmentSeries => ({
  type: "expense",
  amount: asCents(10000),
  description: "Aluguel",
  categoryId: "c1",
  frequency: "monthly",
  intervalCount: 1,
  startDate: d("2026-01-05"),
  endDate: null,
  nextOccurrenceDate: d("2026-11-05"),
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

describe("buildCommitments", () => {
  const today = d("2026-10-29");

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
    expect(overview.totalCommitted).toBe(0);
    expect(overview.heaviest).toBeNull();
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
    expect(overview.totalCommitted).toBe(5000 + 7 * 0 + 6 * 10000 + 20000);
    expect(overview.currentMonthCommitted).toBe(5000);
    expect(overview.heaviest).toMatchObject({
      month: "2026-12-01",
      committed: 30000,
    });
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
    expect(overview.totalCommitted).toBe(5000);
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
