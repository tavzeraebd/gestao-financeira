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
});
