import { describe, expect, it } from "vitest";
import type { ISODate } from "@/lib/dates";
import { billStatusOf } from "./status";

const d = (s: string) => s as ISODate;
const today = d("2026-10-24");

describe("billStatusOf (D6)", () => {
  it("pending com vencimento futuro", () => {
    expect(
      billStatusOf(
        {
          status: "pending",
          transactionDate: d("2026-10-29"),
          dueDate: d("2026-10-29"),
        },
        today,
      ),
    ).toEqual({ status: "pending", days: 5 });
  });

  it("pending que vence hoje", () => {
    expect(
      billStatusOf(
        { status: "pending", transactionDate: today, dueDate: today },
        today,
      ),
    ).toEqual({ status: "due_today", days: 0 });
  });

  it("pending com data anterior a hoje é vencido, com dias negativos", () => {
    expect(
      billStatusOf(
        {
          status: "pending",
          transactionDate: d("2026-10-21"),
          dueDate: d("2026-10-21"),
        },
        today,
      ),
    ).toEqual({ status: "overdue", days: -3 });
  });

  it("dia seguinte e dia anterior na virada do mês e do ano", () => {
    const i = (date: string) => ({
      status: "pending" as const,
      transactionDate: d(date),
      dueDate: d(date),
    });
    expect(billStatusOf(i("2027-01-01"), d("2026-12-31"))).toEqual({
      status: "pending",
      days: 1,
    });
    expect(billStatusOf(i("2026-12-31"), d("2027-01-01"))).toEqual({
      status: "overdue",
      days: -1,
    });
  });

  it("paid e canceled nunca são vencidos; days usa o vencimento original", () => {
    expect(
      billStatusOf(
        { status: "paid", transactionDate: today, dueDate: d("2026-10-10") },
        today,
      ),
    ).toEqual({ status: "paid", days: -14 });
    expect(
      billStatusOf(
        {
          status: "canceled",
          transactionDate: d("2026-09-01"),
          dueDate: d("2026-09-01"),
        },
        today,
      ),
    ).toEqual({ status: "canceled", days: -53 });
  });

  it("paid sem due_date usa a data do lançamento", () => {
    expect(
      billStatusOf(
        { status: "paid", transactionDate: d("2026-10-25"), dueDate: null },
        today,
      ),
    ).toEqual({ status: "paid", days: 1 });
  });
});
