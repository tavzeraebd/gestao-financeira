import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/public", () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k",
  },
}));

type Opts = {
  cookies: {
    setAll: (
      c: { name: string; value: string; options: object }[],
      cache: Record<string, string>,
    ) => void;
  };
};
const state: { renew: boolean } = { renew: false };
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: Opts) => ({
    auth: {
      getClaims: async () => {
        if (state.renew) {
          opts.cookies.setAll(
            [{ name: "sb-x-auth-token", value: "renovado", options: {} }],
            { "cache-control": "private, no-store" },
          );
        }
        return { data: { claims: { sub: "u1" } } };
      },
    },
  }),
}));

import { updateSession } from "@/lib/supabase/proxy";

function reqComCabecalhos() {
  const request = new NextRequest("http://localhost:3000/login");
  request.headers.set("x-client-ip", "203.0.113.7");
  request.headers.set("x-nonce", "nonce-do-proxy");
  request.headers.set("content-security-policy", "script-src 'nonce-nonce-do-proxy'");
  return request;
}

describe("updateSession: repasse de x-client-ip, x-nonce e CSP", () => {
  beforeEach(() => {
    state.renew = false;
  });

  it("sem renovação: a resposta leva a CSP e o x-request-id", async () => {
    const { response, requestId } = await updateSession(reqComCabecalhos());
    expect(response.headers.get("content-security-policy")).toBe(
      "script-src 'nonce-nonce-do-proxy'",
    );
    expect(response.headers.get("x-request-id")).toBe(requestId);
  });

  it("após renovar a sessão (novo forward) mantém x-nonce, CSP e x-client-ip nos cabeçalhos repassados", async () => {
    state.renew = true;
    const { response } = await updateSession(reqComCabecalhos());
    // NextResponse.next({ request: { headers } }) grava os cabeçalhos repassados com este prefixo.
    const h = response.headers;
    expect(h.get("x-middleware-request-x-nonce")).toBe("nonce-do-proxy");
    expect(h.get("x-middleware-request-x-client-ip")).toBe("203.0.113.7");
    expect(h.get("x-middleware-request-content-security-policy")).toBe(
      "script-src 'nonce-nonce-do-proxy'",
    );
    expect(h.get("content-security-policy")).toBe(
      "script-src 'nonce-nonce-do-proxy'",
    );
    expect(response.cookies.get("sb-x-auth-token")?.value).toBe("renovado");
    expect(h.get("cache-control")).toBe("private, no-store");
  });

  it("x-request-id vindo do cliente é substituído, mesmo após renovação", async () => {
    state.renew = true;
    const request = reqComCabecalhos();
    request.headers.set("x-request-id", "forjado");
    const { response, requestId } = await updateSession(request);
    expect(requestId).not.toBe("forjado");
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe(
      requestId,
    );
  });
});
