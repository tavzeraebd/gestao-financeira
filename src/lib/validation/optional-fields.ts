import { z } from "zod";

/** Texto opcional: aparado; string vazia vira `undefined`. */
export function optionalText(max: number, tooLongMessage: string) {
  return z
    .string()
    .trim()
    .max(max, tooLongMessage)
    .transform((value) => (value === "" ? undefined : value))
    .optional();
}

/** Id opcional: string vazia vira `undefined` (select "sem valor"). */
export function optionalUuid(message: string) {
  return z
    .string()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.uuid(message).optional())
    .optional();
}
