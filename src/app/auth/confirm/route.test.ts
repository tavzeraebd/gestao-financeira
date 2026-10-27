import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/server/request-id", () => ({ getRequestId: async () => "req-1" }));
vi.mock("@/server/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));

import { GET } from "@/app/auth/confirm/route";

async function destination(type: string, next?: string): Promise<string> {
  const url = new URL("http://localhost:3000/auth/confirm");
  url.searchParams.set("token_hash", "abc");
  url.searchParams.set("type", type);
  if (next !== undefined) url.searchParams.set("next", next);
  try {
    await GET(new NextRequest(url));
  } catch (e) {
    return String((e as Error).message).replace("REDIRECT:", "");
  }
  throw new Error("sem redirect");
}

describe("/auth/confirm: parâmetro next", () => {
  beforeEach(() => verifyOtp.mockReset().mockResolvedValue({ error: null }));

  it.each([
    "//evil.com",
    "/\\evil.com",
    "https://evil.com",
    "javascript:alert(1)",
  ])("next hostil %j cai no fallback", async (next) => {
    expect(await destination("email", next)).toBe("/inicio");
    expect(await destination("recovery", next)).toBe("/redefinir-senha");
  });

  it("next seguro é respeitado; link inválido vai ao login", async () => {
    expect(await destination("email", "/transacoes")).toBe("/transacoes");
    verifyOtp.mockResolvedValue({ error: new Error("x") });
    expect(await destination("email", "/transacoes")).toBe(
      "/login?erro=link_invalido",
    );
  });
});
