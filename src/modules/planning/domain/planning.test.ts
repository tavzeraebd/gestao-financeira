import { describe, expect, it } from "vitest";
import type { ISODate } from "@/lib/dates";
import { asCents, type Cents } from "@/lib/money";
import type { PlanningBaseline, ResultLine, SimulationResult } from "../types";
import { simulateFinancing } from "./financing";
import { simulateGoalDeadline } from "./goal-deadline";
import { simulateNewCommitment } from "./new-commitment";
import { projectBalance } from "./projection";
import { simulateReduction } from "./reduction";
import { roundToCents } from "./rounding";
import { simulateSaving } from "./saving";

const c = (n: number): Cents => asCents(n);
const d = (s: string) => s as ISODate;
const TODAY = d("2026-10-24");

const baseline: PlanningBaseline = {
  today: TODAY,
  hasAccounts: true,
  consolidatedBalance: c(100000),
  averageWindow: { from: d("2026-07-01"), to: d("2026-09-30") },
  averageMonthly: { income: c(500000), expense: c(241700), result: c(258300) },
  categoryAverages: [
    {
      categoryId: "cat-1",
      name: "Mercado",
      color: "red",
      icon: "cart",
      average: c(80000),
    },
  ],
  goals: [
    {
      id: "g1",
      name: "Viagem",
      saved: c(30000),
      target: c(500000),
      pace: c(10000),
      targetDate: null,
    },
    {
      id: "g2",
      name: "Parada",
      saved: c(0),
      target: c(100000),
      pace: c(0),
      targetDate: d("2027-06-30"),
    },
  ],
  projection: [
    {
      month: d("2026-10-01"),
      label: "out. 2026",
      pendingIncome: c(0),
      pendingExpense: c(10000),
      recurringIncome: c(50000),
      recurringExpense: c(20000),
    },
    {
      month: d("2026-11-01"),
      label: "nov. 2026",
      pendingIncome: c(0),
      pendingExpense: c(0),
      recurringIncome: c(50000),
      recurringExpense: c(20000),
    },
    {
      month: d("2026-12-01"),
      label: "dez. 2026",
      pendingIncome: c(0),
      pendingExpense: c(0),
      recurringIncome: c(0),
      recurringExpense: c(70000),
    },
  ],
};
const noAccounts: PlanningBaseline = { ...baseline, hasAccounts: false };

function lineValue(result: SimulationResult, label: string) {
  if (!result.ok) throw new Error("esperava ok");
  return result.lines.find((l) => l.label === label)?.value;
}

function expectFinite(result: SimulationResult) {
  if (!result.ok) return;
  const all: ResultLine[] = [result.headline, ...result.lines];
  for (const line of all) {
    if (typeof line.value === "number") {
      expect(Number.isFinite(line.value)).toBe(true);
    }
  }
}

describe("roundToCents", () => {
  it("meio para longe do zero; NaN e Infinity viram null", () => {
    expect(roundToCents(0.5)).toBe(1);
    expect(roundToCents(-0.5)).toBe(-1);
    expect(roundToCents(2.4)).toBe(2);
    expect(roundToCents(Number.NaN)).toBeNull();
    expect(roundToCents(Number.POSITIVE_INFINITY)).toBeNull();
    expect(roundToCents(1e20)).toBeNull();
  });
});

