import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ERROR_MESSAGES } from "@/server/error-messages";
import { AppError, toAppError } from "@/server/errors";

const pg = (code: string, message: string) => ({
  code,
  message,
  details: null,
  hint: null,
});

describe("toAppError (Etapa 5)", () => {
  it.each([
    "INVALID_STATUS_TRANSITION",
    "RECURRENCE_LIMIT_REACHED",
    "NOT_FOUND",
  ] as const)("P0001 %s -> mesmo código, com a mensagem segura", (code) => {
    const result = toAppError(pg("P0001", code));
    expect(result.code).toBe(code);
    expect(result.message).toBe(ERROR_MESSAGES[code]);
  });

  it("23503 (FK violada) -> VALIDATION_ERROR com a mensagem segura", () => {
    const result = toAppError(
      pg("23503", 'insert violates foreign key constraint "x_fkey"'),
    );
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.message).toBe(ERROR_MESSAGES.VALIDATION_ERROR);
    expect(result.message).not.toMatch(/foreign key|x_fkey/);
  });

  it("BUDGET_ALREADY_EXISTS aponta para o campo categoryId", () => {
    const error = new AppError("BUDGET_ALREADY_EXISTS");
    expect(error.fieldErrors).toEqual({
      categoryId: [ERROR_MESSAGES.BUDGET_ALREADY_EXISTS],
    });
    expect(error.message).toMatch(/Edite o existente/);
  });

  it("P0001 SPLIT_AMOUNT_TOO_SMALL -> código próprio, com erro no campo amount", () => {
    const result = toAppError(pg("P0001", "SPLIT_AMOUNT_TOO_SMALL"));
    expect(result.code).toBe("SPLIT_AMOUNT_TOO_SMALL");
    expect(result.message).toBe(ERROR_MESSAGES.SPLIT_AMOUNT_TOO_SMALL);
    expect(result.fieldErrors).toEqual({
      amount: [ERROR_MESSAGES.SPLIT_AMOUNT_TOO_SMALL],
    });
    expect(result.message).toMatch(/Remova a divisão ou aumente o valor/);
  });

  it("mensagens novas dizem o próximo passo", () => {
    expect(ERROR_MESSAGES.INVALID_STATUS_TRANSITION).toMatch(
      /Atualize a página/,
    );
    expect(ERROR_MESSAGES.RECURRENCE_LIMIT_REACHED).toMatch(/100 recorrências/);
    expect(ERROR_MESSAGES.CATEGORY_IN_USE).toMatch(
      /lançamentos, recorrências ou orçamentos/,
    );
  });
});
