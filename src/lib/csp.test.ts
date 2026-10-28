import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "./csp";

const dir = (csp: string, name: string) =>
  csp.split("; ").find((d) => d === name || d.startsWith(`${name} `));

describe("generateNonce", () => {
  it("é base64 de 16 bytes e muda a cada chamada", () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(Buffer.from(a, "base64")).toHaveLength(16);
    expect(generateNonce()).not.toBe(a);
  });
});

describe("buildCsp (produção)", () => {
  const csp = buildCsp({ nonce: "abc", isDev: false });

  it("script-src com nonce e strict-dynamic, sem unsafe-*", () => {
    expect(dir(csp, "script-src")).toBe(
      "script-src 'self' 'nonce-abc' 'strict-dynamic'",
    );
  });
  it("style-src com nonce e atributos style liberados", () => {
    expect(dir(csp, "style-src")).toBe("style-src 'self' 'nonce-abc'");
    expect(dir(csp, "style-src-attr")).toBe("style-src-attr 'unsafe-inline'");
    expect(dir(csp, "style-src-elem")).toBe(
      "style-src-elem 'self' 'unsafe-inline'",
    );
  });
  it("demais diretivas", () => {
    expect(dir(csp, "default-src")).toBe("default-src 'self'");
    expect(dir(csp, "img-src")).toBe("img-src 'self' data: blob:");
    expect(dir(csp, "font-src")).toBe("font-src 'self'");
    expect(dir(csp, "connect-src")).toBe("connect-src 'self'");
    expect(dir(csp, "manifest-src")).toBe("manifest-src 'self'");
    expect(dir(csp, "worker-src")).toBe("worker-src 'self'");
    expect(dir(csp, "object-src")).toBe("object-src 'none'");
    expect(dir(csp, "base-uri")).toBe("base-uri 'self'");
    expect(dir(csp, "form-action")).toBe("form-action 'self'");
    expect(dir(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(dir(csp, "upgrade-insecure-requests")).toBeDefined();
  });
});

describe("buildCsp (desenvolvimento)", () => {
  const csp = buildCsp({ nonce: "abc", isDev: true });

  it("permite unsafe-eval e websocket local, sem upgrade-insecure-requests", () => {
    expect(dir(csp, "script-src")).toContain("'unsafe-eval'");
    expect(dir(csp, "connect-src")).toBe("connect-src 'self' ws://localhost:*");
    expect(dir(csp, "upgrade-insecure-requests")).toBeUndefined();
  });
});
