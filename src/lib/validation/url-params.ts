import { parseISODate, type ISODate } from "@/lib/dates";

/** Parâmetro repetido na URL usa o primeiro valor. */
export function firstParam(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

/** Entrada que não é objeto (null, texto, lista) vira objeto vazio: filtro de URL nunca lança. */
export function paramsObject(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/** Data civil válida ou `undefined`. */
export function dateParam(value: unknown): ISODate | undefined {
  const first = firstParam(value);
  return typeof first === "string"
    ? (parseISODate(first) ?? undefined)
    : undefined;
}

/** Página 1-based; qualquer coisa que não seja inteiro seguro >= 1 vira 1. */
export function pageParam(value: unknown): number {
  const first = firstParam(value);
  if (typeof first !== "string" && typeof first !== "number") return 1;
  const n = Number(first);
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

/** Um dos valores permitidos ou `undefined`. */
export function enumParam<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | undefined {
  const first = firstParam(value);
  return typeof first === "string" &&
    (allowed as readonly string[]).includes(first)
    ? (first as T[number])
    : undefined;
}
