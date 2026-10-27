import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["//evil.com"],
    ["/\\evil.com"],
    ["/\\/evil.com"],
    ["https://evil.com"],
    ["http://evil.com/inicio"],
    ["javascript:alert(1)"],
    ["evil.com"],
    ["/\t/evil.com"],
    ["/\n/evil.com"],
    ["/inicio\r\nSet-Cookie: x=1"],
    ["/admin"],
    ["/iniciox"],
    ["/inicio/../../evil"],
    ["/convite/"],
    ["/" + "a".repeat(600)],
    [""],
  ])("rejeita %j", (input) => {
    expect(safeNextPath(input)).toBe("/inicio");
  });

  it.each([
    "/transacoes",
    "/transacoes/nova?tipo=receita",
    "/contas",
    "/contas/nova",
    "/categorias",
    "/metas",
    "/metas/abc?situacao=todas",
    "/planejamento",
    "/divisao/acertos",
  ])("aceita a rota da Etapa 3 %s", (input) => {
    expect(safeNextPath(input)).toBe(input);
  });

  it("usa o fallback informado", () => {
    expect(safeNextPath("//evil.com", "/redefinir-senha")).toBe(
      "/redefinir-senha",
    );
    expect(safeNextPath(null, "/onboarding")).toBe("/onboarding");
    expect(safeNextPath(undefined)).toBe("/inicio");
  });

  it.each([
    ["/inicio", "/inicio"],
    ["/inicio?x=1", "/inicio?x=1"],
    ["/familia", "/familia"],
    ["/configuracoes", "/configuracoes"],
    ["/onboarding", "/onboarding"],
    ["/redefinir-senha", "/redefinir-senha"],
    ["/convite/" + "a".repeat(64), "/convite/" + "a".repeat(64)],
    ["/inicio/sub?a=1&b=2", "/inicio/sub?a=1&b=2"],
  ])("aceita %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it("descarta o fragmento", () => {
    expect(safeNextPath("/inicio#x")).toBe("/inicio");
  });
});
