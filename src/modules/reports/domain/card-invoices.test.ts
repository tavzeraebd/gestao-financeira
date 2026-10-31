import { describe, expect, it } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import type { CommitmentEntry } from "../types";
import {
  allocateOpenDebt,
  cardInvoices,
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
  it("fecha 11, vence 16: antes do fechamento paga no mesmo mês; no dia ou depois, no seguinte", () => {
    expect(inv("2026-10-05", 11, 16)).toEqual(["2026-10-11", "2026-10-16"]);
    expect(inv("2026-10-10", 11, 16)).toEqual(["2026-10-11", "2026-10-16"]);
    expect(inv("2026-10-11", 11, 16)).toEqual(["2026-11-11", "2026-11-16"]);
    expect(inv("2026-10-12", 11, 16)).toEqual(["2026-11-11", "2026-11-16"]);
  });

  it("vencimento menor que o fechamento cai no mês seguinte ao fechamento", () => {
    expect(inv("2026-10-20", 25, 5)).toEqual(["2026-10-25", "2026-11-05"]);
    expect(inv("2026-10-24", 25, 5)).toEqual(["2026-10-25", "2026-11-05"]);
    expect(inv("2026-10-25", 25, 5)).toEqual(["2026-11-25", "2026-12-05"]);
    expect(inv("2026-10-26", 25, 5)).toEqual(["2026-11-25", "2026-12-05"]);
  });

  it("vira o ano", () => {
    expect(inv("2026-12-26", 25, 5)).toEqual(["2027-01-25", "2027-02-05"]);
    expect(inv("2026-12-25", 25, 5)).toEqual(["2027-01-25", "2027-02-05"]);
    expect(inv("2026-12-20", 25, 5)).toEqual(["2026-12-25", "2027-01-05"]);
  });

  it("dia 31 em mês curto vira o último dia do mês", () => {
    expect(inv("2027-02-10", 31, 10)).toEqual(["2027-02-28", "2027-03-10"]);
    expect(inv("2027-02-27", 31, 10)).toEqual(["2027-02-28", "2027-03-10"]);
    expect(inv("2027-02-28", 31, 10)).toEqual(["2027-03-31", "2027-04-10"]);
    expect(inv("2028-02-28", 31, 10)).toEqual(["2028-02-29", "2028-03-10"]);
    expect(inv("2028-02-29", 31, 10)).toEqual(["2028-03-31", "2028-04-10"]);
    expect(inv("2027-01-30", 31, 10)).toEqual(["2027-01-31", "2027-02-10"]);
    expect(inv("2027-02-06", 5, 31)).toEqual(["2027-03-05", "2027-03-31"]);
    expect(inv("2027-02-01", 5, 31)).toEqual(["2027-02-05", "2027-02-28"]);
  });

  it("fechamento 31 em setembro (fecha 30/09): 29/09 fecha no mês; 30/09 vai para outubro", () => {
    expect(inv("2026-09-29", 31, 10)).toEqual(["2026-09-30", "2026-10-10"]);
    expect(inv("2026-09-30", 31, 10)).toEqual(["2026-10-31", "2026-11-10"]);
  });

  it("vencimento igual ao fechamento paga no mês seguinte", () => {
    expect(inv("2026-10-09", 10, 10)).toEqual(["2026-10-10", "2026-11-10"]);
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

describe("cardInvoices (D25)", () => {
  // Fecha 11, vence 16; hoje 2026-10-20: ciclo aberto 11/10..10/11 (fecha 11/11, vence 16/11),
  // fatura fechada mais recente fecha 11/10 e vence 16/10.
  const base = {
    today: d("2026-10-20"),
    closingDay: 11,
    dueDay: 16,
    pendingInstallments: [],
  };

  it("fechada não paga + aberta", () => {
    const r = cardInvoices({
      ...base,
      debt: asCents(10000),
      purchases: [
        purchase("p3", "2026-10-15", 3000),
        purchase("p2", "2026-10-11", 2000),
        purchase("p1", "2026-10-10", 4000),
        purchase("p0", "2026-09-20", 8000),
      ],
    });
    expect(r.open).toEqual({
      closingDate: "2026-11-11",
      dueDate: "2026-11-16",
      amount: 5000,
    });
    expect(r.closed).toEqual({
      closingDate: "2026-10-11",
      dueDate: "2026-10-16",
      amount: 5000,
      overdue: true,
    });
  });

  it("pagamento adiantado: dívida menor que as compras do ciclo aberto", () => {
    const r = cardInvoices({
      ...base,
      debt: asCents(2500),
      purchases: [
        purchase("p2", "2026-10-15", 3000),
        purchase("p1", "2026-10-12", 2000),
      ],
    });
    expect(r.open.amount).toBe(2500);
    expect(r.closed.amount).toBe(0);
  });

  it("estorno no ciclo aberto: a compra já chega líquida e a dívida a cobre", () => {
    // Compra de 3000 estornada em 1000: líquido 2000; o saldo do cartão está em -2000.
    const r = cardInvoices({
      ...base,
      debt: asCents(2000),
      purchases: [purchase("p1", "2026-10-15", 2000)],
    });
    expect(r.open.amount).toBe(2000);
    expect(r.closed.amount).toBe(0);
  });

  it("saldo inicial sem compras vai para a fatura fechada", () => {
    const r = cardInvoices({ ...base, debt: asCents(7000), purchases: [] });
    expect(r.open.amount).toBe(0);
    expect(r.closed.amount).toBe(7000);
  });

  it("crédito a favor (dívida 0): fechada 0 e aberta só com as parcelas pendentes", () => {
    const r = cardInvoices({
      ...base,
      debt: asCents(0),
      purchases: [purchase("p1", "2026-10-15", 3000)],
      pendingInstallments: [{ date: d("2026-10-25"), amount: asCents(1200) }],
    });
    expect(r.open.amount).toBe(1200);
    expect(r.closed.amount).toBe(0);
  });

  it("parcela pendente entra na aberta só dentro do ciclo", () => {
    const r = cardInvoices({
      ...base,
      debt: asCents(3000),
      purchases: [purchase("p1", "2026-10-15", 3000)],
      pendingInstallments: [
        { date: d("2026-10-11"), amount: asCents(100) },
        { date: d("2026-11-10"), amount: asCents(200) },
        { date: d("2026-10-10"), amount: asCents(400) },
        { date: d("2026-11-11"), amount: asCents(800) },
      ],
    });
    expect(r.open.amount).toBe(3300);
    expect(r.closed.amount).toBe(0);
  });

  it("vencida: vencimento da fatura fechada anterior a hoje", () => {
    const r = cardInvoices({
      ...base,
      today: d("2026-10-17"),
      debt: asCents(500),
      purchases: [],
    });
    expect(r.closed.dueDate).toBe("2026-10-16");
    expect(r.closed.overdue).toBe(true);
    const onDue = cardInvoices({
      ...base,
      today: d("2026-10-16"),
      debt: asCents(500),
      purchases: [],
    });
    expect(onDue.closed.overdue).toBe(false);
  });

  it("hoje é o dia do fechamento: o ciclo recomeça e a fatura que fechou hoje é a fechada", () => {
    const r = cardInvoices({
      ...base,
      today: d("2026-10-11"),
      debt: asCents(4000),
      purchases: [
        purchase("p2", "2026-10-11", 1000),
        purchase("p1", "2026-10-10", 3000),
      ],
    });
    expect(r.open.closingDate).toBe("2026-11-11");
    expect(r.open.amount).toBe(1000);
    expect(r.closed).toMatchObject({
      closingDate: "2026-10-11",
      dueDate: "2026-10-16",
      amount: 3000,
    });
  });

  it("vencimento menor que o fechamento e virada de ano", () => {
    // Fecha 25, vence 5; hoje 2027-01-10: aberta fecha 25/01 (vence 05/02); fechada fechou 25/12 (vence 05/01).
    const r = cardInvoices({
      today: d("2027-01-10"),
      closingDay: 25,
      dueDay: 5,
      debt: asCents(9000),
      purchases: [
        purchase("p2", "2027-01-02", 1000),
        purchase("p1", "2026-12-24", 6000),
      ],
      pendingInstallments: [],
    });
    expect(r.open).toEqual({
      closingDate: "2027-01-25",
      dueDate: "2027-02-05",
      amount: 1000,
    });
    expect(r.closed).toEqual({
      closingDate: "2026-12-25",
      dueDate: "2027-01-05",
      amount: 8000,
      overdue: true,
    });
  });

  it("mês curto: fechamento 31 em fevereiro", () => {
    const r = cardInvoices({
      today: d("2027-03-05"),
      closingDay: 31,
      dueDay: 10,
      debt: asCents(100),
      purchases: [],
      pendingInstallments: [],
    });
    expect(r.open.closingDate).toBe("2027-03-31");
    expect(r.closed.closingDate).toBe("2027-02-28");
    expect(r.closed.dueDate).toBe("2027-03-10");
  });
});
