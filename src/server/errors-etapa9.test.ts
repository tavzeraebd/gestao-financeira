import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ERROR_MESSAGES } from "@/server/error-messages";
import { toAppError } from "@/server/errors";

describe("errors: códigos P0001 da Etapa 9 (CA-E9-38)", () => {
  it.each(["VOLUME_LIMIT_REACHED", "REAUTH_REQUIRED", "RATE_LIMITED"] as const)(
    "%s do banco vira o código com a mensagem pt-BR",
    (code) => {
      const e = toAppError({ code: "P0001", message: code, details: null });
      expect(e.code).toBe(code);
      expect(e.message).toBe(ERROR_MESSAGES[code]);
    },
  );

  it("mensagens novas dizem o próximo passo", () => {
    expect(ERROR_MESSAGES.VOLUME_LIMIT_REACHED).toContain("Exclua registros");
    expect(ERROR_MESSAGES.REAUTH_REQUIRED).toBe(
      "Confirme sua senha para continuar.",
    );
  });
});
