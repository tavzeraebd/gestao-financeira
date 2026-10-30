import { describe, expect, it } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { CommitmentEntry } from "../types";
import {
  allocateOpenDebt,
  invoiceOf,
  openPurchaseEntries,
  withInvoice,
  type CardPurchase,
  type CardTerms,
} from "./card-invoices";

const d = (s: string) => s as ISODate;
const inv = (date: string, c: number, v: number) => {
  const r = invoiceOf(d(date), c, v);
  return [r.closingDate, r.dueDate];
};

describe("invoiceOf (D24)", () => {
  it("fecha 11, vence 16: até o fechamento paga no mesmo mês; depois, no seguinte", () => {
    expect(inv("2026-10-05", 11, 16)).toEqual(["2026-10-11", "2026-10-16"]);
    expect(inv("2026-10-11", 11, 16)).toEqual(["2026-10-11", "2026-10-16"]);
    expect(inv("2026-10-12", 11, 16)).toEqual(["2026-11-11", "2026-11-16"]);
  });

  it("vencimento menor que o fechamento cai no mês seguinte ao fechamento", () => {
    expect(inv("2026-10-20", 25, 5)).toEqual(["2026-10-25", "2026-11-05"]);
    expect(inv("2026-10-26", 25, 5)).toEqual(["2026-11-25", "2026-12-05"]);
  });

  it("vira o ano", () => {
    expect(inv("2026-12-26", 25, 5)).toEqual(["2027-01-25", "2027-02-05"]);
    expect(inv("2026-12-20", 25, 5)).toEqual(["2026-12-25", "2027-01-05"]);
  });

  it("dia 31 em mês curto vira o último dia do mês", () => {
    expect(inv("2027-02-10", 31, 10)).toEqual(["2027-02-28", "2027-03-10"]);
    expect(inv("2028-02-29", 31, 10)).toEqual(["2028-02-29", "2028-03-10"]);
    expect(inv("2027-01-30", 31, 10)).toEqual(["2027-01-31", "2027-02-10"]);
    expect(inv("2027-02-06", 5, 31)).toEqual(["2027-03-05", "2027-03-31"]);
    expect(inv("2027-02-01", 5, 31)).toEqual(["2027-02-05", "2027-02-28"]);
  });

  it("vencimento igual ao fechamento paga no mês seguinte", () => {
    expect(inv("2026-10-10", 10, 10)).toEqual(["2026-10-10", "2026-11-10"]);
  });
});

const purchase = (id: string, date: string, cents: number): CardPurchase => ({
  id,
  accountId: "card",
  description: id,
  amount: asCents(cents),
  date: d(date),
  categoryId: "c1",
});

describe("allocateOpenDebt", () => {
  const list = [
    purchase("p3", "2026-10-20", 3000),
    purchase("p2", "2026-10-10", 2000),
    purchase("p1", "2026-09-30", 5000),
  ];

  it("dívida zero não aloca nada", () => {
    const r = allocateOpenDebt(list, asCents(0));
    expect(r.open).toEqual([]);
    expect(r.covered).toBe(true);
  });

  it("aloca as mais recentes e a última entra com o residual", () => {
    const r = allocateOpenDebt(list, asCents(4000));
    expect(r.open.map((p) => [p.id, p.amount])).toEqual([
      ["p3", 3000],
      ["p2", 1000],
    ]);
    expect(r.covered).toBe(true);
  });

  it("dívida igual à soma exata das compras recentes não deixa residual", () => {
    const r = allocateOpenDebt(list, asCents(5000));
    expect(r.open.map((p) => p.id)).toEqual(["p3", "p2"]);
  });

  it("histórico insuficiente marca como não coberto, sem quebrar", () => {
    const r = allocateOpenDebt(list, asCents(20000));
    expect(r.open).toHaveLength(3);
    expect(r.covered).toBe(false);
  });
});

const card: CardTerms = {
  id: "card",
  name: "Visa",
  closingDay: 11,
  dueDay: 16,
};

describe("withInvoice / openPurchaseEntries", () => {
  it("move a despesa para o vencimento da fatura e guarda a data da compra", () => {
    const e: CommitmentEntry = {
      type: "expense",
      amount: asCents(1000),
      date: d("2026-10-12"),
      categoryId: "c1",
      description: "x",
      origin: "bill",
      sourceId: "t1",
    };
    const r = withInvoice(e, card);
    expect(r.date).toBe("2026-11-16");
    expect(r.purchaseDate).toBe("2026-10-12");
    expect(r.invoiceMonth).toBe("2026-11-01");
    expect(r.cardName).toBe("Visa");
    expect(withInvoice({ ...e, type: "income" }, card).date).toBe("2026-10-12");
    expect(withInvoice(e, undefined)).toBe(e);
  });

  it("compras em aberto viram entradas de origem cartão no mês da fatura", () => {
    const r = openPurchaseEntries(
      [purchase("p2", "2026-10-12", 3000), purchase("p1", "2026-10-05", 2000)],
      card,
      asCents(4000),
    );
    expect(
      r.entries.map((e) => [e.origin, e.date, e.purchaseDate, e.amount]),
    ).toEqual([
      ["card", "2026-11-16", "2026-10-12", 3000],
      ["card", "2026-10-16", "2026-10-05", 1000],
    ]);
  });
});