describe("simulateFinancing (D15, R19)", () => {
  const run = (rate: number) =>
    simulateFinancing({
      value: c(8000000),
      downPayment: c(2000000),
      months: 36,
      monthlyRatePercent: rate,
    });

  it("i = 0: 1.666,67; total 60.000,00; juros 0; custo 80.000,00", () => {
    const r = run(0);
    expect(r.ok && r.headline.value).toBe(166667);
    expect(lineValue(r, "Total das parcelas")).toBe(6000000);
    expect(lineValue(r, "Juros pagos")).toBe(0);
    expect(lineValue(r, "Custo total (entrada + parcelas)")).toBe(8000000);
  });

  it("i = 1,5%: 2.169,14; total 78.089,17; juros 18.089,17; custo 98.089,17", () => {
    const r = run(1.5);
    expect(r.ok && r.headline.value).toBe(216914);
    expect(lineValue(r, "Total das parcelas")).toBe(7808917);
    expect(lineValue(r, "Juros pagos")).toBe(1808917);
    expect(lineValue(r, "Custo total (entrada + parcelas)")).toBe(9808917);
  });

  it("i = 0,4%: 1.792,87; total 64.543,36", () => {
    const r = run(0.4);
    expect(r.ok && r.headline.value).toBe(179287);
    expect(lineValue(r, "Total das parcelas")).toBe(6454336);
  });

  it("cada linha tem origem e a taxa é informada", () => {
    const r = run(1.5);
    if (!r.ok) throw new Error("esperava ok");
    expect(r.headline.source).toBe("estimated");
    expect(r.lines.find((l) => l.label === "Taxa mensal")?.source).toBe(
      "informed",
    );
    expect(r.premises.length).toBeGreaterThan(0);
  });

  it("limites: entrada ≥ valor, prazo, taxa e casas", () => {
    const base = {
      value: c(100000),
      downPayment: c(0),
      months: 12,
      monthlyRatePercent: 1,
    };
    expect(simulateFinancing({ ...base, downPayment: c(100000) })).toEqual({
      ok: false,
      error: "OUT_OF_RANGE",
    });
    expect(simulateFinancing({ ...base, months: 0 }).ok).toBe(false);
    expect(simulateFinancing({ ...base, months: 481 }).ok).toBe(false);
    expect(simulateFinancing({ ...base, months: 480 }).ok).toBe(true);
    expect(simulateFinancing({ ...base, monthlyRatePercent: 20.0001 }).ok).toBe(
      false,
    );
    expect(simulateFinancing({ ...base, monthlyRatePercent: 20 }).ok).toBe(
      true,
    );
    expect(simulateFinancing({ ...base, monthlyRatePercent: -1 }).ok).toBe(
      false,
    );
    expect(simulateFinancing({ ...base, monthlyRatePercent: 1.23456 }).ok).toBe(
      false,
    );
    expect(
      simulateFinancing({ ...base, monthlyRatePercent: Number.NaN }).ok,
    ).toBe(false);
    expect(simulateFinancing({ ...base, value: c(0) }).ok).toBe(false);
  });

  it("nunca devolve NaN/Infinity nos extremos", () => {
    for (const value of [1, 100, 9_999_999_999]) {
      for (const months of [1, 36, 480]) {
        for (const rate of [0, 0.0001, 20]) {
          expectFinite(
            simulateFinancing({
              value: c(value),
              downPayment: c(0),
              months,
              monthlyRatePercent: rate,
            }),
          );
        }
      }
    }
  });
});

describe("simulateSaving (D15)", () => {
  it("aporte informado → meses = ceil(falta / aporte)", () => {
    const r = simulateSaving({
      target: c(500000),
      saved: c(100000),
      monthlyContribution: c(30000),
      today: TODAY,
    });
    expect(r.ok && r.headline.value).toBe(14);
    expect(lineValue(r, "Mês previsto")).toBe("2027-12-01");
    expect(lineValue(r, "Falta juntar")).toBe(400000);
  });

  it("prazo informado → aporte = ceil(falta / meses)", () => {
    const r = simulateSaving({
      target: c(1000),
      saved: c(0),
      months: 3,
      today: TODAY,
    });
    expect(r.ok && r.headline.value).toBe(334);
  });

  it("objetivo já atingido → 0 meses", () => {
    const r = simulateSaving({
      target: c(1000),
      saved: c(1000),
      monthlyContribution: c(100),
      today: TODAY,
    });
    expect(r.ok && r.headline.value).toBe(0);
  });

  it("exige exatamente um entre aporte e prazo, e respeita limites", () => {
    const base = { target: c(1000), saved: c(0), today: TODAY };
    expect(
      simulateSaving({
        ...base,
        monthlyContribution: c(100),
        months: 3,
      } as never).ok,
    ).toBe(false);
    expect(simulateSaving({ ...base } as never).ok).toBe(false);
    expect(simulateSaving({ ...base, months: 0 }).ok).toBe(false);
    expect(simulateSaving({ ...base, monthlyContribution: c(0) }).ok).toBe(
      false,
    );
    expect(simulateSaving({ ...base, target: c(0), months: 3 }).ok).toBe(false);
    expect(
      simulateSaving({
        target: c(9_999_999_999),
        saved: c(0),
        monthlyContribution: c(1),
        today: TODAY,
      }),
    ).toEqual({ ok: false, error: "OUT_OF_RANGE" });
  });
});

