import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: vi.fn() }));

import { updateSession } from "@/lib/supabase/proxy";
import { proxy } from "@/proxy";

function mockSession(userId: string | null) {
  const response = NextResponse.next();
  response.cookies.set("sb-x-auth-token", "novo");
  response.headers.set("cache-control", "private, no-store");
  vi.mocked(updateSession).mockResolvedValue({
    response,
    userId,
    requestId: "rid-1",
  });
}

const req = (
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) => new NextRequest(`http://localhost:3000${path}`, init);

describe("proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET privado sem sessão redireciona e copia cookies e cache-control", async () => {
    mockSession(null);
    const res = await proxy(req("/inicio"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?next=%2Finicio");
    expect(res.cookies.get("sb-x-auth-token")?.value).toBe("novo");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-request-id")).toBe("rid-1");
  });

  it.each([
    "/transacoes",
    "/transacoes/nova",
    "/contas",
    "/categorias",
    "/metas",
    "/planejamento",
    "/divisao",
  ])("GET %s sem sessão redireciona para /login com next", async (path) => {
    mockSession(null);
    const res = await proxy(req(path));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain(
      `/login?next=${encodeURIComponent(path)}`,
    );
  });

  it("POST de Server Action sem sessão NÃO é redirecionado", async () => {
    mockSession(null);
    const res = await proxy(
      req("/inicio", { method: "POST", headers: { "next-action": "abc" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("método não-GET sem sessão não é redirecionado", async () => {
    mockSession(null);
    const res = await proxy(req("/familia", { method: "POST" }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("logado em rota de visitante vai para /inicio", async () => {
    mockSession("u1");
    const res = await proxy(req("/login"));
    expect(res.headers.get("location")).toContain("/inicio");
  });

  // JWT ainda válido para o proxy (getClaims), mas sessão revogada para requireUser (getUser):
  // sem esta exceção, /login -> /inicio -> /login seria um laço (ERR_TOO_MANY_REDIRECTS).
  it("logado em /login com motivo=sessao_expirada NÃO volta para /inicio", async () => {
    mockSession("u1");
    const res = await proxy(req("/login?motivo=sessao_expirada"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("outro motivo em /login com sessão continua indo para /inicio", async () => {
    mockSession("u1");
    const res = await proxy(req("/login?motivo=outro"));
    expect(res.headers.get("location")).toContain("/inicio");
  });

  describe("x-client-ip (CA-E9-31)", () => {
    afterEach(() => vi.unstubAllEnvs());

    const seenIp = () =>
      vi.mocked(updateSession).mock.calls[0]?.[0].headers.get("x-client-ip") ??
      null;

    it("descarta o x-client-ip do cliente e grava o IP calculado (última entrada, 1 salto)", async () => {
      mockSession(null);
      await proxy(
        req("/login", {
          headers: {
            "x-client-ip": "6.6.6.6",
            "x-forwarded-for": "9.9.9.9, 203.0.113.7",
          },
        }),
      );
      expect(seenIp()).toBe("203.0.113.7");
    });

    it("sem IP confiável o cabeçalho do cliente é removido, não repassado", async () => {
      mockSession(null);
      await proxy(req("/login", { headers: { "x-client-ip": "6.6.6.6" } }));
      expect(seenIp()).toBeNull();
    });

    it("x-forwarded-for de loopback (o Next o preenche com o socket quando não há proxy) não vira IP", async () => {
      mockSession(null);
      await proxy(req("/login", { headers: { "x-forwarded-for": "::1" } }));
      expect(seenIp()).toBeNull();
    });

    it("TRUSTED_PROXY_HOPS=0 desativa e =2 usa a penúltima entrada", async () => {
      mockSession(null);
      const headers = { "x-forwarded-for": "9.9.9.9, 203.0.113.7, 10.0.0.1" };
      vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
      await proxy(req("/login", { headers }));
      expect(seenIp()).toBeNull();

      vi.clearAllMocks();
      mockSession(null);
      vi.stubEnv("TRUSTED_PROXY_HOPS", "2");
      await proxy(req("/login", { headers }));
      expect(seenIp()).toBe("203.0.113.7");
    });
  });
});
