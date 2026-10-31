import { describe, expect, it } from "vitest";

import type { ISODate } from "@/lib/dates";
import { invoiceMonthLabel } from "@/modules/reports/domain/invoice-month-label";

const d = (s: string) => s as ISODate;

const MONTHS: [string, string, string][] = [
  ["01", "janeiro", "jan"],
  ["02", "fevereiro", "fev"],
  ["03", "março", "mar"],
  ["04", "abril", "abr"],
  ["05", "maio", "mai"],
  ["06", "junho", "jun"],
  ["07", "julho", "jul"],
  ["08", "agosto", "ago"],
  ["09", "setembro", "set"],
  ["10", "outubro", "out"],
  ["11", "novembro", "nov"],
  ["12", "dezembro", "dez"],
];

describe("invoiceMonthLabel", () => {
  it.each(MONTHS)("mês %s", (mm, long, short) => {
    expect(invoiceMonthLabel(d(`2026-${mm}-05`), "long")).toBe(
      `Fatura de ${long}`,
    );
    expect(invoiceMonthLabel(d(`2026-${mm}-05`), "short")).toBe(
      `Fatura ${short}/26`,
    );
  });

  it("virada de ano e último dia do mês", () => {
    expect(invoiceMonthLabel(d("2026-12-31"), "short")).toBe("Fatura dez/26");
    expect(invoiceMonthLabel(d("2027-01-01"), "short")).toBe("Fatura jan/27");
    expect(invoiceMonthLabel(d("2027-01-01"), "long")).toBe(
      "Fatura de janeiro",
    );
  });
});
