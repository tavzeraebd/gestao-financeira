import { describe, expect, it } from "vitest";
import { budgetIdSchema } from "@/modules/budgets/schemas";
import {
  budgetInputSchema,
  budgetMonthSchema,
  updateBudgetSchema,
} from "@/modules/budgets/schemas";
import {
  endRecurrenceSchema,
  recurrenceFiltersSchema,
  updateRecurrenceSchema,
} from "@/modules/recurrences/schemas";
import {
  billFiltersSchema,
  billFormSchema,
  payBillSchema,
  updateBillSchema,
} from "./schemas";

const uuid = "3f2b8f3e-1c1a-4b6e-9d57-0a1b2c3d4e5f";
const base = {
  kind: "pagar",
  description: "  Aluguel ",
  amount: "1.500,00",
  dueDate: "2999-01-31",
  accountId: uuid,
  categoryId: uuid,
  idempotencyKey: uuid,
} as const;

describe("billFormSchema", () => {
  it("compromisso avulso: vencimento futuro vale e valor vira centavos", () => {
    const r = billFormSchema.parse({ ...base, repeat: false, notes: " obs " });
    expect(r).toMatchObject({
      description: "Aluguel",
      amount: 150000,
      dueDate: "2999-01-31",
      notes: "obs",
    });
  });

  it("repeat true acrescenta a série, intervalo padrão 1 e descarta notes", () => {
    const r = billFormSchema.parse({
      ...base,
      repeat: true,
      frequency: "monthly",
      notes: "ignorada",
    });
    expect(r).toMatchObject({
      repeat: true,
      frequency: "monthly",
      intervalCount: 1,
    });
    expect("notes" in r).toBe(false);
  });

  it("intervalo fora de 1..12 e frequência inválida são rejeitados", () => {
    const serie = { ...base, repeat: true, frequency: "weekly" };
    expect(
      billFormSchema.safeParse({ ...serie, intervalCount: 0 }).success,
    ).toBe(false);
    expect(
      billFormSchema.safeParse({ ...serie, intervalCount: 13 }).success,
    ).toBe(false);
    expect(
      billFormSchema.safeParse({ ...serie, intervalCount: 12 }).success,
    ).toBe(true);
    expect(
      billFormSchema.safeParse({ ...serie, frequency: "daily" }).success,
    ).toBe(false);
  });

  it("endDate anterior ao vencimento dá erro no campo endDate", () => {
    const r = billFormSchema.safeParse({
      ...base,
      repeat: true,
      frequency: "monthly",
      endDate: "2998-12-31",
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["endDate"]);
    expect(
      billFormSchema.safeParse({
        ...base,
        repeat: true,
        frequency: "monthly",
        endDate: "2999-01-31",
      }).success,
    ).toBe(true);
  });

  it("rejeita valor zero, tipo inválido, data antes de 2000 e campo family_id não vaza", () => {
    expect(
      billFormSchema.safeParse({ ...base, repeat: false, amount: "0" }).success,
    ).toBe(false);
    expect(
      billFormSchema.safeParse({ ...base, repeat: false, kind: "x" }).success,
    ).toBe(false);
    expect(
      billFormSchema.safeParse({
        ...base,
        repeat: false,
        dueDate: "1999-12-31",
      }).success,
    ).toBe(false);
    const r = billFormSchema.parse({ ...base, repeat: false, familyId: uuid });
    expect("familyId" in r).toBe(false);
  });
});

describe("updateBillSchema / payBillSchema", () => {
  it("update aceita vencimento futuro", () => {
    expect(
      updateBillSchema.safeParse({
        transactionId: uuid,
        description: "x",
        amount: "10,00",
        dueDate: "2999-01-01",
        accountId: uuid,
        categoryId: uuid,
      }).success,
    ).toBe(true);
  });

  it("pagamento não aceita data futura", () => {
    const input = { transactionId: uuid, amount: "10,00", accountId: uuid };
    expect(
      payBillSchema.safeParse({ ...input, paidOn: "2999-01-01" }).success,
    ).toBe(false);
    expect(
      payBillSchema.safeParse({ ...input, paidOn: "2026-01-01" }).success,
    ).toBe(true);
  });
});

describe("billFiltersSchema", () => {
  it("padrões e tolerância", () => {
    expect(billFiltersSchema.parse({})).toEqual({
      situacao: "abertos",
      pagina: 1,
      por_pagina: 20,
    });
    expect(
      billFiltersSchema.parse({
        tipo: "lixo",
        situacao: "vencidos",
        de: "2026-13-01",
        serie: "nao-uuid",
        pagina: "-3",
        por_pagina: "7",
      }),
    ).toEqual({ situacao: "vencidos", pagina: 1, por_pagina: 20 });
    expect(
      billFiltersSchema.parse({
        tipo: "receber",
        serie: uuid,
        por_pagina: "50",
      }),
    ).toMatchObject({
      tipo: "receber",
      serie: uuid,
      por_pagina: 50,
    });
  });
});

describe("recurrences schemas", () => {
  it("updateRecurrence aceita null para responsável e término", () => {
    const r = updateRecurrenceSchema.parse({
      recurrenceId: uuid,
      description: "Netflix",
      amount: "39,90",
      accountId: uuid,
      categoryId: uuid,
      assignedMemberId: null,
      endDate: null,
    });
    expect(r.amount).toBe(3990);
    expect(r.assignedMemberId).toBeNull();
  });

  it("endRecurrence exige data válida; filtros caem no padrão", () => {
    expect(
      endRecurrenceSchema.safeParse({
        recurrenceId: uuid,
        endDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      endRecurrenceSchema.safeParse({
        recurrenceId: uuid,
        endDate: "2026-12-31",
      }).success,
    ).toBe(true);
    expect(recurrenceFiltersSchema.parse({ situacao: "pausadas" })).toEqual({
      situacao: "pausadas",
    });
    expect(recurrenceFiltersSchema.parse({ situacao: "x" })).toEqual({
      situacao: "ativas",
    });
  });
});

describe("budgets schemas", () => {
  it("YYYY-MM vira o dia 1; categoryId null = todas as despesas", () => {
    expect(
      budgetInputSchema.parse({
        categoryId: null,
        amountLimit: "500,00",
        startMonth: "2026-10",
        endMonth: "2027-02",
      }),
    ).toEqual({
      categoryId: null,
      amountLimit: 50000,
      startMonth: "2026-10-01",
      endMonth: "2027-02-01",
    });
  });

  it("endMonth antes de startMonth dá erro no campo; mês inválido é rejeitado", () => {
    const r = budgetInputSchema.safeParse({
      categoryId: uuid,
      amountLimit: "1,00",
      startMonth: "2026-10",
      endMonth: "2026-09",
    });
    expect(r.error?.issues[0]?.path).toEqual(["endMonth"]);
    expect(
      budgetInputSchema.safeParse({
        categoryId: uuid,
        amountLimit: "1,00",
        startMonth: "2026-13",
      }).success,
    ).toBe(false);
    expect(
      budgetInputSchema.safeParse({
        categoryId: uuid,
        amountLimit: "1,00",
        startMonth: "1999-12",
      }).success,
    ).toBe(false);
  });

  it("updateBudget aceita endMonth null; id inválido é rejeitado", () => {
    expect(
      updateBudgetSchema.parse({
        budgetId: uuid,
        amountLimit: "10,00",
        endMonth: null,
      }).endMonth,
    ).toBeNull();
    expect(budgetIdSchema.safeParse({ budgetId: "x" }).success).toBe(false);
  });

  it("budgetMonthSchema: padrão é o mês atual e arquivados=sim liga o filtro", () => {
    expect(
      budgetMonthSchema.parse({ mes: "2026-03", arquivados: "sim" }),
    ).toEqual({
      mes: "2026-03-01",
      arquivados: true,
    });
    const fallback = budgetMonthSchema.parse({
      mes: "lixo",
      arquivados: "nao",
    });
    expect(fallback.mes).toMatch(/^\d{4}-\d{2}-01$/);
    expect(fallback.arquivados).toBe(false);
    expect(budgetMonthSchema.parse({}).mes).toBe(fallback.mes);
  });
});
