import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logger, type LogFields } from "@/server/logger";

const ID = "6f1c2b3a-1111-4222-8333-944455556666";

describe("logger", () => {
  let out: string[];

  beforeEach(() => {
    process.env.LOG_LEVEL = "debug";
    out = [];
    const sink = (line: string) => void out.push(line);
    vi.spyOn(console, "log").mockImplementation(sink);
    vi.spyOn(console, "warn").mockImplementation(sink);
    vi.spyOn(console, "error").mockImplementation(sink);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it("emite uma linha JSON com os campos permitidos", () => {
    logger.info({
      requestId: ID,
      module: "family",
      operation: "createFamily",
      code: "OK",
      durationMs: 12.4,
      userId: ID,
      familyId: ID,
    });
    expect(out).toHaveLength(1);
    const parsed = JSON.parse(out[0] as string);
    expect(parsed).toMatchObject({
      level: "info",
      requestId: ID,
      module: "family",
      operation: "createFamily",
      code: "OK",
      durationMs: 12,
      userId: ID,
      familyId: ID,
    });
    expect(typeof parsed.ts).toBe("string");
  });

  it("a tipagem rejeita campos fora da allowlist", () => {
    const bad: LogFields = {
      requestId: ID,
      module: "m",
      operation: "o",
      // @ts-expect-error `token` não faz parte de LogFields
      token: "x",
    };
    expect(bad).toBeDefined();
  });

  it("em runtime não serializa token, email, password nem campos desconhecidos", () => {
    const sneaky = {
      requestId: ID,
      module: "auth",
      operation: "signIn",
      token: "a".repeat(64),
      email: "pessoa@example.com",
      password: "Senha123",
      cookie: "sb-x=1",
    } as unknown as LogFields;
    logger.warn(sneaky);
    const line = out[0] as string;
    expect(line).not.toContain("a".repeat(64));
    expect(line).not.toContain("pessoa@example.com");
    expect(line).not.toContain("Senha123");
    expect(line).not.toContain("sb-x");
    expect(Object.keys(JSON.parse(line)).sort()).toEqual(
      ["level", "module", "operation", "requestId", "ts"].sort(),
    );
  });

  it("descarta valor fora do formato (e-mail em userId, texto livre em code)", () => {
    logger.error({
      requestId: ID,
      module: "auth",
      operation: "x",
      userId: "pessoa@example.com",
      code: "mensagem com espaços e dados",
    });
    const parsed = JSON.parse(out[0] as string);
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("code");
  });

  it("respeita LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    logger.info({ requestId: ID, module: "m", operation: "o" });
    logger.warn({ requestId: ID, module: "m", operation: "o" });
    expect(out).toHaveLength(1);
  });

  it("LOG_LEVEL vazio vale info", () => {
    process.env.LOG_LEVEL = "";
    logger.debug({ requestId: ID, module: "m", operation: "o" });
    logger.info({ requestId: ID, module: "m", operation: "o" });
    expect(out).toHaveLength(1);
  });

  it("aceita ip (IPv4/IPv6), emailHmac (16 hex) e inviteId (uuid) — CA-E9-30", () => {
    logger.warn({
      requestId: ID,
      module: "auth",
      operation: "signIn",
      ip: "203.0.113.7",
      emailHmac: "0123456789abcdef",
      inviteId: ID,
    });
    logger.warn({
      requestId: ID,
      module: "auth",
      operation: "signIn",
      ip: "2001:db8::1",
    });
    expect(JSON.parse(out[0] as string)).toMatchObject({
      ip: "203.0.113.7",
      emailHmac: "0123456789abcdef",
      inviteId: ID,
    });
    expect(JSON.parse(out[1] as string)).toMatchObject({ ip: "2001:db8::1" });
  });

  it("descarta ip, emailHmac e inviteId fora do padrão (texto, e-mail, uuid malformado)", () => {
    const bad = [
      { ip: "pessoa@example.com" },
      { ip: "999.1.1.1" },
      { ip: "fe80::1%eth0" },
      { ip: `${"1".repeat(46)}` },
      { emailHmac: "pessoa@example.com" },
      { emailHmac: "0123456789abcde" },
      { emailHmac: "0123456789abcdeg" },
      { emailHmac: "0123456789abcdef0" },
      { inviteId: "nao-e-uuid" },
      { inviteId: "6f1c2b3a-1111-4222-8333-94445555666" },
    ];
    for (const extra of bad) {
      logger.warn({
        requestId: ID,
        module: "auth",
        operation: "signIn",
        ...extra,
      });
    }
    for (const line of out) {
      expect(Object.keys(JSON.parse(line)).sort()).toEqual(
        ["level", "module", "operation", "requestId", "ts"].sort(),
      );
    }
    expect(out).toHaveLength(bad.length);
  });
});
