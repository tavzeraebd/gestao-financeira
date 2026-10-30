import { describe, expect, it } from "vitest";

import type { ISODate } from "@/lib/dates";
import { nextPayrollOccurrence } from "./payroll-schedule";

const d = (s: string) => s as ISODate;
const base = {
  frequency: "monthly" as const,
  intervalCount: 1,
  startDate: d("2026-01-05"),
  endDate: null,
};

describe("nextPayrollOccurrence", () => {
  it("devolve a próxima data da agenda a partir de hoje", () => {
    expect(nextPayrollOccurrence(base, d("2026-10-30"))).toBe("2026-11-05");
    expect(nextPayrollOccurrence(base, d("2026-11-05"))).toBe("2026-11-05");
  });

  it("série que ainda não começou devolve o início", () => {
    expect(
      nextPayrollOccurrence(
        { ...base, startDate: d("2027-02-10") },
        d("2026-10-30"),
      ),
    ).toBe("2027-02-10");
  });

  it("respeita o término: depois do último desconto não há próxima", () => {
    const s = { ...base, endDate: d("2026-12-05") };
    expect(nextPayrollOccurrence(s, d("2026-12-05"))).toBe("2026-12-05");
    expect(nextPayrollOccurrence(s, d("2026-12-06"))).toBeNull();
  });
});