describe("simulateGoalDeadline (D9 + D15)", () => {
  it("padrão: ritmo atual da meta (R15: 47 meses)", () => {
    const r = simulateGoalDeadline({ goal: baseline.goals[0]!, today: TODAY });
    expect(r.ok && r.headline.value).toBe(47);
    expect(lineValue(r, "Ritmo atual")).toBe(10000);
    expect(lineValue(r, "Mês previsto")).toBe("2030-09-01");
  });

  it("aporte informado + data-alvo: mostra o mínimo mensal", () => {
    const r = simulateGoalDeadline({
      goal: baseline.goals[1]!,
      monthly: c(25000),
      today: TODAY,
    });
    expect(r.ok && r.headline.value).toBe(4);
    expect(lineValue(r, "Aporte mensal")).toBe(25000);
    expect(lineValue(r, "Aporte mensal para chegar na data-alvo")).toBe(12500);
  });

  it("sem ritmo e sem aporte informado → NO_BASELINE; aporte ≤ 0 → OUT_OF_RANGE", () => {
    expect(
      simulateGoalDeadline({ goal: baseline.goals[1]!, today: TODAY }),
    ).toEqual({ ok: false, error: "NO_BASELINE" });
    expect(
      simulateGoalDeadline({
        goal: baseline.goals[1]!,
        monthly: c(0),
        today: TODAY,
      }),
    ).toEqual({ ok: false, error: "OUT_OF_RANGE" });
  });

  it("meta já atingida → texto, sem NaN", () => {
    const r = simulateGoalDeadline({
      goal: { ...baseline.goals[0]!, saved: c(500000) },
      today: TODAY,
    });
    expect(r.ok && r.headline.value).toBe("Meta já atingida");
    expectFinite(r);
  });
});

describe("simulateNewCommitment (D15)", () => {
  it("novo resultado = médio − valor; efeito em 12 meses = valor × 12", () => {
    const r = simulateNewCommitment({ monthly: c(30000), baseline });
    expect(r.ok && r.headline.value).toBe(228300);
    expect(lineValue(r, "Efeito em 12 meses")).toBe(360000);
    expect(lineValue(r, "Resultado médio mensal atual")).toBe(258300);
  });

  it("resultado pode ficar negativo", () => {
    const r = simulateNewCommitment({ monthly: c(300000), baseline });
    expect(r.ok && r.headline.value).toBe(-41700);
  });

  it("sem contas → NO_BASELINE; valor inválido → OUT_OF_RANGE", () => {
    expect(
      simulateNewCommitment({ monthly: c(100), baseline: noAccounts }),
    ).toEqual({ ok: false, error: "NO_BASELINE" });
    expect(simulateNewCommitment({ monthly: c(0), baseline })).toEqual({
      ok: false,
      error: "OUT_OF_RANGE",
    });
  });
});

