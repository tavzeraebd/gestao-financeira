import { z } from "zod";
import { compareISODate, parseISODate, today, type ISODate } from "@/lib/dates";

const MIN_DATE = "2000-01-01" as ISODate;

/** Campo de data civil `YYYY-MM-DD` (≥ 2000-01-01). `notAfterToday` usa `today()` de America/Sao_Paulo. */
export function isoDate(opts: { notAfterToday?: boolean } = {}) {
  return z
    .string({ error: "Informe uma data." })
    .transform((value, ctx): ISODate => {
      const date = parseISODate(value);
      const message =
        date === null
          ? value.trim() === ""
            ? "Informe uma data."
            : "Informe uma data válida."
          : compareISODate(date, MIN_DATE) < 0
            ? "Use uma data a partir de 01/01/2000."
            : opts.notAfterToday && compareISODate(date, today()) > 0
              ? "A data não pode ser futura."
              : null;
      if (message !== null || date === null) {
        ctx.issues.push({
          code: "custom",
          message: message ?? "Informe uma data válida.",
          input: value,
        });
        return z.NEVER;
      }
      return date;
    });
}
