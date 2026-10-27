import { describe, expect, it } from "vitest";
import { formatPercent } from "./percent";

describe("formatPercent", () => {
  it("1 casa por padrão, vírgula decimal", () => {
    expect(formatPercent(12.5)).toBe("12,5%");
    expect(formatPercent(12)).toBe("12,0%");
    expect(formatPercent(0)).toBe("0,0%");
    expect(formatPercent(-3.25)).toMatch(/^[-−]3,3%$|^[-−]3,2%$/);
  });

  it("signDisplay exceptZero mostra + e omite no zero", () => {
    expect(formatPercent(12, { signDisplay: "exceptZero" })).toBe("+12,0%");
    expect(formatPercent(0, { signDisplay: "exceptZero" })).toBe("0,0%");
  });

  it("maximumFractionDigits", () => {
    expect(formatPercent(12.56, { maximumFractionDigits: 0 })).toBe("13%");
    expect(formatPercent(12.567, { maximumFractionDigits: 2 })).toBe("12,57%");
  });
});
