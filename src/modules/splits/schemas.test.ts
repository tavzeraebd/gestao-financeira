import { describe, expect, it } from "vitest";
import {
  setSplitSchema,
  settlementSchema,
  splitFiltersSchema,
} from "./schemas";

const tx = "5f3c1b7a-2a4e-4b1c-8c55-9a1e2d3f4b66";
const m = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];
const key = "0b9a4f0e-3c34-4c8e-9d52-6f1d4c2d7a11";

describe("setSplitSchema", () => {
  it("equal: 2..20 integrantes distintos", () => {
    expect(
      setSplitSchema.safeParse({
        mode: "equal",
        transactionId: tx,
        memberIds: [m[0]],
      }).success,
    ).toBe(false);
    expect(
      setSplitSchema.safeParse({
        mode: "equal",
        transactionId: tx,
        memberIds: [m[0], m[0]],
      }).success,
    ).toBe(false);
    expect(
      setSplitSchema.safeParse({
        mode: "equal",
        transactionId: tx,
        memberIds: [m[0], m[1]],
      }).success,
    ).toBe(true);
    const many = Array.from(
      { length: 21 },
      (_, i) => `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`,
    );
    expect(
      setSplitSchema.safeParse({
        mode: "equal",
        transactionId: tx,
        memberIds: many,
      }).success,
    ).toBe(false);
  });

  it("amounts: valores positivos em centavos e integrantes distintos", () => {
    const r = setSplitSchema.safeParse({
      mode: "amounts",
      transactionId: tx,
      shares: [
        { memberId: m[0], amount: "30,00" },
        { memberId: m[1], amount: "60,00" },
      ],
    });
    expect(
      r.success &&
        r.data.mode === "amounts" &&
        r.data.shares.map((s) => s.amount),
    ).toEqual([3000, 6000]);
    expect(
      setSplitSchema.safeParse({
        mode: "amounts",
        transactionId: tx,
        shares: [
          { memberId: m[0], amount: "0,00" },
          { memberId: m[1], amount: "60,00" },
        ],
      }).success,
    ).toBe(false);
    expect(
      setSplitSchema.safeParse({
        mode: "amounts",
        transactionId: tx,
        shares: [
          { memberId: m[0], amount: "1,00" },
          { memberId: m[0], amount: "2,00" },
        ],
      }).success,
    ).toBe(false);
  });

  it("none só precisa do lançamento; modo desconhecido é rejeitado", () => {
    expect(
      setSplitSchema.safeParse({ mode: "none", transactionId: tx }).success,
    ).toBe(true);
    expect(
      setSplitSchema.safeParse({ mode: "weights", transactionId: tx }).success,
    ).toBe(false);
  });
});

describe("settlementSchema", () => {
  const base = {
    fromMemberId: m[0],
    toMemberId: m[1],
    amount: "50,00",
    settlementDate: "2026-01-10",
    idempotencyKey: key,
  };

  it("aceita um acerto válido", () => {
    const r = settlementSchema.safeParse(base);
    expect(r.success && r.data.amount).toBe(5000);
  });

  it("de = para dá erro no campo toMemberId", () => {
    const r = settlementSchema.safeParse({ ...base, toMemberId: m[0] });
    expect(!r.success && r.error.issues[0]?.path).toEqual(["toMemberId"]);
  });

  it("data futura e valor zero são rejeitados", () => {
    expect(
      settlementSchema.safeParse({ ...base, settlementDate: "2999-01-01" })
        .success,
    ).toBe(false);
    expect(
      settlementSchema.safeParse({ ...base, amount: "0,00" }).success,
    ).toBe(false);
  });
});

describe("splitFiltersSchema", () => {
  it("parâmetros inválidos caem no padrão", () => {
    expect(
      splitFiltersSchema.parse({ situacao: "x", pagina: "0", por_pagina: "7" }),
    ).toEqual({
      situacao: "todas",
      pagina: 1,
      por_pagina: 20,
    });
    expect(
      splitFiltersSchema.parse({
        situacao: "pagas",
        pagina: "3",
        por_pagina: "50",
      }),
    ).toEqual({
      situacao: "pagas",
      pagina: 3,
      por_pagina: 50,
    });
  });
});
