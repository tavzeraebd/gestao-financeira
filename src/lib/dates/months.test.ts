import { describe, expect, it } from "vitest";
import { addMonths, diffInDays, formatMonthBR, type ISODate } from "@/lib/dates";

const d = (s: string) => s as ISODate;

describe("addMonths", () => {
  it.each([
    ["2026-10-24", 1, "2026-11-24"],
    ["2026-10-24", -10, "2025-12-24"],
    ["2026-01-31", 1, "2026-02-28"],
    ["2028-01-31", 1, "2028-02-29"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2026-12-15", 1, "2027-01-15"],
    ["2026-01-15", -1, "2025-12-15"],
    ["2026-05-31", 1, "2026-06-30"],
    ["2026-10-24", 0, "2026-10-24"],
    ["2026-10-24", 24, "2028-10-24"],
  ])("%s + %i meses = %s", (from, n, expected) => {
    expect(addMonths(d(from), n)).toBe(expected);
  });

  it("rejeita meses fracionários", () => {
    expect(() => addMonths(d("2026-10-24"), 1.5)).toThrow(RangeError);
  });
});

describe("diffInDays", () => {
  it("b - a", () => {
    expect(diffInDays(d("2026-10-01"), d("2026-10-31"))).toBe(30);
    expect(diffInDays(d("2026-10-31"), d("2026-10-01"))).toBe(-30);
    expect(diffInDays(d("2026-10-01"), d("2026-10-01"))).toBe(0);
  });

  it("atravessa ano bissexto e virada de ano", () => {
    expect(diffInDays(d("2028-02-28"), d("2028-03-01"))).toBe(2);
    expect(diffInDays(d("2026-02-28"), d("2026-03-01"))).toBe(1);
    expect(diffInDays(d("2025-12-31"), d("2026-01-01"))).toBe(1);
    expect(diffInDays(d("2025-10-31"), d("2026-10-31"))).toBe(365);
  });
});

describe("formatMonthBR", () => {
  it("short e long", () => {
    expect(formatMonthBR(d("2026-10-24"), "short")).toBe("out.");
    expect(formatMonthBR(d("2026-10-01"), "long")).toBe("outubro de 2026");
    expect(formatMonthBR(d("2026-03-31"), "long")).toBe("março de 2026");
  });
});
