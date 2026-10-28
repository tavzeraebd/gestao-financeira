import { AuthApiError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "ana@example.test";
const PASSWORD = "Senha-de-teste-1";

const getUser = vi.fn();
const signInWithPassword = vi.fn();
const signOut = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser, signInWithPassword, signOut },
    rpc,
  }),
}));

import { deleteAccount } from "@/modules/profile/actions";
import { redirect } from "next/navigation";
import type { ErrorCode } from "@/server/action";
import { ERROR_MESSAGES } from "@/server/error-messages";
import { logger } from "@/server/logger";
import { resetRateLimits } from "@/server/rate-limit";

const input = { password: PASSWORD, confirmation: "EXCLUIR" as const };

const dbError = (code: string, message: string) => ({
  data: null,
  error: { code, message, details: null, hint: null },
});

function userWith(identities: { provider: string }[]) {
  return {
    data: { user: { id: USER_ID, email: EMAIL, identities } },
    error: null,
  };
}

function allLogs(): string {
  return JSON.stringify(
    [logger.debug, logger.info, logger.warn, logger.error].map(
      (f) => vi.mocked(f).mock.calls,
    ),
  );
}

beforeEach(() => {
  resetRateLimits();
  clientIp.value = "203.0.113.7";
  getUser.mockReset().mockResolvedValue(userWith([{ provider: "email" }]));
  signInWithPassword.mockReset().mockResolvedValue({ data: {}, error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
  rpc
    .mockReset()
    .mockResolvedValue({ data: { family_erased: false }, error: null });
  vi.mocked(redirect).mockClear();
  for (const f of [logger.debug, logger.info, logger.warn, logger.error]) {
    vi.mocked(f).mockClear();
  }
});

describe("deleteAccount (CA-E9-40, CA-E9-41)", () => {
  it("sucesso: reautentica com o e-mail do usuário, chama a RPC, encerra a sessão global e redireciona", async () => {
    await deleteAccount(input);
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: EMAIL,
      password: PASSWORD,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("delete_my_account");
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(redirect).toHaveBeenCalledWith("/login?conta=excluida");
    // ordem: senha -> RPC -> signOut
    const [signInAt = Infinity] = signInWithPassword.mock.invocationCallOrder;
    const [rpcAt = Infinity] = rpc.mock.invocationCallOrder;
    const [signOutAt = 0] = signOut.mock.invocationCallOrder;
    expect(signInAt).toBeLessThan(rpcAt);
    expect(rpcAt).toBeLessThan(signOutAt);
  });

  it("o log de sucesso tem module/operation, userId e nenhum segredo, e-mail ou familyId", async () => {
    await deleteAccount(input);
    const line = vi.mocked(logger.info).mock.calls.at(-1)?.[0];
    expect(line).toMatchObject({
      module: "account",
      operation: "deleteAccount",
      code: "OK",
      userId: USER_ID,
    });
    expect(line).not.toHaveProperty("familyId");
    expect(allLogs()).not.toContain(PASSWORD);
    expect(allLogs()).not.toContain(EMAIL);
  });

  it("senha incorreta: INVALID_CREDENTIALS sem chamar a RPC, sem logar senha nem e-mail", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthApiError("x", 400, "invalid_credentials"),
    });
    expect(await deleteAccount(input)).toMatchObject({
      ok: false,
      error: { code: "INVALID_CREDENTIALS" },
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    const warn = vi.mocked(logger.warn).mock.calls.at(-1)?.[0];
    expect(warn).toMatchObject({
      module: "account",
      operation: "deleteAccount",
      code: "INVALID_CREDENTIALS",
      userId: USER_ID,
      ip: "203.0.113.7",
    });
    expect(allLogs()).not.toContain(PASSWORD);
    expect(allLogs()).not.toContain(EMAIL);
  });

  it("falhas de senha dividem o balde do login: a 6ª vira RATE_LIMITED sem chamar o Auth", async () => {
    signInWithPassword.mockResolvedValue({
      data: {},
      error: new AuthApiError("x", 400, "invalid_credentials"),
    });
    // Cada chamada é de um usuário diferente (o balde da conta é 3/h por usuário) para isolar
    // o balde auth_failure (IP + e-mail), que é compartilhado com o login.
    for (let i = 0; i < 5; i++) {
      getUser.mockResolvedValue({
        data: {
          user: {
            id: `${i}1111111-1111-4111-8111-111111111111`,
            email: EMAIL,
            identities: [{ provider: "email" }],
          },
        },
        error: null,
      });
      expect(await deleteAccount(input)).toMatchObject({
        error: { code: "INVALID_CREDENTIALS" },
      });
    }
    expect(signInWithPassword).toHaveBeenCalledTimes(5);
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "91111111-1111-4111-8111-111111111111",
          email: EMAIL,
          identities: [{ provider: "email" }],
        },
      },
      error: null,
    });
    expect(await deleteAccount(input)).toMatchObject({
      error: { code: "RATE_LIMITED" },
    });
    expect(signInWithPassword).toHaveBeenCalledTimes(5);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["REAUTH_REQUIRED", "P0001", "REAUTH_REQUIRED"],
    ["OWNER_MUST_TRANSFER", "P0001", "OWNER_MUST_TRANSFER"],
    ["ACCOUNT_ERASURE_UNAVAILABLE", "P0001", "ACCOUNT_ERASURE_UNAVAILABLE"],
    ["NOT_AUTHENTICATED", "P0001", "UNAUTHENTICATED"],
    ["FORBIDDEN", "42501", "FORBIDDEN"],
  ])(
    "RPC %s vira o código esperado, sem encerrar a sessão nem redirecionar",
    async (message, sqlstate, code) => {
      rpc.mockResolvedValue(dbError(sqlstate, message));
      const result = await deleteAccount(input);
      expect(result).toMatchObject({ ok: false, error: { code } });
      expect(signOut).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
      // só a mensagem pt-BR segura chega ao usuário
      expect((result as { error: { message: string } }).error.message).toBe(
        ERROR_MESSAGES[code as ErrorCode],
      );
    },
  );

  it("erro inesperado da RPC vira INTERNAL_ERROR sem vazar o detalhe", async () => {
    rpc.mockResolvedValue(dbError("XX000", "detalhe interno do banco"));
    const result = await deleteAccount(input);
    expect(result).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    expect(JSON.stringify(result)).not.toContain("detalhe interno");
  });

  it("acima de 3 por hora por usuário: RATE_LIMITED sem reautenticar nem chamar a RPC", async () => {
    rpc.mockResolvedValue(dbError("P0001", "OWNER_MUST_TRANSFER"));
    for (let i = 0; i < 3; i++) {
      expect(await deleteAccount(input)).toMatchObject({
        error: { code: "OWNER_MUST_TRANSFER" },
      });
    }
    expect(signInWithPassword).toHaveBeenCalledTimes(3);
    expect(await deleteAccount(input)).toMatchObject({
      ok: false,
      error: { code: "RATE_LIMITED" },
    });
    expect(signInWithPassword).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("conta sem identidade de senha: ACCOUNT_ERASURE_UNAVAILABLE sem reautenticar nem chamar a RPC", async () => {
    getUser.mockResolvedValue(userWith([{ provider: "google" }]));
    expect(await deleteAccount(input)).toMatchObject({
      error: { code: "ACCOUNT_ERASURE_UNAVAILABLE" },
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem sessão: UNAUTHENTICATED sem tocar no Auth nem na RPC", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("x", 401, "session_not_found"),
    });
    expect(await deleteAccount(input)).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falha no signOut não impede o redirecionamento (a RPC já removeu as sessões)", async () => {
    signOut.mockRejectedValue(new Error("rede"));
    await deleteAccount(input);
    expect(redirect).toHaveBeenCalledWith("/login?conta=excluida");
    expect(vi.mocked(logger.warn).mock.calls.at(-1)?.[0]).toMatchObject({
      operation: "deleteAccount",
      code: "SIGN_OUT_INTERNAL_ERROR",
    });
  });

  describe("entrada", () => {
    it.each([
      [{ password: PASSWORD, confirmation: "excluir" }],
      [{ password: PASSWORD }],
      [{ password: "", confirmation: "EXCLUIR" }],
      [{ password: "a".repeat(73), confirmation: "EXCLUIR" }],
    ])("%j é VALIDATION_ERROR sem reautenticar", async (bad) => {
      expect(await deleteAccount(bad as unknown as typeof input)).toMatchObject(
        { error: { code: "VALIDATION_ERROR" } },
      );
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    });

    it("family_id/userId vindos do cliente são ignorados: a RPC não recebe argumento algum", async () => {
      await deleteAccount({
        ...input,
        familyId: "22222222-2222-4222-8222-222222222222",
        family_id: "22222222-2222-4222-8222-222222222222",
        userId: "33333333-3333-4333-8333-333333333333",
        email: "outra@example.test",
      } as unknown as typeof input);
      expect(rpc).toHaveBeenCalledWith("delete_my_account");
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: EMAIL,
        password: PASSWORD,
      });
    });
  });
});
