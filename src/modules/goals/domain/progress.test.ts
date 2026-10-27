import { describe, expect, it } from "vitest";
import { asCents, type Cents } from "@/lib/money";
import { goalProgress } from "./progress";

const c = (n: number): Cents => asCents(n);

describe("goalProgress (D9)", () => {
  it("R15: 300,00 de 5.000,00 → 6%, restante 4.700,00", () => {
    expect(goalProgress(c(500000), c(30000))).toEqual({
      percent: 6,
      remaining: 470000,
      reached: false,
    });
  });

  it("atingida: restante 0 e % pode passar de 100", () => {
    expect(goalProgress(c(10000), c(10000))).toEqual({
      percent: 100,
      remaining: 0,
      reached: true,
    });
    const over = goalProgress(c(10000), c(15000));
    expect(over.percent).toBe(150);
    expect(over.remaining).toBe(0);
    expect(over.reached).toBe(true);
  });

  it("nada guardado", () => {
    expect(goalProgress(c(10000), c(0))).toEqual({
      percent: 0,
      remaining: 10000,
      reached: false,
    });
  });

  it("alvo 0 não gera NaN: % null e não atingida", () => {
    expect(goalProgress(c(0), c(0))).toEqual({
      percent: null,
      remaining: 0,
      reached: false,
    });
  });
});
