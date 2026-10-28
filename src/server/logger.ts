import "server-only";
import { isIP } from "node:net";
import { serverEnv } from "@/lib/env/server";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Allowlist de campos de log. Nada fora daqui é aceito pela tipagem nem serializado.
 * Proibido logar e-mail, nome, senha, token, cookies, headers, URL, entrada do usuário.
 */
export type LogFields = {
  requestId: string;
  module: string;
  operation: string;
  code?: string;
  durationMs?: number;
  userId?: string;
  familyId?: string;
  /** IPv4/IPv6 do cliente. Só em linhas warn/error (ADR-0035 §2). */
  ip?: string;
  /** HMAC-SHA256 com chave do e-mail (16 hex), de `emailHmac()`; nunca o e-mail. */
  emailHmac?: string;
  /** Id (uuid) do convite; nunca o token. */
  inviteId?: string;
};

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HMAC16 = /^[0-9a-f]{16}$/;
const LABEL = /^[A-Za-z0-9_.-]{1,64}$/;

function sanitize(fields: LogFields): Record<string, string | number> {
  const raw: Record<string, unknown> = { ...fields };
  const out: Record<string, string | number> = {};
  // Os valores também são validados: só identificadores curtos, nunca texto livre.
  const pick = (key: string, pattern: RegExp) => {
    const v = raw[key];
    if (typeof v === "string" && pattern.test(v)) out[key] = v;
  };
  pick("requestId", UUID);
  pick("module", LABEL);
  pick("operation", LABEL);
  pick("code", LABEL);
  pick("userId", UUID);
  pick("familyId", UUID);
  pick("emailHmac", HMAC16);
  pick("inviteId", UUID);
  const ip = raw.ip;
  if (
    typeof ip === "string" &&
    ip.length <= 45 &&
    !ip.includes("%") &&
    isIP(ip) !== 0
  ) {
    out.ip = ip;
  }
  const d = raw.durationMs;
  if (typeof d === "number" && Number.isFinite(d))
    out.durationMs = Math.round(d);
  return out;
}

export function log(level: LogLevel, fields: LogFields): void {
  if (ORDER[level] < ORDER[serverEnv.LOG_LEVEL]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    ...sanitize(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (fields: LogFields) => log("debug", fields),
  info: (fields: LogFields) => log("info", fields),
  warn: (fields: LogFields) => log("warn", fields),
  error: (fields: LogFields) => log("error", fields),
};
