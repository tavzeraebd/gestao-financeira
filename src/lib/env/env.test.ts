import { afterEach, describe, expect, it, vi } from "vitest";

const URL_OK = "http://127.0.0.1:54321";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("publicEnv", () => {
  it("carrega com variáveis válidas", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_OK);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "chave-de-teste");
    const { publicEnv } = await import("./public");
    expect(publicEnv.NEXT_PUBLIC_SUPABASE_URL).toBe(URL_OK);
  });

  it("falha com variável ausente", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", URL_OK);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    await expect(import("./public")).rejects.toThrow(
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("falha com URL inválida", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "isto-nao-e-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "x");
    await expect(import("./public")).rejects.toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});

describe("serverEnv", () => {
  it("falha com APP_URL ausente ou inválida", async () => {
    vi.doMock("server-only", () => ({}));
    const { serverEnv } = await import("./server");
    vi.stubEnv("APP_URL", "");
    expect(() => serverEnv.APP_URL).toThrow(/APP_URL/);
    vi.stubEnv("APP_URL", "ftp://exemplo.test");
    expect(() => serverEnv.APP_URL).toThrow(/APP_URL/);
  });

  it("falha com LOG_LEVEL inválido e normaliza APP_URL", async () => {
    vi.doMock("server-only", () => ({}));
    const { serverEnv } = await import("./server");
    vi.stubEnv("LOG_LEVEL", "verboso");
    expect(() => serverEnv.LOG_LEVEL).toThrow(/LOG_LEVEL/);
    vi.stubEnv("APP_URL", "http://localhost:3000/");
    expect(serverEnv.APP_URL).toBe("http://localhost:3000");
  });

  it("TRUSTED_PROXY_HOPS: padrão 1, aceita 0..5 e rejeita o resto", async () => {
    vi.doMock("server-only", () => ({}));
    const { serverEnv } = await import("./server");
    vi.stubEnv("TRUSTED_PROXY_HOPS", "");
    expect(serverEnv.TRUSTED_PROXY_HOPS).toBe(1);
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    expect(serverEnv.TRUSTED_PROXY_HOPS).toBe(0);
    vi.stubEnv("TRUSTED_PROXY_HOPS", "5");
    expect(serverEnv.TRUSTED_PROXY_HOPS).toBe(5);
    for (const bad of ["6", "-1", "1.5", "um", "NaN"]) {
      vi.stubEnv("TRUSTED_PROXY_HOPS", bad);
      expect(() => serverEnv.TRUSTED_PROXY_HOPS).toThrow(/TRUSTED_PROXY_HOPS/);
    }
  });

  it("LOG_HMAC_KEY: opcional, mínimo de 32 caracteres", async () => {
    vi.doMock("server-only", () => ({}));
    const { serverEnv } = await import("./server");
    vi.stubEnv("LOG_HMAC_KEY", "");
    expect(serverEnv.LOG_HMAC_KEY).toBeUndefined();
    vi.stubEnv("LOG_HMAC_KEY", "k".repeat(32));
    expect(serverEnv.LOG_HMAC_KEY).toBe("k".repeat(32));
    vi.stubEnv("LOG_HMAC_KEY", "curta");
    expect(() => serverEnv.LOG_HMAC_KEY).toThrow(/LOG_HMAC_KEY/);
  });
});
