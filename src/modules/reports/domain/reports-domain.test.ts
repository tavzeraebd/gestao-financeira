import { describe, expect, it } from "vitest";
import type { ISODate } from "@/lib/dates";
import { asCents, sumCents, type Cents } from "@/lib/money";
import type { CategoryView } from "@/modules/categories/types";
import { buildCategoryBreakdown } from "./breakdown";
import { compare } from "./comparison";
import { cashFlowWindow, previousPeriod, resolvePeriod } from "./period";

const d = (s: string) => s as ISODate;
const c = (n: number): Cents => asCents(n);

function category(id: string, name: string, parentId: string | null = null) {
  return {
    id,
    name,
    type: "expense",
    color: "chart-2",
    icon: "utensils",
    parentId,
    isDefault: false,
    archivedAt: null,
  } satisfies CategoryView;
}

describe("D20 resolvePeriod", () => {
  const today = d("2026-10-24");

  it("mes_atual é o mês de hoje", () => {
    const p = resolvePeriod({ periodo: "mes_atual" }, today);
    expect([p.from, p.to]).toEqual(["2026-10-01", "2026-10-31"]);
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2026-09-01",
      "2026-09-30",
    ]);
    expect(p.label).toBe("outubro de 2026");
    expect(p.previousLabel).toBe("setembro de 2026");
  });

  it("mes_anterior cruza o ano", () => {
    const p = resolvePeriod({ periodo: "mes_anterior" }, d("2026-01-10"));
    expect([p.from, p.to]).toEqual(["2025-12-01", "2025-12-31"]);
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2025-11-01",
      "2025-11-30",
    ]);
  });

  it("personalizado válido usa os N dias imediatamente anteriores", () => {
    const p = resolvePeriod(
      { periodo: "personalizado", de: d("2026-10-01"), ate: d("2026-10-15") },
      today,
    );
    expect(p.preset).toBe("personalizado");
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2026-09-16",
      "2026-09-30",
    ]);
    expect(p.label).toBe("01/10/2026 a 15/10/2026");
  });

  it("personalizado que é mês civil inteiro compara com o mês civil anterior", () => {
    const p = resolvePeriod(
      { periodo: "personalizado", de: d("2026-03-01"), ate: d("2026-03-31") },
      today,
    );
    expect([p.previousFrom, p.previousTo]).toEqual([
      "2026-02-01",
      "2026-02-28",
    ]);
    expect(p.label).toBe("março de 2026");
  });

  it.each([
    ["sem ate", { de: d("2026-10-01") }],
    ["sem de", { ate: d("2026-10-10") }],
    ["de > ate", { de: d("2026-10-10"), ate: d("2026-10-01") }],
    ["antes de 2000", { de: d("1999-12-31"), ate: d("2000-01-10") }],
    [
      "ate depois do fim do mês atual",
      { de: d("2026-10-01"), ate: d("2026-11-01") },
    ],
    ["mais de 366 dias", { de: d("2025-10-01"), ate: d("2026-10-31") }],
  ])("personalizado inválido (%s) cai em mes_atual", (_n, extra) => {
    const p = resolvePeriod({ periodo: "personalizado", ...extra }, today);
    expect(p.preset).toBe("mes_atual");
    expect([p.from, p.to]).toEqual(["2026-10-01", "2026-10-31"]);
  });

  it("aceita exatamente 366 dias e fim no último dia do mês atual", () => {
    const p = resolvePeriod(
      { periodo: "personalizado", de: d("2025-10-31"), ate: d("2026-10-31") },
      today,
    );
    expect(p.preset).toBe("personalizado");
  });

  it("previousPeriod: período de um dia", () => {
    expect(previousPeriod(d("2026-10-15"), d("2026-10-15"))).toEqual({
      from: "2026-10-14",
      to: "2026-10-14",
    });
  });
});

describe("D17 cashFlowWindow", () => {
  it("6 meses civis terminando no mês de `to`", () => {
    expect(cashFlowWindow(d("2026-06-15"))).toEqual({
      from: "2026-01-01",
      to: "2026-06-30",
    });
    expect(cashFlowWindow(d("2026-02-10"))).toEqual({
      from: "2025-09-01",
      to: "2026-02-28",
    });
  });
});

