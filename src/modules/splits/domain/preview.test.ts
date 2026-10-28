import { describe, expect, it } from "vitest";
import { asCents, sumCents, type Cents } from "@/lib/money";
import { amountSplitDifference, previewEqualSplit } from "./preview";

const c = (n: number): Cents => asCents(n);
const amounts = (total: number, n: number) =>
  previewEqualSplit(
    c(total),
    Array.from({ length: n }, (_, i) => `m${i}`),
  ).map((p) => p.amount);

describe("previewEqualSplit (D13)", () => {
  it("R6: 100,00 em 3 → 33,34 · 33,33 · 33,33", () => {
    expect(amounts(10000, 3)).toEqual([3334, 3333, 3333]);
  });

  it("R16: 200,00 em 3 → 66,67 · 66,67 · 66,66; estorno 50,00 → 16,67 · 16,67 · 16,66", () => {
    expect(amounts(20000, 3)).toEqual([6667, 6667, 6666]);
    expect(amounts(5000, 3)).toEqual([1667, 1667, 1666]);
  });

  it("7 partes de 1,00 → 0,15 · 0,15 · 0,14 × 5", () => {
    expect(amounts(100, 7)).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it("mantém os ids na ordem recebida e a soma é exata (2..20 partes)", () => {
    const ids = ["b", "a", "c"];
    expect(previewEqualSplit(c(10000), ids).map((p) => p.memberId)).toEqual(
      ids,
    );
    for (let n = 2; n <= 20; n += 1) {
      for (const total of [1, 99, 100, 10001, 9_999_999_999]) {
        expect(sumCents(amounts(total, n))).toBe(total);
      }
    }
  });
});

describe("amountSplitDifference", () => {
  it("0 fecha; positivo falta; negativo passou", () => {
    expect(amountSplitDifference(c(9000), [c(3000), c(6000)])).toBe(0);
    expect(amountSplitDifference(c(9000), [c(3000), c(5000)])).toBe(1000);
    expect(amountSplitDifference(c(9000), [c(3000), c(7000)])).toBe(-1000);
    expect(amountSplitDifference(c(9000), [])).toBe(9000);
  });
});
