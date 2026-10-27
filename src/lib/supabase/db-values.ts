import "server-only";
import { parseISODate, type ISODate } from "@/lib/dates";
import { toDbNumeric, type Cents } from "@/lib/money";

/**
 * Valor monetário para gravar. Os tipos gerados dizem `number`, mas o PostgREST aceita a string
 * decimal (`"1234.56"`) e assim o dinheiro nunca passa por ponto flutuante (contrato §0.5).
 */
export function numericParam(c: Cents): number {
  return toDbNumeric(c) as unknown as number;
}

/** Coluna `date` do banco -> `ISODate`; lança se o valor não for uma data civil válida. */
export function dbDate(value: string): ISODate {
  const date = parseISODate(value);
  if (!date) throw new RangeError("Data inválida no banco.");
  return date;
}
