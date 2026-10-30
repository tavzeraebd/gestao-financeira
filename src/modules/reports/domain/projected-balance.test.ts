import { describe, expect, it } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { CommitmentMonth } from "../types";
import { buildProjectedBalance } from "./projected-balance";

const month = (
  m: string,
  committed: number,
  income: number,
): CommitmentMonth => ({
  month: `${m}-01` as ISODate,
  label: m,
  longLabel: `mês ${m}`,
  pending: asCents(committed),
  recurring: asCents(0),
  payroll: asCents(0),
  cashCommitted: asCents(committed),
  committed: asCents(committed),
  income: asCents(income),
  percent: null,
});

describe("buildProjectedBalance", () => {
  it("não subtrai o desconto em folha: usa só o comprometido de caixa", () => {
    const withPayroll: CommitmentMonth = {
      ...month("2026-11", 30000, 0),
      payroll: asCents(70000),
      committed: asCents(100000),
    };
    const r = buildProjectedBalance(asCents(100000), [withPayroll]);
    expect(r.months[0]?.balance).toBe(70000);
  });

  it("acumula receita e comprometido a partir do saldo atual", () => {
    const r = buildProjectedBalance(asCents(100000), [
      month("2026-10", 30000, 10000),
      month("2026-11", 50000, 0),
      month("2026-12", 0, 40000),
    ]);
    expect(r.months.map((m) => m.balance)).toEqual([80000, 30000, 70000]);
    expect(r.months.some((m) => m.negative)).toBe(false);
  });

  it("sinaliza meses negativos", () => {
    const r = buildProjectedBalance(asCents(10000), [
      month("2026-10", 5000, 0),
      month("2026-11", 20000, 0),
      month("2026-12", 0, 12000),
    ]);
    expect(r.months.map((m) => m.negative)).toEqual([false, true, true]);
    expect(r.months[2]?.balance).toBe(-3000);
  });

  it("saldo inicial negativo mantém todos os meses negativos", () => {
    const r = buildProjectedBalance(asCents(-100), [
      month("2026-10", 0, 0),
      month("2026-11", 0, 0),
    ]);
    expect(r.months.every((m) => m.negative)).toBe(true);
  });

  it("sem meses: nenhuma projeção", () => {
    expect(buildProjectedBalance(asCents(5), []).months).toEqual([]);
  });
});
