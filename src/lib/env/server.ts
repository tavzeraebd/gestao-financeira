import "server-only";
import { z } from "zod";

const appUrl = z
  .url({ protocol: /^https?$/ })
  .transform((v) => v.replace(/\/+$/, ""));

const logLevel = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z.enum(["debug", "info", "warn", "error"]).default("info"),
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
};
