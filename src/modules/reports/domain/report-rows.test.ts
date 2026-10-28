import { describe, expect, it } from "vitest";
import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import { buildCategoryBreakdown } from "./breakdown";
import {
  buildAccountReport,
  buildBudgetReportMonths,
  buildCategoryReportRows,
  buildGoalReportRows,
  buildMemberReportRows,
  type AccountInfo,
} from "./report-rows";

const c = asCents;
const month = (s: string) => s as ISODate;

describe("buildCategoryReportRows", () => {
  const cat = (id: string, name: string) =>
    [
      id,
      {
        id,
        name,
        type: "expense",
        color: "chart-1",
        icon: "tag",
        parentId: null,
        isDefault: false,
        archivedAt: null,
      },
    ] as const;
  const cats = new Map([cat("a", "Mercado"), cat("b", "Lazer")]) as never;

  it("compara com o período anterior e inclui quem só existia antes", () => {
    const current = buildCategoryBreakdown(
      [{ categoryId: "a", amount: c(30000) }],
      cats,
      c(30000),
    );
    const previous = buildCategoryBreakdown(
      [
        { categoryId: "a", amount: c(20000) },
        { categoryId: "b", amount: c(5000) },
      ],
      cats,
      c(25000),
    );
    const rows = buildCategoryReportRows(current, previous);
    expect(rows.map((r) => r.categoryId)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({
      current: 30000,
      previous: 20000,
      comparison: { delta: 10000, percent: 50 },
    });
    expect(rows[1]).toMatchObject({
      current: 0,
      previous: 5000,
      comparison: { delta: -5000, percent: -100 },
    });
  });
});

describe("buildAccountReport (D22)", () => {
  const accounts = new Map<string, AccountInfo>([
    ["c1", { id: "c1", name: "Corrente", type: "checking", isActive: true }],
    ["p1", { id: "p1", name: "Poupança", type: "savings", isActive: false }],
    ["k1", { id: "k1", name: "Cartão", type: "credit_card", isActive: true }],
  ]);

  it("líquido = entradas − saídas; consolidado só com contas de ativo; Σ líquido = delta", () => {
    const r = buildAccountReport(
      [
        {
          accountId: "c1",
          opening: c(100000),
          inflow: c(50000),
          outflow: c(30000),
          closing: c(120000),
        },
        {
          accountId: "p1",
          opening: c(0),
          inflow: c(10000),
          outflow: c(0),
          closing: c(10000),
        },
        {
          accountId: "k1",
          opening: c(0),
          inflow: c(0),
          outflow: c(30000),
          closing: c(-30000),
        },
      ],
      accounts,
    );
    expect(r.accounts.map((a) => a.net)).toEqual([20000, 10000, -30000]);
    expect(r.accounts[1]?.archived).toBe(true);
    expect(r.assetNet).toBe(30000);
    expect(r.consolidated).toMatchObject({
      current: 130000,
      previous: 100000,
      delta: 30000,
    });
    expect(r.consolidated.delta).toBe(r.assetNet);
  });

  it("conta desconhecida não derruba o relatório", () => {
    const r = buildAccountReport(
      [
        {
          accountId: "x",
          opening: c(0),
          inflow: c(100),
          outflow: c(0),
          closing: c(100),
        },
      ],
      new Map(),
    );
    expect(r.accounts[0]).toMatchObject({
      name: "Conta removida",
      archived: true,
    });
  });
});

describe("buildMemberReportRows (D10)", () => {
  it("nulo = sem responsável; fora da família = Ex-integrante; % sobre o total", () => {
    const rows = buildMemberReportRows(
      [
        { memberId: "m1", amount: c(15000) },
        { memberId: "gone", amount: c(5000) },
        { memberId: null, amount: c(5000) },
      ],
      new Map([["m1", "Ana"]]),
      c(25000),
    );
    expect(rows[0]).toMatchObject({
      member: { id: "m1", displayName: "Ana" },
      percent: 60,
    });
    expect(rows[1]?.member?.displayName).toBe("Ex-integrante");
    expect(rows[2]?.member).toBeNull();
  });

  it("total 0 -> percentual nulo", () => {
    const rows = buildMemberReportRows(
      [{ memberId: null, amount: c(0) }],
      new Map(),
      c(0),
    );
    expect(rows[0]?.percent).toBeNull();
  });
});

describe("buildBudgetReportMonths (D14)", () => {
  it("só orçamentos vigentes no mês, com estado por budgetProgress; no máximo 12 meses", () => {
    const months = Array.from({ length: 13 }, (_, i) =>
      month(
        `${2025 + Math.floor((9 + i) / 12)}-${String(((9 + i) % 12) + 1).padStart(2, "0")}-01`,
      ),
    );
    expect(months).toHaveLength(13);
    const last = months[12] as ISODate;
    const result = buildBudgetReportMonths(
      months,
      [
        { id: "b1", limit: c(50000), category: null },
        { id: "b2", limit: c(10000), category: null },
      ],
      [
        { budgetId: "b1", month: last, spent: c(40000), committed: c(0) },
        {
          budgetId: "b1",
          month: months[11] as ISODate,
          spent: c(60000),
          committed: c(0),
        },
      ],
    );
    expect(result).toHaveLength(12);
    expect(result[11]?.rows).toHaveLength(1);
    expect(result[11]?.rows[0]).toMatchObject({
      budgetId: "b1",
      percent: 80,
      status: "attention",
    });
    expect(result[10]?.rows[0]).toMatchObject({
      percent: 120,
      status: "exceeded",
    });
    expect(result[0]?.rows).toEqual([]);
  });
});

describe("buildGoalReportRows (D9)", () => {
  it("meta sem movimento aparece zerada; percentual por goalProgress", () => {
    const rows = buildGoalReportRows(
      [
        {
          id: "g1",
          name: "Viagem",
          icon: "plane",
          status: "active",
          target: c(500000),
        },
        {
          id: "g2",
          name: "Casa",
          icon: "house",
          status: "paused",
          target: c(1000000),
        },
      ],
      new Map([
        ["g1", { saved: c(300000), deposits: c(40000), withdrawals: c(10000) }],
      ]),
    );
    expect(rows[0]).toMatchObject({
      saved: 300000,
      deposits: 40000,
      withdrawals: 10000,
      percent: 60,
    });
    expect(rows[1]).toMatchObject({
      saved: 0,
      deposits: 0,
      withdrawals: 0,
      percent: 0,
    });
  });
});
