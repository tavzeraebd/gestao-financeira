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
const clientIp = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/server/client-ip", () => ({
  getClientIp: async () => clientIp.value,
}));
vi.mock("@/server/log-identity", () => ({
  emailHmac: () => "0123456789abcdef",
}));
vi.mock("@/server/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const signUpMock = vi.fn();
const signInMock = vi.fn();
const resetMock = vi.fn();
const resendMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signUp: signUpMock,
      signInWithPassword: signInMock,
      resetPasswordForEmail: resetMock,
      resend: resendMock,
    },
  }),
}));

import {
  requestPasswordReset,
  resendConfirmation,
  signIn,
  signUp,
} from "@/modules/auth/actions";
import { logger } from "@/server/logger";
import { resetRateLimits } from "@/server/rate-limit";

const input = {
  displayName: "Ana",
  email: "ana@example.test",
  password: "Senha-de-teste-1",
};

beforeEach(() => {
  resetRateLimits();
  clientIp.value = "203.0.113.7";
  vi.mocked(logger.warn).mockClear();
});

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

const credentials = { email: "ana@example.test", password: "Senha-de-teste-1" };
const invalid = new AuthApiError("x", 400, "invalid_credentials");

describe("signIn: rate limit (CA-E9-35)", () => {
  beforeEach(() => {
    signInMock.mockReset();
    signInMock.mockResolvedValue({ data: {}, error: invalid });
  });

  it("a 6ª tentativa após 5 falhas do par IP+e-mail é RATE_LIMITED sem chamar o Auth", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await signIn(credentials)).toMatchObject({
        error: { code: "INVALID_CREDENTIALS" },
      });
    }
    expect(signInMock).toHaveBeenCalledTimes(5);
    expect(await signIn(credentials)).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
    expect(signInMock).toHaveBeenCalledTimes(5);
  });

  it("outro e-mail e outro IP não são afetados; a mensagem é igual para qualquer e-mail", async () => {
    for (let i = 0; i < 5; i++) await signIn(credentials);
    const blocked = await signIn(credentials);
    expect(
      await signIn({ ...credentials, email: "bia@example.test" }),
    ).toMatchObject({
      error: { code: "INVALID_CREDENTIALS" },
    });
    clientIp.value = "203.0.113.8";
    expect(await signIn(credentials)).toMatchObject({
      error: { code: "INVALID_CREDENTIALS" },
    });
    // bloqueio de e-mail inexistente (mesmo IP) tem a mesma resposta
    clientIp.value = "203.0.113.7";
    for (let i = 0; i < 5; i++) {
      await signIn({ ...credentials, email: "naoexiste@example.test" });
    }
    const other = await signIn({
      ...credentials,
      email: "naoexiste@example.test",
    });
    expect(other).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect((other as { error: { message: string } }).error.message).toBe(
      (blocked as { error: { message: string } }).error.message,
    );
  });

  it("a 31ª tentativa de um IP em 5 min é RATE_LIMITED", async () => {
    for (let i = 0; i < 30; i++) {
      await signIn({ ...credentials, email: `u${i}@example.test` });
    }
    expect(signInMock).toHaveBeenCalledTimes(30);
    expect(
      await signIn({ ...credentials, email: "u99@example.test" }),
    ).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(signInMock).toHaveBeenCalledTimes(30);
  });

  it("erro que não é de credencial não conta como falha do par", async () => {
    signInMock.mockResolvedValue({
      data: {},
      error: new AuthApiError("x", 400, "email_not_confirmed"),
    });
    for (let i = 0; i < 8; i++) await signIn(credentials);
    expect(signInMock).toHaveBeenCalledTimes(8);
  });

  it("a falha loga ip e emailHmac, sem e-mail nem senha", async () => {
    await signIn(credentials);
    const line = vi.mocked(logger.warn).mock.calls.at(-1)?.[0];
    expect(line).toMatchObject({
      code: "INVALID_CREDENTIALS",
      ip: "203.0.113.7",
      emailHmac: "0123456789abcdef",
    });
    expect(JSON.stringify(line)).not.toContain(credentials.email);
    expect(JSON.stringify(line)).not.toContain(credentials.password);
  });

  it("IP nulo ignora os baldes por IP e não trava ninguém", async () => {
    clientIp.value = null;
    for (let i = 0; i < 40; i++) await signIn(credentials);
    expect(signInMock).toHaveBeenCalledTimes(40);
  });
});

describe("ações de e-mail: resposta neutra acima do limite (CA-E9-36)", () => {
  const neutral = { ok: true, data: null };
  beforeEach(() => {
    signUpMock.mockReset();
    resetMock.mockReset();
    resendMock.mockReset();
    signUpMock.mockResolvedValue({ data: {}, error: null });
    resetMock.mockResolvedValue({ data: {}, error: null });
    resendMock.mockResolvedValue({ data: {}, error: null });
  });

  const email = (i: number) => ({ email: `p${i}@example.test` });

  it("requestPasswordReset: 3 por e-mail/hora; depois o mesmo sucesso sem chamar o Auth", async () => {
    for (let i = 0; i < 3; i++) await requestPasswordReset(email(0));
    expect(resetMock).toHaveBeenCalledTimes(3);
    expect(await requestPasswordReset(email(0))).toEqual(neutral);
    expect(resetMock).toHaveBeenCalledTimes(3);
    expect(vi.mocked(logger.warn).mock.calls.at(-1)?.[0]).toMatchObject({
      code: "RATE_LIMITED",
      operation: "requestPasswordReset",
      ip: "203.0.113.7",
    });
  });

  it("resendConfirmation: 5 por IP/10 min entre e-mails diferentes", async () => {
    for (let i = 0; i < 5; i++) await resendConfirmation(email(i));
    expect(await resendConfirmation(email(9))).toEqual(neutral);
    expect(resendMock).toHaveBeenCalledTimes(5);
    clientIp.value = "203.0.113.9";
    await resendConfirmation(email(9));
    expect(resendMock).toHaveBeenCalledTimes(6);
  });

  it("signUp acima do limite devolve o mesmo sucesso, sem chamar o Auth", async () => {
    const data = { displayName: "Ana", password: "Senha-de-teste-1" };
    for (let i = 0; i < 3; i++) await signUp({ ...data, ...email(0) });
    expect(await signUp({ ...data, ...email(0) })).toEqual({
      ok: true,
      data: { email: "p0@example.test" },
    });
    expect(signUpMock).toHaveBeenCalledTimes(3);
  });

  it("IP nulo ignora o balde por IP; o por e-mail continua valendo", async () => {
    clientIp.value = null;
    for (let i = 0; i < 8; i++) await resendConfirmation(email(i));
    expect(resendMock).toHaveBeenCalledTimes(8);
    for (let i = 0; i < 4; i++) await requestPasswordReset(email(100));
    expect(resetMock).toHaveBeenCalledTimes(3);
  });
});
