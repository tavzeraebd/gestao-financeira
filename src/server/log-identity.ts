import "server-only";
import { createHmac } from "node:crypto";
import { serverEnv } from "@/lib/env/server";

let warnedMissingKey = false;

/**
 * Identificador pseudonimizado do e-mail para o log (ADR-0035 §3): 16 primeiros hex de
 * `HMAC-SHA256(LOG_HMAC_KEY, e-mail em minúsculas e sem espaços)`. Estável por conta, não
 * reversível por dicionário sem a chave. Sem chave (ou chave inválida) devolve `undefined`:
 * **nunca** cai para hash sem chave e nunca devolve o e-mail.
 */
export function emailHmac(email: string): string | undefined {
  let key: string | undefined;
  try {
    key = serverEnv.LOG_HMAC_KEY;
  } catch {
    // Chave curta demais: tratada como ausente (o log não pode derrubar a ação).
    key = undefined;
  }
  if (!key) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      // Sem o logger de campos: aqui não há requestId e nada do e-mail pode ir ao log.
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          module: "log-identity",
          operation: "emailHmac",
          code: "LOG_HMAC_KEY_MISSING",
        }),
      );
    }
    return undefined;
  }
  return createHmac("sha256", key)
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

/** Somente testes. */
export function resetLogIdentityWarning(): void {
  warnedMissingKey = false;
}
