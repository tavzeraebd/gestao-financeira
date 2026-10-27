import { describe, expect, it } from "vitest";
import type { ISODate } from "@/lib/dates";
import { asCents, type Cents } from "@/lib/money";
import { estimateGoal } from "./estimate";

const c = (n: number): Cents => asCents(n);
const d = (s: string) => s as ISODate;
const TODAY = d("2026-10-24");

describe("estimateGoal (D9)", () => {
  it("R15: 300,00 de 5.000,00, líquido 300,00 em 90 dias → ritmo 100,00, 47 meses", () => {
    const e = estimateGoal({
      target: c(500000),
      saved: c(30000),
      netInWindow: c(30000),
      targetDate: null,
      today: TODAY,
    });
    expect(e.pace).toBe(10000);
    expect(e.paceSource).toBe("history");
    expect(e.months).toBe(47);
    expect(e.estimatedMonth).toBe("2030-09-01");
    expect(e.requiredMonthly).toBeNull();
    expect(e.targetDatePassed).toBe(false);
    expect(e.premise).toMatch(/Mantendo R\$\s100,00 por mês/);
    expect(e.premise).toMatch(/últimos 90 dias/);
  });

  it("ritmo arredonda meio para longe do zero", () => {
    const pace = (n: number) =>
      estimateGoal({
        target: c(1000),
        saved: c(0),
        netInWindow: c(n),
        targetDate: null,
        today: TODAY,
      }).pace;
    expect(pace(1)).toBe(0);
    expect(pace(2)).toBe(1);
    expect(pace(4)).toBe(1);
    expect(pace(5)).toBe(2);
    expect(pace(-5)).toBe(-2);
  });

  it("ritmo ≤ 0 ou restante 0 → sem estimativa", () => {
    const base = { target: c(10000), targetDate: null, today: TODAY };
    const zero = estimateGoal({ ...base, saved: c(0), netInWindow: c(0) });
    expect(zero.months).toBeNull();
    expect(zero.estimatedMonth).toBeNull();
    expect(zero.premise).toMatch(/Sem aportes líquidos/);
    const negative = estimateGoal({
      ...base,
      saved: c(0),
      netInWindow: c(-900),
    });
    expect(negative.months).toBeNull();
    const reached = estimateGoal({
      ...base,
      saved: c(10000),
      netInWindow: c(9000),
    });
    expect(reached.months).toBeNull();
    expect(reached.requiredMonthly).toBeNull();
  });

  it("meses = ceil(restante / ritmo)", () => {
    const e = estimateGoal({
      target: c(10001),
      saved: c(0),
      netInWindow: c(30000),
      targetDate: null,
      today: TODAY,
    });
    expect(e.months).toBe(2);
    expect(e.estimatedMonth).toBe("2026-12-01");
  });

  it("data-alvo: aporte necessário arredonda para cima; meses por diferença civil", () => {
    const e = estimateGoal({
      target: c(500000),
      saved: c(0),
      netInWindow: c(0),
      targetDate: d("2027-06-30"),
      today: TODAY,
    });
    expect(e.monthsToTarget).toBe(8);
    expect(e.requiredMonthly).toBe(62500);
    const odd = estimateGoal({
      target: c(1000),
      saved: c(0),
      netInWindow: c(0),
      targetDate: d("2027-01-15"),
      today: TODAY,
    });
    expect(odd.monthsToTarget).toBe(3);
    expect(odd.requiredMonthly).toBe(334);
  });

  it("data-alvo no mês atual ou anterior já passou", () => {
    for (const date of ["2026-10-31", "2026-10-01", "2026-01-01"]) {
      const e = estimateGoal({
        target: c(1000),
        saved: c(0),
        netInWindow: c(0),
        targetDate: d(date),
        today: TODAY,
      });
      expect(e.targetDatePassed).toBe(true);
      expect(e.requiredMonthly).toBeNull();
      expect(e.monthsToTarget).toBeNull();
    }
  });

  it("aporte mensal informado substitui o ritmo", () => {
    const e = estimateGoal({
      target: c(100000),
      saved: c(0),
      netInWindow: c(0),
      targetDate: null,
      today: TODAY,
      monthly: c(25000),
    });
    expect(e.paceSource).toBe("informed");
    expect(e.pace).toBe(25000);
    expect(e.months).toBe(4);
    expect(e.premise).toMatch(/informado/);
  });
});
