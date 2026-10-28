import "server-only";
import { createHash } from "node:crypto";
import { logger } from "@/server/logger";

/**
 * Rate limit de janela fixa em memória do processo (ADR-0034). Sem dependência nem serviço
 * externo: vale para UMA instância; reiniciar zera os contadores (aceito pelo ADR).
 */
export const RATE_LIMIT_BUCKETS = {
  /** Ações autenticadas, por `userId`. */
  user_actions: { limit: 120, windowSeconds: 60 },
  /** Ações sem sessão, por IP. */
  anon_actions: { limit: 60, windowSeconds: 60 },
  /** Tentativas de login, por IP. */
  auth_ip: { limit: 30, windowSeconds: 300 },
  /** Falhas de login, por IP + hash do e-mail. */
  auth_failure: { limit: 5, windowSeconds: 900 },
  /** Cadastro, reenvio e recuperação (envio de e-mail), por IP. */
  auth_email_ip: { limit: 5, windowSeconds: 600 },
  /** Cadastro, reenvio e recuperação (envio de e-mail), por hash do e-mail. */
  auth_email_target: { limit: 3, windowSeconds: 3600 },
  /** Exclusão de conta, por `userId`. */
  account_deletion: { limit: 3, windowSeconds: 3600 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMIT_BUCKETS;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/** Teto de chaves no mapa; ao estourar, varre as expiradas e descarta as mais antigas. */
export const MAX_RATE_LIMIT_KEYS = 50000;

type Entry = { count: number; resetAt: number };
type Store = {
  entries: Map<string, Entry>;
  lastSweep: number;
  warnedNoIp: boolean;
};

// Preso a `globalThis`: sobrevive à recarga de módulo (HMR em dev, bundles separados no Next).
const STORE_KEY = Symbol.for("nucleo.rateLimit.store");

function store(): Store {
  const g = globalThis as { [STORE_KEY]?: Store };
  return (g[STORE_KEY] ??= {
    entries: new Map(),
    lastSweep: 0,
    warnedNoIp: false,
  });
}

function sweepExpired(s: Store, now: number): void {
  for (const [key, entry] of s.entries) {
    if (entry.resetAt <= now) s.entries.delete(key);
  }
  s.lastSweep = now;
}

function makeRoom(s: Store, now: number): void {
  if (s.entries.size < MAX_RATE_LIMIT_KEYS) return;
  // A varredura é O(n): no máximo uma por segundo, para que um atacante com muitas chaves
  // distintas não a dispare a cada requisição.
  if (now - s.lastSweep >= 1000) sweepExpired(s, now);
  // Ainda cheio: descarta as mais antigas (o Map preserva a ordem de inserção).
  for (const key of s.entries.keys()) {
    if (s.entries.size < MAX_RATE_LIMIT_KEYS) break;
    s.entries.delete(key);
  }
}

function composite(bucket: RateLimitBucket, key: string): string {
  return `${bucket}\u0000${key}`;
}

function liveEntry(s: Store, id: string, now: number): Entry | undefined {
  const entry = s.entries.get(id);
  if (entry && entry.resetAt <= now) {
    s.entries.delete(id);
    return undefined;
  }
  return entry;
}

/**
 * Registra uma tentativa na janela do balde para `key`. `allowed` é falso a partir da
 * tentativa `limit + 1`; `retryAfterSeconds` é o tempo até a janela reiniciar.
 */
export function hitRateLimit(
  bucket: RateLimitBucket,
  key: string,
  now: number = Date.now(),
): RateLimitResult {
  const { limit, windowSeconds } = RATE_LIMIT_BUCKETS[bucket];
  const s = store();
  const id = composite(bucket, key);
  let entry = liveEntry(s, id, now);
  if (!entry) {
    makeRoom(s, now);
    entry = { count: 0, resetAt: now + windowSeconds * 1000 };
    s.entries.set(id, entry);
  }
  entry.count += 1;
  const allowed = entry.count <= limit;
  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.ceil((entry.resetAt - now) / 1000),
  };
}

/**
 * Consulta sem incrementar: `allowed` é falso quando a janela já esgotou o limite
 * (`count >= limit`), ou seja, a próxima tentativa já estouraria.
 */
export function isRateLimited(
  bucket: RateLimitBucket,
  key: string,
  now: number = Date.now(),
): RateLimitResult {
  const { limit } = RATE_LIMIT_BUCKETS[bucket];
  const entry = liveEntry(store(), composite(bucket, key), now);
  if (!entry || entry.count < limit) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

/** Somente testes: zera todos os contadores e o aviso de IP ausente. */
export function resetRateLimits(): void {
  const s = store();
  s.entries.clear();
  s.lastSweep = 0;
  s.warnedNoIp = false;
}

/** Somente testes: quantidade de chaves em memória. */
export function rateLimitKeyCount(): number {
  return store().entries.size;
}

/**
 * Chave do e-mail nos baldes: `sha256` do e-mail normalizado, só em memória. Nunca é logada nem
 * persistida (o `emailHmac` do log é outro valor, com chave: ADR-0035).
 */
export function emailRateKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * Balde por IP. Sem IP confiável (`null`) o balde é IGNORADO (`allowed`), jamais uma chave
 * compartilhada que travaria todos; o log avisa uma vez por processo (ADR-0034 §6).
 * `suffix` compõe a chave quando o balde é IP + algo (ex.: `auth_failure`).
 */
export function hitIpRateLimit(
  bucket: RateLimitBucket,
  ip: string | null,
  requestId: string,
  suffix?: string,
  now?: number,
): RateLimitResult {
  if (ip === null) {
    warnNoIpOnce(requestId);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return hitRateLimit(bucket, suffix ? `${ip}|${suffix}` : ip, now);
}

/** Versão sem incremento de `hitIpRateLimit`. */
export function isIpRateLimited(
  bucket: RateLimitBucket,
  ip: string | null,
  requestId: string,
  suffix?: string,
  now?: number,
): RateLimitResult {
  if (ip === null) {
    warnNoIpOnce(requestId);
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return isRateLimited(bucket, suffix ? `${ip}|${suffix}` : ip, now);
}

function warnNoIpOnce(requestId: string): void {
  const s = store();
  if (s.warnedNoIp) return;
  s.warnedNoIp = true;
  logger.warn({
    requestId,
    module: "rate-limit",
    operation: "clientIp",
    code: "CLIENT_IP_UNAVAILABLE",
  });
}
