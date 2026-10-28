import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { emailHmac, resetLogIdentityWarning } from "@/server/log-identity";

const KEY = "k".repeat(40);
const EMAIL = "ana.silva@example.test";

describe("emailHmac (CA-E9-32)", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetLogIdentityWarning();
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("LOG_HMAC_KEY", KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("é determinístico, tem 16 hex e não contém o e-mail", () => {
    const a = emailHmac(EMAIL);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(emailHmac(EMAIL)).toBe(a);
    expect(a).not.toContain("ana");
  });

  it("ignora maiúsculas e espaços nas pontas e distingue e-mails diferentes", () => {
    expect(emailHmac(`  ${EMAIL.toUpperCase()}  `)).toBe(emailHmac(EMAIL));
    expect(emailHmac("outra@example.test")).not.toBe(emailHmac(EMAIL));
  });

  it("depende da chave", () => {
    const a = emailHmac(EMAIL);
    vi.stubEnv("LOG_HMAC_KEY", "z".repeat(40));
    expect(emailHmac(EMAIL)).not.toBe(a);
  });

  it("sem chave devolve undefined e NÃO devolve hash simples", () => {
    vi.stubEnv("LOG_HMAC_KEY", "");
    const plain = createHash("sha256").update(EMAIL).digest("hex").slice(0, 16);
    const out = emailHmac(EMAIL);
    expect(out).toBeUndefined();
    expect(out).not.toBe(plain);
  });

  it("chave curta demais é tratada como ausente, sem lançar", () => {
    vi.stubEnv("LOG_HMAC_KEY", "curta");
    expect(emailHmac(EMAIL)).toBeUndefined();
  });

  it("avisa uma vez, sem o e-mail", () => {
    vi.stubEnv("LOG_HMAC_KEY", "");
    emailHmac(EMAIL);
    emailHmac(EMAIL);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("ana.silva");
  });
});
