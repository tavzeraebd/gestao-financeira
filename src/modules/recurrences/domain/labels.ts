import type { ISODate } from "@/lib/dates";
import {
  FREQUENCY_LABELS,
  FREQUENCY_UNITS,
  type Frequency,
} from "../constants";

const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
});

/**
 * Descrição legível da agenda (imutável, ADR-0023): "Toda semana (sexta-feira)", "A cada 2 semanas",
 * "Todo mês, dia 31", "A cada 3 meses, dia 10", "Todo ano, 29/02".
 */
export function frequencyLabel(
  frequency: Frequency,
  intervalCount: number,
  startDate: ISODate,
): string {
  const [year = 2000, month = 1, day = 1] = startDate.split("-").map(Number);
  const lead =
    intervalCount === 1
      ? FREQUENCY_LABELS[frequency]
      : `A cada ${intervalCount} ${FREQUENCY_UNITS[frequency][1]}`;

  if (frequency === "weekly") {
    if (intervalCount !== 1) return lead;
    const date = new Date(Date.UTC(2000, month - 1, day));
    date.setUTCFullYear(year);
    return `${lead} (${weekdayFormatter.format(date)})`;
  }
  if (frequency === "monthly") return `${lead}, dia ${day}`;
  return `${lead}, ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
}
