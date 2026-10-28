import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/server/request-id", () => ({
  getRequestId: async () => "req-1",
}));
const clientIp = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("@/server/client-ip", () => ({
  getClientIp: async () => clientIp.value,
}));
const logs: Array<Record<string, unknown>> = [];
vi.mock("@/server/logger", () => ({
  logger: {
    debug: (f: Record<string, unknown>) => logs.push({ level: "debug", ...f }),
    info: (f: Record<string, unknown>) => logs.push({ level: "info", ...f }),
    warn: (f: Record<string, unknown>) => logs.push({ level: "warn", ...f }),
    error: (f: Record<string, unknown>) => logs.push({ level: "error", ...f }),
  },
}));

import { runAction } from "@/server/action";
import { AppError } from "@/server/errors";
import { resetLogIdentityWarning } from "@/server/log-identity";
import { resetRateLimits } from "@/server/rate-limit";

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome."),
});

const base = { module: "test", operation: "op", schema } as const;

beforeEach(() => {
  getUser.mockReset();
  logs.length = 0;
  clientIp.value = "198.51.100.1";
  resetRateLimits();
  resetLogIdentityWarning();
  vi.stubEnv("LOG_HMAC_KEY", "k".repeat(40));
});

afterEach(() => vi.unstubAllEnvs());

