import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { addDays, today } from "@/lib/dates";
import {
  accountIdSchema,
  createAccountSchema,
  updateAccountSchema,
} from "@/modules/accounts/schemas";

const ID = "123e4567-e89b-42d3-a456-426614174001";

const checking = {
  name: " Conta principal ",
  type: "checking",
  openingBalance: "1.000,00",
  openingBalanceDate: today(),
} as const;

const card = {
  name: "Cartão Azul",
  type: "credit_card",
  openingBalance: "350,00",
  openingBalanceDate: today(),
  creditLimit: "5.000,00",
  statementClosingDay: "10",
  statementDueDay: 17,
} as const;

function fieldErrors(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) return null;
  const out: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    (out[String(issue.path[0] ?? "")] ??= []).push(issue.message);
  }
  return out;
}

describe("createAccountSchema", () => {
  it("conta corrente: apara o nome, aceita saldo negativo (cheque especial) e ignora campos de cartão", () => {
    const parsed = createAccountSchema.parse({
      ...checking,
      openingBalance: "-250,00",
      institutionName: "",
      creditLimit: "1.000,00",
      statementClosingDay: "5",
    });
    expect(parsed).toMatchObject({
      name: "Conta principal",
      type: "checking",
      openingBalance: -25000,
      institutionName: undefined,
      creditLimit: undefined,
      statementClosingDay: undefined,
      statementDueDay: undefined,
    });
  });

  it("cartão: dívida informada positiva é gravada <= 0", () => {
    const parsed = createAccountSchema.parse(card);
    expect(parsed).toMatchObject({
      type: "credit_card",
      openingBalance: -35000,
      creditLimit: 500000,
      statementClosingDay: 10,
      statementDueDay: 17,
    });
    expect(
      createAccountSchema.parse({ ...card, openingBalance: "0" })
        .openingBalance,
    ).toBe(0);
  });

  it("cartão: dívida negativa é rejeitada no campo openingBalance", () => {
    expect(
      fieldErrors(createAccountSchema, { ...card, openingBalance: "-10,00" }),
    ).toEqual({
      openingBalance: ["O valor não pode ser negativo."],
    });
  });

  it("CA-E3-32: cartão sem dia de fechamento ou vencimento -> erro no campo", () => {
    expect(
      fieldErrors(createAccountSchema, {
        ...card,
        statementClosingDay: undefined,
      }),
    ).toEqual({
      statementClosingDay: ["Informe o dia de fechamento da fatura."],
    });
    expect(
      fieldErrors(createAccountSchema, { ...card, statementDueDay: "" }),
    ).toEqual({ statementDueDay: ["Informe o dia de vencimento da fatura."] });
  });

  it.each([[0], [32], ["abc"], [1.5], ["-3"]])(
    "dia %j fora de 1..31 é rejeitado",
    (day) => {
      expect(
        fieldErrors(createAccountSchema, { ...card, statementClosingDay: day })
          ?.statementClosingDay,
      ).toEqual(["Informe um dia entre 1 e 31."]);
    },
  );

  it("limite do cartão deve ser maior que zero", () => {
    expect(
      fieldErrors(createAccountSchema, { ...card, creditLimit: "0" })
        ?.creditLimit,
    ).toEqual(["Informe um valor maior que zero."]);
  });

  it("valida nome, tipo e data (não futura)", () => {
    expect(
      fieldErrors(createAccountSchema, { ...checking, name: "  " })?.name,
    ).toBeDefined();
    expect(
      fieldErrors(createAccountSchema, { ...checking, name: "x".repeat(61) })
        ?.name,
    ).toBeDefined();
    expect(
      fieldErrors(createAccountSchema, { ...checking, type: "poupanca" })?.type,
    ).toBeDefined();
    expect(
      fieldErrors(createAccountSchema, {
        ...checking,
        openingBalanceDate: addDays(today(), 1),
      })?.openingBalanceDate,
    ).toEqual(["A data não pode ser futura."]);
    expect(
      fieldErrors(createAccountSchema, {
        ...checking,
        openingBalance: "1,234.56",
      })?.openingBalance,
    ).toBeDefined();
  });

  it("não aceita nem repassa family_id", () => {
    const parsed = createAccountSchema.parse({
      ...checking,
      familyId: ID,
      family_id: ID,
    });
    expect(Object.keys(parsed)).not.toContain("familyId");
    expect(Object.keys(parsed)).not.toContain("family_id");
  });
});

describe("updateAccountSchema", () => {
  it("não tem type; saldo sai com o sinal digitado (o service interpreta pelo tipo do banco)", () => {
    const parsed = updateAccountSchema.parse({
      accountId: ID,
      name: "Conta",
      openingBalance: "350,00",
      openingBalanceDate: today(),
      statementClosingDay: "3",
    });
    expect(parsed).toMatchObject({
      openingBalance: 35000,
      statementClosingDay: 3,
    });
    expect("type" in parsed).toBe(false);
  });

  it("exige accountId uuid", () => {
    expect(
      fieldErrors(updateAccountSchema, {
        accountId: "x",
        name: "Conta",
        openingBalance: "0",
        openingBalanceDate: today(),
      })?.accountId,
    ).toBeDefined();
  });
});

describe("accountIdSchema", () => {
  it("valida uuid", () => {
    expect(accountIdSchema.safeParse({ accountId: ID }).success).toBe(true);
    expect(accountIdSchema.safeParse({ accountId: "1" }).success).toBe(false);
  });
});
