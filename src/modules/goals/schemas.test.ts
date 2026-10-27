import { describe, expect, it } from "vitest";
import {
  contributionSchema,
  goalFiltersSchema,
  goalInputSchema,
  updateGoalSchema,
} from "./schemas";

const key = "0b9a4f0e-3c34-4c8e-9d52-6f1d4c2d7a11";
const id = "5f3c1b7a-2a4e-4b1c-8c55-9a1e2d3f4b66";
const valid = {
  name: "Viagem",
  targetAmount: "5.000,00",
  icon: "plane",
  targetDate: "",
  idempotencyKey: key,
};

describe("goalInputSchema", () => {
  it("aceita meta sem data-alvo e converte o valor em centavos", () => {
    const r = goalInputSchema.safeParse(valid);
    expect(r.success && r.data.targetAmount).toBe(500000);
    expect(r.success && r.data.targetDate).toBeUndefined();
  });

  it("rejeita nome vazio, ícone fora da lista e valor zero", () => {
    expect(goalInputSchema.safeParse({ ...valid, name: "  " }).success).toBe(
      false,
    );
    expect(
      goalInputSchema.safeParse({ ...valid, icon: "rocket" }).success,
    ).toBe(false);
    expect(
      goalInputSchema.safeParse({ ...valid, targetAmount: "0,00" }).success,
    ).toBe(false);
  });

  it("data-alvo anterior a hoje é rejeitada na criação, mas não na edição", () => {
    const r = goalInputSchema.safeParse({ ...valid, targetDate: "2020-01-01" });
    expect(r.success).toBe(false);
    expect(!r.success && r.error.issues[0]?.path).toEqual(["targetDate"]);
    const edit = updateGoalSchema.safeParse({
      goalId: id,
      name: "Viagem",
      targetAmount: "10,00",
      icon: "plane",
      targetDate: "2020-01-01",
    });
    expect(edit.success).toBe(true);
  });

  it("não tem family_id", () => {
    const r = goalInputSchema.safeParse({ ...valid, familyId: id });
    expect(r.success && "familyId" in r.data).toBe(false);
  });
});

describe("contributionSchema", () => {
  const base = {
    goalId: id,
    kind: "deposit",
    amount: "100,00",
    contributionDate: "2026-01-10",
    idempotencyKey: key,
  };

  it("memberId omitido ou vazio vira undefined", () => {
    expect(contributionSchema.safeParse(base).success).toBe(true);
    const r = contributionSchema.safeParse({ ...base, memberId: "" });
    expect(r.success && r.data.memberId).toBeUndefined();
  });

  it("data futura e tipo inválido são rejeitados", () => {
    expect(
      contributionSchema.safeParse({ ...base, contributionDate: "2999-01-01" })
        .success,
    ).toBe(false);
    expect(
      contributionSchema.safeParse({ ...base, kind: "transfer" }).success,
    ).toBe(false);
  });
});

describe("goalFiltersSchema", () => {
  it("parâmetros inválidos caem no padrão", () => {
    expect(goalFiltersSchema.parse({ situacao: "x", pagina: "-3" })).toEqual({
      situacao: "ativas",
      pagina: 1,
    });
    expect(goalFiltersSchema.parse({ situacao: "todas", pagina: "2" })).toEqual(
      {
        situacao: "todas",
        pagina: 2,
      },
    );
  });
});
