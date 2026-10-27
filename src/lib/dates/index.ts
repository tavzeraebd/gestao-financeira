/**
 * Datas civis do app (`YYYY-MM-DD`), sempre em America/Sao_Paulo. TS puro: usa só `Intl` e
 * aritmética em UTC (nenhuma dependência de fuso do aparelho, exceto nas duas funções de calendário).
 */
export const APP_TIME_ZONE = "America/Sao_Paulo";

export type ISODate = string & { readonly __brand: "ISODate" };

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const todayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const longFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const pad = (n: number, size: number) => String(n).padStart(size, "0");

function build(year: number, month: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as ISODate;
}

function partsOf(d: string): { year: number; month: number; day: number } {
  const match = ISO_PATTERN.exec(d);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year); // anos < 100 não viram 19xx
  if (
    !match ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError("Data ISO inválida.");
  }
  return { year, month, day };
}

/** Data civil de hoje (ou de `now`) em America/Sao_Paulo. Nunca use `toISOString().slice(0, 10)`. */
export function today(now: Date = new Date()): ISODate {
  const parts = todayFormatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}` as ISODate;
}

/** Aceita só `YYYY-MM-DD` de um dia real do calendário (rejeita `2026-02-30`). */
export function parseISODate(s: string): ISODate | null {
  if (typeof s !== "string" || !ISO_PATTERN.test(s)) return null;
  try {
    partsOf(s);
  } catch {
    return null;
  }
  return s as ISODate;
}

export function isISODate(s: string): s is ISODate {
  return parseISODate(s) !== null;
}

/** `"23/10/2026"` (short) ou `"23 de out. de 2026"` (long). */
export function formatDateBR(
  d: ISODate,
  style: "short" | "long" = "short",
): string {
  const { year, month, day } = partsOf(d);
  if (style === "short")
    return `${pad(day, 2)}/${pad(month, 2)}/${pad(year, 4)}`;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCFullYear(year);
  return longFormatter.format(date);
}

export function addDays(d: ISODate, n: number): ISODate {
  const { year, month, day } = partsOf(d);
  const date = new Date(Date.UTC(year, month - 1, day + n));
  return build(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

export function startOfMonth(d: ISODate): ISODate {
  const { year, month } = partsOf(d);
  return build(year, month, 1);
}

export function endOfMonth(d: ISODate): ISODate {
  const { year, month } = partsOf(d);
  // Dia 0 do mês seguinte = último dia do mês atual.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return build(year, month, last);
}

/** Só para o calendário: meia-noite local da data civil. */
export function isoToLocalDate(d: ISODate): Date {
  const { year, month, day } = partsOf(d);
  return new Date(year, month - 1, day);
}

/** Só para o calendário: data civil escolhida no fuso do aparelho. */
export function localDateToISO(date: Date): ISODate {
  return build(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

const monthShortFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "short",
});

const monthLongFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

/** Soma meses civis; dia âncora maior que o mês de destino vira o último dia (como o Postgres). */
export function addMonths(d: ISODate, n: number): ISODate {
  if (!Number.isInteger(n)) throw new RangeError("Informe meses inteiros.");
  const { year, month, day } = partsOf(d);
  const index = year * 12 + (month - 1) + n;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const leap =
    (targetYear % 4 === 0 && targetYear % 100 !== 0) || targetYear % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return build(targetYear, targetMonth, Math.min(day, lengths[targetMonth - 1] ?? 28));
}

/** Dias corridos de `a` até `b` (`b − a`). */
export function diffInDays(a: ISODate, b: ISODate): number {
  const toDays = (iso: ISODate) => {
    const { year, month, day } = partsOf(iso);
    const date = new Date(Date.UTC(2000, month - 1, day));
    date.setUTCFullYear(year);
    return Math.round(date.getTime() / 86_400_000);
  };
  return toDays(b) - toDays(a);
}

/** `"out."` (short) ou `"outubro de 2026"` (long). */
export function formatMonthBR(d: ISODate, style: "short" | "long"): string {
  const { year, month } = partsOf(d);
  const date = new Date(Date.UTC(2000, month - 1, 1));
  date.setUTCFullYear(year);
  return style === "short"
    ? monthShortFormatter.format(date)
    : monthLongFormatter.format(date);
}

export function compareISODate(a: ISODate, b: ISODate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}