describe("simulateReduction (D15)", () => {
  it("percentual: 10% de 800,00 = 80,00; 12,5% = 100,00; em 12 meses × 12", () => {
    const r = simulateReduction({ categoryId: "cat-1", percent: 10, baseline });
    expect(r.ok && r.headline.value).toBe(8000);
    expect(lineValue(r, "Economia em 12 meses")).toBe(96000);
    const r2 = simulateReduction({
      categoryId: "cat-1",
      percent: 12.5,
      baseline,
    });
    expect(r2.ok && r2.headline.value).toBe(10000);
  });

  it("percentual arredonda meio para cima em centavos", () => {
    const r = simulateReduction({
      categoryId: "cat-1",
      percent: 0.01,
      baseline: {
        ...baseline,
        categoryAverages: [
          { ...baseline.categoryAverages[0]!, average: c(5000) },
        ],
      },
    });
    // 5000 × 0,01% = 0,5 centavo → 1
    expect(r.ok && r.headline.value).toBe(1);
  });

  it("valor informado até a média", () => {
    const r = simulateReduction({
      categoryId: "cat-1",
      amount: c(80000),
      baseline,
    });
    expect(r.ok && r.headline.value).toBe(80000);
    expect(
      simulateReduction({ categoryId: "cat-1", amount: c(80001), baseline }).ok,
    ).toBe(false);
  });

  it("limites e base ausente", () => {
    expect(
      simulateReduction({ categoryId: "cat-1", percent: 0, baseline }).ok,
    ).toBe(false);
    expect(
      simulateReduction({ categoryId: "cat-1", percent: 100.01, baseline }).ok,
    ).toBe(false);
    expect(
      simulateReduction({ categoryId: "cat-1", percent: 0.001, baseline }).ok,
    ).toBe(false);
    expect(
      simulateReduction({
        categoryId: "cat-1",
        percent: 5,
        amount: c(1),
      } as never).ok,
    ).toBe(false);
    expect(
      simulateReduction({ categoryId: "nada", percent: 5, baseline }),
    ).toEqual({ ok: false, error: "NO_BASELINE" });
    expect(
      simulateReduction({
        categoryId: "cat-1",
        percent: 5,
        baseline: noAccounts,
      }),
    ).toEqual({ ok: false, error: "NO_BASELINE" });
  });
});

describe("projectBalance (D15)", () => {
  it("saldo acumula entradas − saídas do mês e o ajuste × k", () => {
    const r = projectBalance({ months: 3, monthlyAdjustment: c(0), baseline });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.rows.map((x) => x.balance)).toEqual([120000, 150000, 80000]);
    expect(r.rows[0]).toMatchObject({ income: 50000, expense: 30000 });
    expect(r.headline.value).toBe(80000);

    const adjusted = projectBalance({
      months: 3,
      monthlyAdjustment: c(-5000),
      baseline,
    });
    if (!adjusted.ok) throw new Error("esperava ok");
    expect(adjusted.rows.map((x) => x.balance)).toEqual([
      115000, 140000, 65000,
    ]);
  });

  it("1 mês usa só o primeiro", () => {
    const r = projectBalance({ months: 1, monthlyAdjustment: c(0), baseline });
    expect(r.ok && r.rows).toHaveLength(1);
  });

  it("limites e base ausente", () => {
    expect(
      projectBalance({ months: 0, monthlyAdjustment: c(0), baseline }),
    ).toEqual({ ok: false, error: "OUT_OF_RANGE" });
    expect(
      projectBalance({ months: 13, monthlyAdjustment: c(0), baseline }).ok,
    ).toBe(false);
    expect(
      projectBalance({
        months: 2,
        monthlyAdjustment: c(0),
        baseline: noAccounts,
      }),
    ).toEqual({ ok: false, error: "NO_BASELINE" });
    // a base tem só 3 meses: pedir 12 sem dados não inventa projeção
    expect(
      projectBalance({ months: 12, monthlyAdjustment: c(0), baseline }),
    ).toEqual({ ok: false, error: "NO_BASELINE" });
  });
});
