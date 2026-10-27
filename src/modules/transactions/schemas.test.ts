import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { addDays, today } from "@/lib/dates";
import {
  reverseTransactionSchema,
  transactionFiltersSchema,
  transactionInputSchema,
  updateTransactionSchema,
} from "@/modules/transactions/schemas";

const A = "123e4567-e89b-42d3-a456-426614174001";
const B = "123e4567-e89b-42d3-a456-426614174002";
const C = "123e4567-e89b-42d3-a456-426614174003";
const KEY = "123e4567-e89b-42d3-a456-426614174099";

const expense = {
  type: "expense",
  description: "  Supermercado ",
  amount: "1.234,56",
  transactionDate: today(),
  accountId: A,
  categoryId: C,
  idempotencyKey: KEY,
} as const;

const transfer = {
  type: "transfer",
  description: "Reserva",
  amount: "100,00",
  transactionDate: today(),
  accountId: A,
  destinationAccountId: B,
  idempotencyKey: KEY,
} as const;

function fieldErrors(
  input: unknown,
  schema: z.ZodType = transactionInputSchema,
) {
  const result = schema.safeParse(input);
  if (result.success) return null;
  const out: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

describe("transactionInputSchema", () => {
  it("despesa válida produz Cents, apara texto e trata opcionais vazios", () => {
    const parsed = transactionInputSchema.parse({
      ...expense,
      assignedMemberId: "",
      notes: "   ",
    });
    expect(parsed).toMatchObject({
      type: "expense",
      description: "Supermercado",
      amount: 123456,
      accountId: A,
      categoryId: C,
      assignedMemberId: undefined,
      notes: undefined,
    });
  });

  it("transferência válida não tem categoria", () => {
    const parsed = transactionInputSchema.parse(transfer);
    expect(parsed).toMatchObject({ type: "transfer", amount: 10000 });
    expect("categoryId" in parsed).toBe(false);
  });

  it.each([["0"], [""], ["-5"], ["1,234.56"], ["10,999"], ["abc"]])(
    "CA-E3-32: valor %j é rejeitado no campo amount",
    (amount) => {
      const errors = fieldErrors({ ...expense, amount });
      expect(errors?.amount?.length).toBeGreaterThan(0);
      expect(Object.keys(errors ?? {})).toEqual(["amount"]);
    },
  );

  it("CA-E3-32: transferência com origem = destino -> erro em destinationAccountId", () => {
    const errors = fieldErrors({ ...transfer, destinationAccountId: A });
    expect(errors).toEqual({
      destinationAccountId: [
        "A conta de destino deve ser diferente da conta de origem.",
      ],
    });
  });

  it("data futura, inexistente e descrição vazia/longa", () => {
    expect(
      fieldErrors({ ...expense, transactionDate: addDays(today(), 1) }),
    ).toEqual({
      transactionDate: ["A data não pode ser futura."],
    });
    expect(
      fieldErrors({ ...expense, transactionDate: "2026-02-30" })
        ?.transactionDate,
    ).toBeDefined();
    expect(
      fieldErrors({ ...expense, description: "   " })?.description,
    ).toBeDefined();
    expect(
      fieldErrors({ ...expense, description: "x".repeat(121) })?.description,
    ).toBeDefined();
    expect(
      fieldErrors({ ...expense, notes: "x".repeat(1001) })?.notes,
    ).toBeDefined();
  });

  it("exige idempotencyKey uuid, tipo válido e categoria na despesa", () => {
    expect(
      fieldErrors({ ...expense, idempotencyKey: "x" })?.idempotencyKey,
    ).toBeDefined();
    expect(
      transactionInputSchema.safeParse({ ...expense, type: "x" }).success,
    ).toBe(false);
    const { categoryId: _omit, ...withoutCategory } = expense;
    void _omit;
    expect(fieldErrors(withoutCategory)?.categoryId).toBeDefined();
  });

  it("ignora family_id vindo do cliente (campo removido)", () => {
    const parsed = transactionInputSchema.parse({
      ...expense,
      familyId: A,
      family_id: A,
    });
    expect(Object.keys(parsed)).not.toContain("familyId");
    expect(Object.keys(parsed)).not.toContain("family_id");
  });
});

describe("updateTransactionSchema", () => {
  it("exige transactionId e não pede idempotencyKey", () => {
    const { idempotencyKey: _k, ...body } = expense;
    void _k;
    expect(
      updateTransactionSchema.safeParse({ ...body, transactionId: A }).success,
    ).toBe(true);
    expect(
      fieldErrors(body, updateTransactionSchema)?.transactionId,
    ).toBeDefined();
  });

  it("transferência com origem = destino -> erro em destinationAccountId", () => {
    const { idempotencyKey: _k, ...body } = transfer;
    void _k;
    expect(
      fieldErrors(
        { ...body, transactionId: C, destinationAccountId: A },
        updateTransactionSchema,
      ),
    ).toEqual({
      destinationAccountId: [
        "A conta de destino deve ser diferente da conta de origem.",
      ],
    });
  });
});

describe("reverseTransactionSchema", () => {
  it("valida valor positivo, data e descrição opcional", () => {
    expect(
      reverseTransactionSchema.parse({
        transactionId: A,
        amount: "50,00",
        transactionDate: today(),
        description: "",
        idempotencyKey: KEY,
      }),
    ).toMatchObject({ amount: 5000, description: undefined });
    expect(
      reverseTransactionSchema.safeParse({
        transactionId: A,
        amount: "0",
        transactionDate: today(),
        idempotencyKey: KEY,
      }).success,
    ).toBe(false);
  });
});

describe("transactionFiltersSchema (tolerante)", () => {
  const defaults = { ordem: "data_desc", pagina: 1, por_pagina: 20 };

  it("sem parâmetros -> padrões", () => {
    expect(transactionFiltersSchema.parse({})).toEqual(defaults);
    expect(transactionFiltersSchema.parse(undefined)).toEqual(defaults);
    expect(transactionFiltersSchema.parse("lixo")).toEqual(defaults);
  });

  it("valores válidos passam", () => {
    expect(
      transactionFiltersSchema.parse({
        de: "2026-10-01",
        ate: "2026-10-31",
        tipo: "despesa",
        conta: A,
        categoria: B,
        responsavel: "nenhum",
        q: "  mercado ",
        ordem: "valor_asc",
        pagina: "3",
        por_pagina: "50",
      }),
    ).toEqual({
      de: "2026-10-01",
      ate: "2026-10-31",
      tipo: "despesa",
      conta: A,
      categoria: B,
      responsavel: "nenhum",
      q: "mercado",
      ordem: "valor_asc",
      pagina: 3,
      por_pagina: 50,
    });
    expect(transactionFiltersSchema.parse({ responsavel: C }).responsavel).toBe(
      C,
    );
  });

  it("valores inválidos viram o padrão e nunca lançam", () => {
    expect(
      transactionFiltersSchema.parse({
        de: "2026-02-30",
        ate: "ontem",
        tipo: "pizza",
        conta: "x",
        categoria: "y",
        responsavel: "todos",
        q: "x".repeat(101),
        ordem: "aleatoria",
        pagina: "-2",
        por_pagina: "7",
      }),
    ).toEqual(defaults);
    expect(
      transactionFiltersSchema.parse({
        pagina: "abc",
        por_pagina: ["20", "50"],
        q: ["a"],
        conta: ["x"],
      }),
    ).toEqual(defaults);
    expect(transactionFiltersSchema.parse({ pagina: "1.5" }).pagina).toBe(1);
    expect(transactionFiltersSchema.parse({ q: "   " }).q).toBeUndefined();
  });
});
