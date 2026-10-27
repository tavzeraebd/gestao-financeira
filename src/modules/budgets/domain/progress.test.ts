import { describe, expect, it } from "vitest";
import { asCents, type Cents } from "@/lib/money";
import { budgetProgress } from "./progress";

const c = (n: number): Cents => asCents(n);

describe("budgetProgress (D14)", () => {
  it("dentro do limite", () => {
    expect(budgetProgress(c(50000), c(10000), c(0))).toEqual({
      available: 40000,
      percent: 20,
      status: "ok",
    });
  });

  it("79,99% ainda é ok; 80% exato é atenção", () => {
    expect(budgetProgress(c(10000), c(7999), c(0)).status).toBe("ok");
    expect(budgetProgress(c(10000), c(8000), c(0)).status).toBe("attention");
  });

  it("100% exato é atenção; acima é estourado", () => {
    expect(budgetProgress(c(10000), c(10000), c(0))).toMatchObject({
      available: 0,
      status: "attention",
    });
    expect(budgetProgress(c(10000), c(10001), c(0))).toMatchObject({
      available: -1,
      status: "exceeded",
    });
  });

  it("acima do limite tem disponível negativo", () => {
    const p = budgetProgress(c(50000), c(56000), c(0));
    expect(p.available).toBe(-6000);
    expect(p.percent).toBeCloseTo(112);
    expect(p.status).toBe("exceeded");
  });

  it("realizado zero ou negativo (estorno maior que a despesa) é ok", () => {
    expect(budgetProgress(c(10000), c(0), c(0)).status).toBe("ok");
    expect(budgetProgress(c(10000), c(-500), c(0))).toMatchObject({
      available: 10500,
      percent: -5,
      status: "ok",
    });
  });

  it("o previsto não altera disponível, percentual nem estado", () => {
    expect(budgetProgress(c(10000), c(5000), c(99999))).toEqual(
      budgetProgress(c(10000), c(5000), c(0)),
    );
  });

  it("limite zero não divide por zero", () => {
    expect(budgetProgress(c(0), c(100), c(0)).percent).toBeNull();
  });

  it("valores no teto não perdem precisão", () => {
    expect(
      budgetProgress(c(9_999_999_999), c(9_999_999_999), c(0)).status,
    ).toBe("attention");
    expect(
      budgetProgress(c(9_999_999_998), c(9_999_999_999), c(0)).status,
    ).toBe("exceeded");
  });
});
