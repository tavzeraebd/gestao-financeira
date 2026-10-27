import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/server/request-id", () => ({
  getRequestId: async () => "req-1",
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

const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome."),
});

const base = { module: "test", operation: "op", schema } as const;

beforeEach(() => {
  getUser.mockReset();
  logs.length = 0;
});

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
});
