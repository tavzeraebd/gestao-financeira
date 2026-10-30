import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";
import { occurrenceDate } from "@/modules/reports/domain/commitments";
import type { Frequency } from "../constants";

/** Teto de iterações: uma série semanal começa, no máximo, 12 meses atrás (~52 passos). */
const MAX_STEPS = 2000;

/**
 * Próxima data da agenda (>= hoje) de uma série em desconto em folha. Essas séries nunca viram
 * transações, então o banco não avança o ponteiro `next_occurrence_date`: a data vem da agenda
 * (mesma regra do dashboard). `null` quando a série já terminou (`endDate` anterior à data).
 */
export function nextPayrollOccurrence(
  series: {
    frequency: Frequency;
    intervalCount: number;
    startDate: ISODate;
    endDate: ISODate | null;
  },
  today: ISODate,
): ISODate | null {
  const base = {
    type: "expense" as const,
    amount: asCents(0),
    description: "",
    categoryId: "",
    nextOccurrenceDate: series.startDate,
    payrollDeduction: true,
    ...series,
  };
  for (let n = 0; n < MAX_STEPS; n += 1) {
    const date = occurrenceDate(base, n);
    if (series.endDate !== null && date > series.endDate) return null;
    if (date >= today) return date;
  }
  return null;
}
