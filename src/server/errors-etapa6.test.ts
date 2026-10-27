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

describe("toAppError (Etapa 6)", () => {
  it.each([
    "GOAL_NOT_ACTIVE",
    "GOAL_NEGATIVE_PROGRESS",
    "SPLIT_NOT_ALLOWED",
    "SPLIT_SUM_MISMATCH",
    "MEMBER_INACTIVE",
  ] as const)("P0001 %s -> mesmo código, com a mensagem segura", (code) => {
    const result = toAppError(pg("P0001", code));
    expect(result.code).toBe(code);
    expect(result.message).toBe(ERROR_MESSAGES[code]);
  });

  it("GOAL_NEGATIVE_PROGRESS aponta para o campo amount", () => {
    expect(new AppError("GOAL_NEGATIVE_PROGRESS").fieldErrors).toEqual({
      amount: [ERROR_MESSAGES.GOAL_NEGATIVE_PROGRESS],
    });
  });

  it("mensagens do contrato §3.2", () => {
    expect(ERROR_MESSAGES.GOAL_NOT_ACTIVE).toBe(
      "Esta meta não está ativa. Reative-a para registrar aportes.",
    );
    expect(ERROR_MESSAGES.SPLIT_SUM_MISMATCH).toBe(
      "A soma das partes precisa ser igual ao valor da despesa.",
    );
    expect(ERROR_MESSAGES.MEMBER_INACTIVE).toMatch(/Atualize a página/);
  });
});
