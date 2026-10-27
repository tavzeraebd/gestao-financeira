import { AuthApiError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({
  serverEnv: { APP_URL: "http://localhost:3000" },
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/server/request-id", () => ({ getRequestId: async () => "req-1" }));
vi.mock("@/server/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const signUpMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp: signUpMock } }),
}));

import { signUp } from "@/modules/auth/actions";

const input = {
  displayName: "Ana",
  email: "ana@example.test",
  password: "Senha-de-teste-1",
};

describe("signUp (SEC-13)", () => {
  beforeEach(() => signUpMock.mockReset());

  it.each(["over_email_send_rate_limit", "over_request_rate_limit"])(
    "%s do Auth responde como sucesso neutro",
    async (code) => {
      signUpMock.mockResolvedValue({
        data: {},
        error: new AuthApiError("detalhe interno", 429, code),
      });
      expect(await signUp(input)).toEqual({
        ok: true,
        data: { email: input.email },
      });
    },
  );

  it("outros erros continuam falhando", async () => {
    signUpMock.mockResolvedValue({
      data: {},
      error: new AuthApiError("x", 500, "unexpected_failure"),
    });
    expect(await signUp(input)).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR" },
    });
  });
});