describe("D4 R10 compare", () => {
  it("receitas sem base: percentual null", () => {
    expect(compare(c(50000), c(0))).toEqual({
      current: 50000,
      previous: 0,
      delta: 50000,
      percent: null,
    });
  });

  it("despesas: +50,00 e +25,0%", () => {
    const r = compare(c(25000), c(20000));
    expect(r.delta).toBe(5000);
    expect(r.percent).toBe(25);
  });

  it("resultado: -200,00 -> +250,00 = +450,00 e +225,0% sobre |anterior|", () => {
    const r = compare(c(25000), c(-20000));
    expect(r.delta).toBe(45000);
    expect(r.percent).toBe(225);
  });

  it("queda tem percentual negativo", () => {
    expect(compare(c(7500), c(10000)).percent).toBe(-25);
  });

  it("delta no teto de agregados não perde precisão", () => {
    const big = c(9_999_999_999);
    expect(compare(big, c(-9_999_999_999)).delta).toBe(19_999_999_998);
  });
});

describe("D16 R9 buildCategoryBreakdown", () => {
  const categories = new Map<string, CategoryView>([
    ["alim", category("alim", "Alimentação")],
    ["transp", category("transp", "Transporte")],
  ]);

  it("setembro: Alimentação 200,00 (com Mercado) e Transporte 50,00 -> 80,0% e 20,0%", () => {
    const b = buildCategoryBreakdown(
      [
        { categoryId: "alim", amount: c(20000) },
        { categoryId: "transp", amount: c(5000) },
      ],
      categories,
      c(25000),
    );
    expect(b.total).toBe(25000);
    expect(b.slices.map((s) => [s.name, s.amount, s.percent])).toEqual([
      ["Alimentação", 20000, 80],
      ["Transporte", 5000, 20],
    ]);
    expect(b.negative).toEqual([]);
    expect(b.rows).toHaveLength(2);
  });

  it("outubro: estorno maior que o gasto fica em negative, sem fatias", () => {
    const b = buildCategoryBreakdown(
      [{ categoryId: "alim", amount: c(-2000) }],
      categories,
      c(-2000),
    );
    expect(b.total).toBe(-2000);
    expect(b.slices).toEqual([]);
    expect(b.negative).toHaveLength(1);
    expect(b.negative[0]).toMatchObject({ amount: -2000, percent: 0 });
    expect(b.rows).toHaveLength(1);
  });

  it("6 categorias: 6 fatias, sem Outras", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      categoryId: `c${i}`,
      amount: c(1000 - i),
    }));
    const b = buildCategoryBreakdown(rows, new Map(), c(5985));
    expect(b.slices).toHaveLength(6);
    expect(b.slices.some((s) => s.categoryId === null)).toBe(false);
  });

  it("7 categorias: 5 maiores + Outras categorias com a soma das demais", () => {
    const rows = [100, 700, 300, 600, 200, 500, 400].map((v, i) => ({
      categoryId: `c${i}`,
      amount: c(v * 100),
    }));
    const b = buildCategoryBreakdown(rows, new Map(), c(280000));
    expect(b.slices).toHaveLength(6);
    expect(b.slices.slice(0, 5).map((s) => s.amount)).toEqual([
      70000, 60000, 50000, 40000, 30000,
    ]);
    const other = b.slices[5];
    expect(other).toMatchObject({
      categoryId: null,
      name: "Outras categorias",
      color: "chart-6",
      icon: null,
      amount: 30000, // 200 + 100
    });
    expect(sumCents(b.slices.map((s) => s.amount))).toBe(280000);
    expect(b.rows).toHaveLength(7);
    expect(other?.percent).toBeCloseTo((30000 / 280000) * 100, 10);
  });

  it("categoria fora do mapa vira 'Categoria removida'; arquivada é sinalizada", () => {
    const archived = new Map([
      ["a", { ...category("a", "Antiga"), archivedAt: "2026-01-01" }],
    ]);
    const b = buildCategoryBreakdown(
      [
        { categoryId: "a", amount: c(2000) },
        { categoryId: "x", amount: c(1000) },
      ],
      archived,
      c(3000),
    );
    expect(b.slices[0]).toMatchObject({ name: "Antiga", archived: true });
    expect(b.slices[1]).toMatchObject({
      name: "Categoria removida",
      archived: false,
    });
  });

  it("percentual usa só os positivos como base; zero é omitido", () => {
    const b = buildCategoryBreakdown(
      [
        { categoryId: "alim", amount: c(30000) },
        { categoryId: "transp", amount: c(-10000) },
        { categoryId: "z", amount: c(0) },
      ],
      categories,
      c(20000),
    );
    expect(b.slices).toHaveLength(1);
    expect(b.slices[0]?.percent).toBe(100);
    expect(b.rows.map((r) => r.amount)).toEqual([30000, -10000]);
  });

  it("empate de valor ordena por id (determinístico)", () => {
    const b = buildCategoryBreakdown(
      [
        { categoryId: "b", amount: c(1000) },
        { categoryId: "a", amount: c(1000) },
      ],
      new Map(),
      c(2000),
    );
    expect(b.slices.map((s) => s.categoryId)).toEqual(["a", "b"]);
  });
});
