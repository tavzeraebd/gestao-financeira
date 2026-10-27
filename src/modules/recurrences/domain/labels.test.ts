import { describe, expect, it } from "vitest";
import type { ISODate } from "@/lib/dates";
import { ATTENTION_MESSAGES } from "../constants";
import { frequencyLabel } from "./labels";

const d = (s: string) => s as ISODate;

describe("frequencyLabel", () => {
  it.each([
    ["weekly", 1, "2026-10-23", "Toda semana (sexta-feira)"],
    ["weekly", 1, "2026-10-26", "Toda semana (segunda-feira)"],
    ["weekly", 2, "2026-10-23", "A cada 2 semanas"],
    ["monthly", 1, "2026-01-31", "Todo mês, dia 31"],
    ["monthly", 3, "2026-10-10", "A cada 3 meses, dia 10"],
    ["yearly", 1, "2024-02-29", "Todo ano, 29/02"],
    ["yearly", 2, "2026-03-05", "A cada 2 anos, 05/03"],
  ] as const)("%s x%i desde %s -> %s", (frequency, interval, start, label) => {
    expect(frequencyLabel(frequency, interval, d(start))).toBe(label);
  });
});

describe("ATTENTION_MESSAGES", () => {
  it("cobre os códigos de falha da materialização com próximo passo", () => {
    for (const code of [
      "ACCOUNT_ARCHIVED",
      "CATEGORY_ARCHIVED",
      "INVALID_INPUT",
      "DATE_BEFORE_OPENING_BALANCE",
      "RECURRENCE_AUTHOR_INACTIVE",
      "INTERNAL_ERROR",
    ]) {
      expect(ATTENTION_MESSAGES[code]).toBeTruthy();
    }
  });
});