describe("runAction", () => {
  it("VALIDATION_ERROR com fieldErrors e sem chamar o handler", async () => {
    const handler = vi.fn();
    const result = await runAction({
      ...base,
      input: { name: "   " },
      auth: "none",
      handler,
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        requestId: "req-1",
        fieldErrors: { name: ["Informe o nome."] },
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("UNAUTHENTICATED sem usuário", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const handler = vi.fn();
    const result = await runAction({
      ...base,
      input: { name: "x" },
      auth: "required",
      handler,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("sucesso entrega input normalizado e userId ao handler", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
    const result = await runAction({
      ...base,
      input: { name: "  Casa  " },
      auth: "required",
      handler: async (data, ctx) => ({ name: data.name, userId: ctx.userId }),
    });
    expect(result).toEqual({ ok: true, data: { name: "Casa", userId: "u-1" } });
  });

  it("auth none não consulta o usuário", async () => {
    const result = await runAction({
      ...base,
      input: { name: "x" },
      auth: "none",
      handler: async (_d, ctx) => ctx.userId,
    });
    expect(result).toEqual({ ok: true, data: null });
    expect(getUser).not.toHaveBeenCalled();
  });

  it("relança redirect em vez de engolir", async () => {
    await expect(
      runAction({
        ...base,
        input: { name: "x" },
        auth: "none",
        handler: async () => {
          redirect("/inicio");
        },
      }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  it("erro inesperado vira INTERNAL_ERROR com requestId e sem vazar a mensagem", async () => {
    const result = await runAction({
      ...base,
      input: { name: "x" },
      auth: "none",
      handler: async () => {
        throw new Error("senha do banco: hunter2");
      },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INTERNAL_ERROR", requestId: "req-1" },
    });
    expect(JSON.stringify(result)).not.toContain("hunter2");
    expect(JSON.stringify(logs)).not.toContain("hunter2");
  });

  it("AppError do handler mantém o código", async () => {
    const result = await runAction({
      ...base,
      input: { name: "x" },
      auth: "none",
      handler: async () => {
        throw new AppError("INVITE_EXPIRED");
      },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVITE_EXPIRED" },
    });
  });

  it("erro do Postgres P0001 é mapeado", async () => {
    const result = await runAction({
      ...base,
      input: { name: "x" },
      auth: "none",
      handler: async () => {
        throw { code: "P0001", message: "ALREADY_IN_FAMILY", details: null };
      },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "ALREADY_IN_FAMILY" },
    });
  });

  it("registra log sem a entrada do usuário", async () => {
    await runAction({
      ...base,
      input: { name: "NomeSecreto" },
      auth: "none",
      handler: async () => null,
    });
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toContain("NomeSecreto");
  });

  describe("log de segurança (CA-E9-33)", () => {
    it("linhas warn/error incluem o ip e as de sucesso não", async () => {
      clientIp.value = "203.0.113.7";
      await runAction({
        ...base,
        input: { name: "x" },
        auth: "none",
        handler: async () => null,
      });
      await runAction({
        ...base,
        input: { name: "x" },
        auth: "none",
        handler: async () => {
          throw new AppError("INVITE_EXPIRED");
        },
      });
      await runAction({
        ...base,
        input: { name: "x" },
        auth: "none",
        handler: async () => {
          throw new Error("boom");
        },
      });
      expect(logs[0]).toMatchObject({ level: "info", code: "OK" });
      expect(logs[0]).not.toHaveProperty("ip");
      expect(logs[1]).toMatchObject({ level: "warn", ip: "203.0.113.7" });
      expect(logs[2]).toMatchObject({ level: "error", ip: "203.0.113.7" });
    });

    it("identity vira emailHmac e inviteId só na falha; o e-mail nunca vai ao log", async () => {
      const email = "ana@example.test";
      const inviteId = "6f1c2b3a-1111-4222-8333-944455556666";
      const common = {
        ...base,
        input: { name: "x" },
        auth: "none",
        identity: () => ({ email, inviteId }),
      } as const;
      await runAction({ ...common, handler: async () => null });
      await runAction({
        ...common,
        handler: async () => {
          throw new AppError("FORBIDDEN");
        },
      });
      expect(logs[0]).not.toHaveProperty("emailHmac");
      expect(logs[1]).toMatchObject({
        level: "warn",
        emailHmac: expect.stringMatching(/^[0-9a-f]{16}$/),
        inviteId,
      });
      expect(JSON.stringify(logs)).not.toContain(email);
    });

    it("sem LOG_HMAC_KEY o emailHmac é omitido (nunca vira hash simples)", async () => {
      vi.stubEnv("LOG_HMAC_KEY", "");
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      await runAction({
        ...base,
        input: { name: "x" },
        auth: "none",
        identity: () => ({ email: "ana@example.test" }),
        handler: async () => {
          throw new AppError("FORBIDDEN");
        },
      });
      expect(logs[0]?.emailHmac).toBeUndefined();
      vi.restoreAllMocks();
    });

    it("identity só roda com a entrada já validada", async () => {
      const identity = vi.fn(() => ({ email: "a@b.test" }));
      await runAction({
        ...base,
        input: { name: "  " },
        auth: "none",
        identity,
        handler: vi.fn(),
      });
      expect(identity).not.toHaveBeenCalled();
    });
  });

  describe("rate limit (CA-E9-37)", () => {
    const authed = (userId: string) =>
      getUser.mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      });
    const call = (opts: Partial<Parameters<typeof runAction>[0]> = {}) => {
      const handler = vi.fn(async () => null);
      return {
        handler,
        run: () =>
          runAction({
            ...base,
            input: { name: "x" },
            auth: "required",
            handler,
            ...opts,
          } as Parameters<typeof runAction>[0]),
      };
    };

    it("autenticada: 120/min por userId; a 121ª é RATE_LIMITED sem executar o handler", async () => {
      authed("u-1");
      const { run, handler } = call();
      for (let i = 0; i < 120; i++) {
        expect((await run()).ok).toBe(true);
      }
      const blocked = await run();
      expect(blocked).toMatchObject({
        ok: false,
        error: { code: "RATE_LIMITED", requestId: "req-1" },
      });
      expect(handler).toHaveBeenCalledTimes(120);
      expect(logs.at(-1)).toMatchObject({
        level: "warn",
        code: "RATE_LIMITED",
      });
    });

    it("o limite de um usuário não afeta outro", async () => {
      authed("u-1");
      const { run } = call();
      for (let i = 0; i < 121; i++) await run();
      authed("u-2");
      expect((await run()).ok).toBe(true);
    });

    it("anônima: 60/min por IP; outro IP não é afetado", async () => {
      clientIp.value = "203.0.113.7";
      const { run, handler } = call({ auth: "none" });
      for (let i = 0; i < 60; i++) {
        expect((await run()).ok).toBe(true);
      }
      expect(await run()).toMatchObject({
        ok: false,
        error: { code: "RATE_LIMITED" },
      });
      expect(handler).toHaveBeenCalledTimes(60);
      expect(logs.at(-1)).toMatchObject({ ip: "203.0.113.7" });
      clientIp.value = "203.0.113.8";
      expect((await run()).ok).toBe(true);
    });

    it("IP nulo ignora o balde por IP em vez de travar todos", async () => {
      clientIp.value = null;
      const { run, handler } = call({ auth: "none" });
      for (let i = 0; i < 100; i++) {
        expect((await run()).ok).toBe(true);
      }
      expect(handler).toHaveBeenCalledTimes(100);
      // o aviso de IP indisponível sai uma vez só
      expect(
        logs.filter((l) => l.code === "CLIENT_IP_UNAVAILABLE"),
      ).toHaveLength(1);
    });

    it("rateLimit: false ignora o balde geral", async () => {
      authed("u-1");
      const { run, handler } = call({ rateLimit: false });
      for (let i = 0; i < 130; i++) {
        expect((await run()).ok).toBe(true);
      }
      expect(handler).toHaveBeenCalledTimes(130);
    });

    it("entrega o ip ao handler", async () => {
      clientIp.value = "203.0.113.7";
      const result = await runAction({
        ...base,
        input: { name: "x" },
        auth: "none",
        handler: async (_d, ctx) => ctx.ip,
      });
      expect(result).toEqual({ ok: true, data: "203.0.113.7" });
    });
  });
});
