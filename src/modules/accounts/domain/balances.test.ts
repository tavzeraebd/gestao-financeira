import { describe, expect, it } from "vitest";
import { asCents } from "@/lib/money";
import {
  availableCredit,
  consolidatedBalance,
  openCardDebt,
} from "@/modules/accounts/domain/balances";

const c = asCents;

describe("D3 saldo consolidado", () => {
  it("soma contas de ativo e deixa os cartões de fora", () => {
    expect(
      consolidatedBalance([
        { type: "checking", balance: c(120000) },
        { type: "savings", balance: c(10000) },
        { type: "credit_card", balance: c(-30000) },
      ]),
    ).toBe(c(130000));
  });

  it("sem contas vale zero", () => {
    expect(consolidatedBalance([])).toBe(c(0));
  });
});

describe("D8 faturas em aberto e limite", () => {
  it("soma −saldo só dos cartões com dívida", () => {
    expect(
      openCardDebt([
        { type: "credit_card", balance: c(-30000) },
        { type: "credit_card", balance: c(-5000) },
        { type: "credit_card", balance: c(0) },
        { type: "checking", balance: c(-9900) },
      ]),
    ).toBe(c(35000));
  });

  it("limite disponível = limite + saldo, só para cartão com limite", () => {
    expect(availableCredit("credit_card", c(500000), c(-30000))).toBe(
      c(470000),
    );
    expect(availableCredit("credit_card", null, c(-30000))).toBeNull();
    expect(availableCredit("checking", c(500000), c(0))).toBeNull();
  });
});
