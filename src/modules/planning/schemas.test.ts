import { describe, expect, it } from "vitest";
import {
  financingSchema,
  projectionSchema,
  reductionSchema,
  savingSchema,
} from "./schemas";

describe("financingSchema", () => {
  const ok = { value: "80.000,00", downPayment: "20.000,00", months: "36", monthlyRate: "1,5" };

  it("converte texto em centavos, meses e taxa (vírgula decimal)", () => {
    const r = financingSchema.safeParse(ok);
    expect(r.success && r.data).toEqual({ value: 8000000, downPayment: 2000000, months: 36, monthlyRate: 1.5 });
  });

  it("entrada ≥ valor, prazo fora da faixa e taxa inválida", () => {
    const entrada = financingSchema.safeParse({ ...ok, downPayment: "80.000,00" });
    expect(!entrada.success && entrada.error.issues[0]?.path).toEqual(["downPayment"]);
    expect(financingSchema.safeParse({ ...ok, months: "481" }).success).toBe(false);
    expect(financingSchema.safeParse({ ...ok, months: "0" }).success).toBe(false);
    expect(financingSchema.safeParse({ ...ok, months: "1e2" }).success).toBe(false);
    expect(financingSchema.safeParse({ ...ok, monthlyRate: "21" }).success).toBe(false);
    expect(financingSchema.safeParse({ ...ok, monthlyRate: "1,23456" }).success).toBe(false);
    expect(financingSchema.safeParse({ ...ok, monthlyRate: "-1" }).success).toBe(false);
    expect(financingSchema.safeParse({ ...ok, monthlyRate: "0" }).success).toBe(true);
  });
});

describe("savingSchema", () => {
  it("exatamente um entre aporte e prazo; campos vazios viram undefined", () => {
    const withContribution = savingSchema.safeParse({ target: "1.000,00", saved: "", monthlyContribution: "100,00", months: "" });
    expect(withContribution.success && withContribution.data.monthlyContribution).toBe(10000);
    expect(withContribution.success && withContribution.data.months).toBeUndefined();
    expect(savingSchema.safeParse({ target: "1.000,00", saved: "", monthlyContribution: "", months: "10" }).success).toBe(true);
    expect(savingSchema.safeParse({ target: "1.000,00", saved: "", monthlyContribution: "", months: "" }).success).toBe(false);
    expect(savingSchema.safeParse({ target: "1.000,00", saved: "", monthlyContribution: "10,00", months: "10" }).success).toBe(false);
  });
});

describe("reductionSchema", () => {
  const cat = "5f3c1b7a-2a4e-4b1c-8c55-9a1e2d3f4b66";

  it("percentual com vírgula ou valor, nunca os dois", () => {
    const r = reductionSchema.safeParse({ categoryId: cat, percent: "12,5", amount: "" });
    expect(r.success && r.data.percent).toBe(12.5);
    expect(reductionSchema.safeParse({ categoryId: cat, percent: "", amount: "50,00" }).success).toBe(true);
    expect(reductionSchema.safeParse({ categoryId: cat, percent: "10", amount: "50,00" }).success).toBe(false);
    expect(reductionSchema.safeParse({ categoryId: cat, percent: "", amount: "" }).success).toBe(false);
    expect(reductionSchema.safeParse({ categoryId: cat, percent: "0", amount: "" }).success).toBe(false);
    expect(reductionSchema.safeParse({ categoryId: cat, percent: "101", amount: "" }).success).toBe(false);
  });
});

describe("projectionSchema", () => {
  it("1..12 meses; ajuste vazio = 0 e aceita negativo", () => {
    expect(projectionSchema.parse({ months: "6", monthlyAdjustment: "" })).toEqual({ months: 6, monthlyAdjustment: 0 });
    expect(projectionSchema.parse({ months: "12", monthlyAdjustment: "-50,00" }).monthlyAdjustment).toBe(-5000);
    expect(projectionSchema.safeParse({ months: "13", monthlyAdjustment: "" }).success).toBe(false);
    expect(projectionSchema.safeParse({ months: "0", monthlyAdjustment: "" }).success).toBe(false);
  });
});
