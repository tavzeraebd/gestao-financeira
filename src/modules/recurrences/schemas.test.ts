import { describe, expect, it } from "vitest";

import { updateRecurrenceSchema } from "./schemas";

const base = {
  recurrenceId: "11111111-1111-4111-8111-111111111111",
  description: "Empréstimo consignado",
  amount: "500,00",
  accountId: "22222222-2222-4222-8222-222222222222",
  categoryId: "33333333-3333-4333-8333-333333333333",
};

describe("updateRecurrenceSchema: desconto em folha", () => {
  it("assume falso quando omitido", () => {
    const r = updateRecurrenceSchema.safeParse(base);
    expect(r.success && r.data.payrollDeduction).toBe(false);
  });

  it("aceita desconto em folha em despesa", () => {
    const r = updateRecurrenceSchema.safeParse({
      ...base,
      kind: "pagar",
      payrollDeduction: true,
    });
    expect(r.success && r.data.payrollDeduction).toBe(true);
  });

  it("recusa desconto em folha em receita, com mensagem no campo", () => {
    const r = updateRecurrenceSchema.safeParse({
      ...base,
      kind: "receber",
      payrollDeduction: true,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]?.path).toEqual(["payrollDeduction"]);
      expect(r.error.issues[0]?.message).toMatch(/só vale para despesa/);
    }
  });

  it("receita sem desconto em folha continua válida", () => {
    expect(
      updateRecurrenceSchema.safeParse({
        ...base,
        kind: "receber",
        payrollDeduction: false,
      }).success,
    ).toBe(true);
  });
});
