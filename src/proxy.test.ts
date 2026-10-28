import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
