import { describe, expect, it } from "vitest";
import { directionOf } from "@/modules/transactions/domain/effect";

const base = { accountId: "a", destinationAccountId: null, isReversal: false };

describe("directionOf (D1/D5)", () => {
  it("receita entra e despesa sai", () => {
    expect(directionOf({ ...base, type: "income" })).toBe("in");
    expect(directionOf({ ...base, type: "expense" })).toBe("out");
  });

  it("estorno inverte o sentido", () => {
    expect(directionOf({ ...base, type: "expense", isReversal: true })).toBe(
      "in",
    );
    expect(directionOf({ ...base, type: "income", isReversal: true })).toBe(
      "out",
    );
  });

  it("transferência é neutra, salvo com filtro de conta", () => {
    const transfer = {
      ...base,
      type: "transfer" as const,
      destinationAccountId: "b",
    };
    expect(directionOf(transfer)).toBe("neutral");
    expect(directionOf({ ...transfer, accountFilterId: "a" })).toBe("out");
    expect(directionOf({ ...transfer, accountFilterId: "b" })).toBe("in");
    expect(directionOf({ ...transfer, accountFilterId: "z" })).toBe("neutral");
  });
});
