import { describe, expect, it } from "vitest";
import { resolveClientIp } from "@/lib/client-ip";

describe("resolveClientIp (CA-E9-31)", () => {
  it("hops = 1 usa a última entrada e ignora as forjadas à esquerda", () => {
    expect(resolveClientIp("9.9.9.9, 8.8.8.8, 203.0.113.7", 1)).toBe(
      "203.0.113.7",
    );
  });

  it("hops = 2 usa a penúltima entrada", () => {
    expect(resolveClientIp("9.9.9.9, 203.0.113.7, 10.0.0.1", 2)).toBe(
      "203.0.113.7",
    );
  });

  it("aceita IPv4 simples e IPv6", () => {
    expect(resolveClientIp("203.0.113.7", 1)).toBe("203.0.113.7");
    expect(resolveClientIp("1.1.1.1, 2001:db8::1", 1)).toBe("2001:db8::1");
    expect(resolveClientIp("::1", 1)).toBe("::1");
  });

  it("hops = 0 desativa", () => {
    expect(resolveClientIp("203.0.113.7", 0)).toBeNull();
  });

  it("hops inválido (negativo, fracionário, NaN) devolve null", () => {
    expect(resolveClientIp("203.0.113.7", -1)).toBeNull();
    expect(resolveClientIp("203.0.113.7", 1.5)).toBeNull();
    expect(resolveClientIp("203.0.113.7", Number.NaN)).toBeNull();
  });

  it("lista menor que hops devolve null (não cai para a entrada do cliente)", () => {
    expect(resolveClientIp("203.0.113.7", 2)).toBeNull();
  });

  it("ausente, vazio ou valor inválido devolve null", () => {
    expect(resolveClientIp(null, 1)).toBeNull();
    expect(resolveClientIp("", 1)).toBeNull();
    expect(resolveClientIp("1.1.1.1, ", 1)).toBeNull();
    expect(resolveClientIp("1.1.1.1, não-é-ip", 1)).toBeNull();
    expect(resolveClientIp("1.1.1.1, 999.1.1.1", 1)).toBeNull();
    expect(resolveClientIp("1.1.1.1, pessoa@example.com", 1)).toBeNull();
    expect(resolveClientIp("1.1.1.1, fe80::1%eth0", 1)).toBeNull();
    expect(resolveClientIp(`1.1.1.1, ${"a".repeat(60)}`, 1)).toBeNull();
  });
});
