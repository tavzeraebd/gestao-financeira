import "server-only";
import { z } from "zod";

const appUrl = z
  .url({ protocol: /^https?$/ })
  .transform((v) => v.replace(/\/+$/, ""));

const logLevel = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.enum(["debug", "info", "warn", "error"]).default("info"),
);

// Quantos proxies confiáveis (do lado do servidor) acrescentam a `x-forwarded-for`. 0 = sem IP confiável.
const trustedProxyHops = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce.number().int().min(0).max(5).default(1),
);

// Chave do HMAC do e-mail no log. Opcional: sem ela o campo é omitido (nunca há hash sem chave).
const logHmacKey = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.string().min(32).optional(),
);

function read<T>(name: string, schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Variável de ambiente ausente ou inválida: ${name}`);
  }
  return result.data;
}

// Leitura preguiçosa por variável: cada consumidor só exige o que usa.
export const serverEnv = {
  get APP_URL(): string {
    return read("APP_URL", appUrl, process.env.APP_URL);
  },
  get LOG_LEVEL(): "debug" | "info" | "warn" | "error" {
    return read("LOG_LEVEL", logLevel, process.env.LOG_LEVEL);
  },
  get TRUSTED_PROXY_HOPS(): number {
    return read(
      "TRUSTED_PROXY_HOPS",
      trustedProxyHops,
      process.env.TRUSTED_PROXY_HOPS,
    );
  },
  get LOG_HMAC_KEY(): string | undefined {
    return read("LOG_HMAC_KEY", logHmacKey, process.env.LOG_HMAC_KEY);
  },
};
