import { describe, expect, it } from "vitest";
import { parseISODate, type ISODate } from "@/lib/dates";
import { asCents, sumCents } from "@/lib/money";
import { previewInstallments } from "@/modules/transactions/domain/installments";

const d = (s: string): ISODate => {
  const parsed = parseISODate(s);
  if (!parsed) throw new Error(s);
  return parsed;
};

describe("previewInstallments (D23, R21, R22)", () => {
  it("R21: 100,00 em 3x = 33,34 / 33,33 / 33,33 e datas mensais", () => {
    const out = previewInstallments(asCents(10000), 3, d("2027-01-15"));
    expect(out).toEqual([
      { number: 1, date: "2027-01-15", amount: 3334 },
      { number: 2, date: "2027-02-15", amount: 3333 },
      { number: 3, date: "2027-03-15", amount: 3333 },
    ]);
  });

  it("R22: 1.000,00 em 6x = 166,67 x4 e 166,66 x2; dia 31 -> último dia do mês, sem encadear", () => {
    const out = previewInstallments(asCents(100000), 6, d("2027-01-31"));
    expect(out.map((p) => p.amount)).toEqual([
      16667, 16667, 16667, 16667, 16666, 16666,
    ]);
    expect(out.map((p) => p.date)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
      "2027-06-30",
    ]);
    expect(sumCents(out.map((p) => p.amount))).toBe(100000);
  });

  it("1.200,00 em 10x = 10 parcelas de 120,00", () => {
    const out = previewInstallments(asCents(120000), 10, d("2027-01-10"));
    expect(out.every((p) => p.amount === 12000)).toBe(true);
    expect(out).toHaveLength(10);
  });

  it("ano bissexto: 31/01/2028 -> 29/02/2028", () => {
    const out = previewInstallments(asCents(300), 2, d("2028-01-31"));
    expect(out[1]?.date).toBe("2028-02-29");
  });

  it.each([1, 37, 2.5, 0])("recusa %s parcelas", (n) => {
    expect(() =>
      previewInstallments(asCents(1000), n, d("2027-01-01")),
    ).toThrow(RangeError);
  });
});
