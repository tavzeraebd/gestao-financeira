import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/modules/family/repository", () => ({
  findActiveMembership: vi.fn(),
}));

import { requireUser } from "@/server/auth";

/** `redirect()` do Next lança um erro cujo `digest` carrega o destino. */
async function destinoDoRedirect(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2] ?? "";
    throw error;
  }
  throw new Error("esperava um redirect");
}

describe("requireUser", () => {
  beforeEach(() => getUser.mockReset());

  it("sessão revogada (getUser falha com JWT local ainda válido) vai a /login com motivo, para o proxy não fechar um laço", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 403, code: "session_not_found", message: "revogada" },
    });
    expect(await destinoDoRedirect(requireUser())).toBe(
      "/login?motivo=sessao_expirada",
    );
  });

  it("usuário válido não redireciona", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "a@b.test" } },
      error: null,
    });
    await expect(requireUser()).resolves.toEqual({
      id: "u1",
      email: "a@b.test",
    });
  });
});
