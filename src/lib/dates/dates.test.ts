import { describe, expect, it } from "vitest";
import {
  addDays,
  APP_TIME_ZONE,
  compareISODate,
  endOfMonth,
  formatDateBR,
  isISODate,
  isoToLocalDate,
  localDateToISO,
  parseISODate,
  startOfMonth,
  today,
  type ISODate,
} from "@/lib/dates";

const d = (s: string) => s as ISODate;

describe("today (America/Sao_Paulo)", () => {
  it("usa o fuso do app", () => {
    expect(APP_TIME_ZONE).toBe("America/Sao_Paulo");
  });

  it("CA-E3-31: 02:30Z do dia 24 ainda é dia 23 em São Paulo", () => {
    expect(today(new Date("2026-10-24T02:30:00Z"))).toBe("2026-10-23");
  });

  it("vira o dia às 03:00Z (UTC-3)", () => {
    expect(today(new Date("2026-10-24T02:59:59Z"))).toBe("2026-10-23");
    expect(today(new Date("2026-10-24T03:00:00Z"))).toBe("2026-10-24");
  });

  it("virada de ano e de mês", () => {
    expect(today(new Date("2026-01-01T02:59:59Z"))).toBe("2025-12-31");
    expect(today(new Date("2026-03-01T02:00:00Z"))).toBe("2026-02-28");
  });

  it("29/02 de ano bissexto", () => {
    expect(today(new Date("2028-03-01T02:00:00Z"))).toBe("2028-02-29");
  });

  it("sem argumento devolve uma data ISO válida", () => {
    expect(isISODate(today())).toBe(true);
  });
});

describe("regime de caixa: a data civil do lançamento, não a do servidor", () => {
  it("uma compra feita às 23:30 em São Paulo conta no dia da compra, mesmo já sendo outro dia em UTC", () => {
    const purchase = new Date("2026-10-24T02:30:00Z"); // 23:30 de 23/10 em São Paulo
    expect(purchase.toISOString().slice(0, 10)).toBe("2026-10-24"); // armadilha proibida
    expect(today(purchase)).toBe("2026-10-23");
    // O período do mês é decidido pela data civil: continua em outubro.
    expect(startOfMonth(today(purchase))).toBe("2026-10-01");
    expect(endOfMonth(today(purchase))).toBe("2026-10-31");
  });

  it("uma compra no último minuto do mês não vaza para o mês seguinte", () => {
    const purchase = new Date("2026-11-01T02:59:00Z"); // 23:59 de 31/10 em São Paulo
    expect(today(purchase)).toBe("2026-10-31");
    expect(compareISODate(today(purchase), endOfMonth(d("2026-10-01")))).toBe(
      0,
    );
  });
});

describe("parseISODate / isISODate", () => {
  it.each(["2026-10-23", "2028-02-29", "2000-01-01", "2026-12-31"])(
    "aceita %s",
    (s) => {
      expect(parseISODate(s)).toBe(s);
      expect(isISODate(s)).toBe(true);
    },
  );

  it.each([
    "2026-02-30",
    "2027-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-10-00",
    "2026-10-32",
    "26-10-23",
    "2026-1-1",
    "2026/10/23",
    "23/10/2026",
    "2026-10-23T00:00:00Z",
    " 2026-10-23",
    "",
    "abc",
  ])("rejeita %j", (s) => {
    expect(parseISODate(s)).toBeNull();
    expect(isISODate(s)).toBe(false);
  });
});

describe("formatDateBR", () => {
  it("short e long", () => {
    expect(formatDateBR(d("2026-10-23"))).toBe("23/10/2026");
    expect(formatDateBR(d("2026-10-23"), "short")).toBe("23/10/2026");
    expect(formatDateBR(d("2026-10-23"), "long")).toBe("23 de out. de 2026");
    expect(formatDateBR(d("2026-01-05"), "short")).toBe("05/01/2026");
    expect(formatDateBR(d("2026-03-05"), "long")).toBe("5 de mar. de 2026");
  });
});

describe("addDays", () => {
  it("atravessa mês, ano e bissexto", () => {
    expect(addDays(d("2026-10-23"), 1)).toBe("2026-10-24");
    expect(addDays(d("2026-10-31"), 1)).toBe("2026-11-01");
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(d("2027-02-28"), 1)).toBe("2027-03-01");
    expect(addDays(d("2026-10-23"), -1)).toBe("2026-10-22");
    expect(addDays(d("2026-01-01"), -1)).toBe("2025-12-31");
    expect(addDays(d("2026-10-23"), 0)).toBe("2026-10-23");
    expect(addDays(d("2026-10-23"), 365)).toBe("2027-10-23");
  });
});

describe("startOfMonth / endOfMonth", () => {
  it("fevereiro bissexto e comum", () => {
    expect(startOfMonth(d("2028-02-15"))).toBe("2028-02-01");
    expect(endOfMonth(d("2028-02-15"))).toBe("2028-02-29");
    expect(endOfMonth(d("2027-02-15"))).toBe("2027-02-28");
    expect(endOfMonth(d("1900-02-10"))).toBe("1900-02-28");
    expect(endOfMonth(d("2000-02-10"))).toBe("2000-02-29");
  });

  it("meses de 30 e 31 dias e dezembro", () => {
    expect(endOfMonth(d("2026-04-10"))).toBe("2026-04-30");
    expect(endOfMonth(d("2026-10-10"))).toBe("2026-10-31");
    expect(endOfMonth(d("2026-12-10"))).toBe("2026-12-31");
    expect(startOfMonth(d("2026-12-31"))).toBe("2026-12-01");
  });
});

describe("isoToLocalDate / localDateToISO", () => {
  it("ida e volta pela data civil", () => {
    const local = isoToLocalDate(d("2026-10-23"));
    expect(local.getFullYear()).toBe(2026);
    expect(local.getMonth()).toBe(9);
    expect(local.getDate()).toBe(23);
    expect(localDateToISO(local)).toBe("2026-10-23");
    expect(localDateToISO(isoToLocalDate(d("2028-02-29")))).toBe("2028-02-29");
  });

  it("localDateToISO usa os campos locais (não UTC)", () => {
    expect(localDateToISO(new Date(2026, 0, 1, 23, 59))).toBe("2026-01-01");
  });
});

describe("compareISODate", () => {
  it("ordena", () => {
    expect(compareISODate(d("2026-10-22"), d("2026-10-23"))).toBe(-1);
    expect(compareISODate(d("2026-10-23"), d("2026-10-23"))).toBe(0);
    expect(compareISODate(d("2027-01-01"), d("2026-12-31"))).toBe(1);
  });
});
