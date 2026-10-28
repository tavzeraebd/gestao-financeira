import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/server/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
}));

import {
  emailRateKey,
  hitIpRateLimit,
  hitRateLimit,
  isIpRateLimited,
  isRateLimited,
  MAX_RATE_LIMIT_KEYS,
  rateLimitKeyCount,
  RATE_LIMIT_BUCKETS,
  resetRateLimits,
} from "@/server/rate-limit";

const SEC = 1000;

describe("rate-limit (CA-E9-34)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-28T12:00:00Z"));
    resetRateLimits();
    warn.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("janela fixa: permite até o limite e bloqueia a tentativa seguinte", () => {
    const { limit } = RATE_LIMIT_BUCKETS.auth_ip;
    for (let i = 0; i < limit; i++) {
      expect(hitRateLimit("auth_ip", "1.1.1.1").allowed).toBe(true);
    }
    expect(hitRateLimit("auth_ip", "1.1.1.1")).toEqual({
      allowed: false,
      retryAfterSeconds: 300,
    });
  });

  it("retryAfterSeconds acompanha o relógio da janela", () => {
    const { limit } = RATE_LIMIT_BUCKETS.auth_ip;
    for (let i = 0; i < limit; i++) hitRateLimit("auth_ip", "1.1.1.1");
    vi.advanceTimersByTime(100 * SEC);
    expect(hitRateLimit("auth_ip", "1.1.1.1").retryAfterSeconds).toBe(200);
    vi.advanceTimersByTime(199_500);
    expect(hitRateLimit("auth_ip", "1.1.1.1").retryAfterSeconds).toBe(1);
  });

  it("reinicia ao fim da janela (expiração libera)", () => {
    const { limit, windowSeconds } = RATE_LIMIT_BUCKETS.auth_ip;
    for (let i = 0; i <= limit; i++) hitRateLimit("auth_ip", "1.1.1.1");
    expect(hitRateLimit("auth_ip", "1.1.1.1").allowed).toBe(false);
    vi.advanceTimersByTime(windowSeconds * SEC - 1);
    expect(hitRateLimit("auth_ip", "1.1.1.1").allowed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(hitRateLimit("auth_ip", "1.1.1.1")).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it("aceita o relógio injetado (now)", () => {
    const t0 = 1_000_000;
    const { limit, windowSeconds } = RATE_LIMIT_BUCKETS.account_deletion;
    for (let i = 0; i <= limit; i++) hitRateLimit("account_deletion", "u", t0);
    expect(hitRateLimit("account_deletion", "u", t0 + 10 * SEC)).toEqual({
      allowed: false,
      retryAfterSeconds: windowSeconds - 10,
    });
    expect(
      hitRateLimit("account_deletion", "u", t0 + windowSeconds * SEC).allowed,
    ).toBe(true);
  });

  it("separa por balde e por chave", () => {
    const { limit } = RATE_LIMIT_BUCKETS.auth_email_target;
    for (let i = 0; i <= limit; i++) hitRateLimit("auth_email_target", "a");
    expect(hitRateLimit("auth_email_target", "a").allowed).toBe(false);
    expect(hitRateLimit("auth_email_target", "b").allowed).toBe(true);
    expect(hitRateLimit("auth_email_ip", "a").allowed).toBe(true);
  });

  it("isRateLimited não incrementa e só trava quando o limite foi esgotado", () => {
    const { limit } = RATE_LIMIT_BUCKETS.auth_failure;
    for (let i = 0; i < limit - 1; i++) hitRateLimit("auth_failure", "k");
    expect(isRateLimited("auth_failure", "k").allowed).toBe(true);
    expect(isRateLimited("auth_failure", "k").allowed).toBe(true);
    hitRateLimit("auth_failure", "k");
    expect(isRateLimited("auth_failure", "k")).toEqual({
      allowed: false,
      retryAfterSeconds: 900,
    });
    expect(isRateLimited("auth_failure", "outra").allowed).toBe(true);
    // consultar não criou chaves
    expect(rateLimitKeyCount()).toBe(1);
  });

  it("isRateLimited libera depois da expiração", () => {
    const { limit, windowSeconds } = RATE_LIMIT_BUCKETS.auth_failure;
    for (let i = 0; i < limit; i++) hitRateLimit("auth_failure", "k");
    expect(isRateLimited("auth_failure", "k").allowed).toBe(false);
    vi.advanceTimersByTime(windowSeconds * SEC);
    expect(isRateLimited("auth_failure", "k").allowed).toBe(true);
  });

  it("o número de chaves não passa do teto (descarta as mais antigas)", () => {
    for (let i = 0; i < MAX_RATE_LIMIT_KEYS + 10; i++) {
      hitRateLimit("anon_actions", `ip-${i}`);
    }
    expect(rateLimitKeyCount()).toBe(MAX_RATE_LIMIT_KEYS);
    // as mais recentes continuam contadas; as mais antigas foram descartadas
    const { limit } = RATE_LIMIT_BUCKETS.anon_actions;
    for (let i = 0; i < limit; i++) hitRateLimit("anon_actions", "recente");
    expect(hitRateLimit("anon_actions", "recente").allowed).toBe(false);
  });

  it("ao estourar o teto, varre as chaves expiradas antes de descartar", () => {
    for (let i = 0; i < MAX_RATE_LIMIT_KEYS; i++) {
      hitRateLimit("anon_actions", `ip-${i}`);
    }
    vi.advanceTimersByTime(61 * SEC);
    hitRateLimit("anon_actions", "nova");
    expect(rateLimitKeyCount()).toBe(1);
  });

  it("o estado sobrevive a recarga de módulo", async () => {
    const { limit } = RATE_LIMIT_BUCKETS.auth_ip;
    for (let i = 0; i < limit; i++) hitRateLimit("auth_ip", "1.1.1.1");
    vi.resetModules();
    const reloaded = await import("@/server/rate-limit");
    expect(reloaded.hitRateLimit).not.toBe(hitRateLimit);
    expect(reloaded.hitRateLimit("auth_ip", "1.1.1.1").allowed).toBe(false);
  });

  it("emailRateKey normaliza e não contém o e-mail", () => {
    expect(emailRateKey("  ANA@Example.test ")).toBe(
      emailRateKey("ana@example.test"),
    );
    expect(emailRateKey("ana@example.test")).toMatch(/^[0-9a-f]{64}$/);
    expect(emailRateKey("ana@example.test")).not.toContain("ana");
  });
});

describe("baldes por IP com IP nulo (ADR-0034 §6)", () => {
  beforeEach(() => {
    resetRateLimits();
    warn.mockReset();
  });

  it("ignora o balde (nunca trava) e avisa uma vez", () => {
    for (let i = 0; i < 200; i++) {
      expect(hitIpRateLimit("anon_actions", null, "req-1").allowed).toBe(true);
    }
    expect(isIpRateLimited("auth_failure", null, "req-1", "x").allowed).toBe(
      true,
    );
    expect(rateLimitKeyCount()).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CLIENT_IP_UNAVAILABLE" }),
    );
  });

  it("com IP, conta por IP e por IP + sufixo", () => {
    const { limit } = RATE_LIMIT_BUCKETS.auth_failure;
    for (let i = 0; i < limit; i++) {
      hitIpRateLimit("auth_failure", "1.1.1.1", "r", "email-a");
    }
    expect(
      isIpRateLimited("auth_failure", "1.1.1.1", "r", "email-a").allowed,
    ).toBe(false);
    expect(
      isIpRateLimited("auth_failure", "1.1.1.1", "r", "email-b").allowed,
    ).toBe(true);
    expect(
      isIpRateLimited("auth_failure", "2.2.2.2", "r", "email-a").allowed,
    ).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
