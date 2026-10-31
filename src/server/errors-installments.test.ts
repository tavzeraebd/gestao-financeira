import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ERROR_MESSAGES } from "@/server/error-messages";
import { toAppError } from "@/server/errors";

const pg = (code: string, message: string) => ({
  code,
  message,
  details: null,
  hint: null,
});

describe("toAppError (D23 parcelamento)", () => {
  it("INSTALLMENT_REQUIRES_CREDIT_CARD -> código próprio, erro no campo accountId", () => {
    const result = toAppError(pg("P0001", "INSTALLMENT_REQUIRES_CREDIT_CARD"));
    expect(result.code).toBe("INSTALLMENT_REQUIRES_CREDIT_CARD");
    expect(result.message).toBe("Parcelamento só em cartão de crédito.");
    expect(result.fieldErrors).toEqual({ accountId: [result.message] });
  });

  it("INSTALLMENT_AMOUNT_TOO_SMALL -> código próprio, erro no campo amount", () => {
    const result = toAppError(pg("P0001", "INSTALLMENT_AMOUNT_TOO_SMALL"));
    expect(result.code).toBe("INSTALLMENT_AMOUNT_TOO_SMALL");
    expect(result.fieldErrors).toEqual({
      amount: [ERROR_MESSAGES.INSTALLMENT_AMOUNT_TOO_SMALL],
    });
  });
});
