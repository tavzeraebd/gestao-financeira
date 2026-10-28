import { addDays, addMonths, startOfMonth, type ISODate } from "@/lib/dates";
import type { ReportFilters, ReportPeriod } from "../types";
import { isValidCustom, labelOf, previousPeriod } from "./period";

function monthsTouching(from: ISODate, to: ISODate): ISODate[] {
  const months: ISODate[] = [];
  const last = startOfMonth(to);
  for (let m = startOfMonth(from); m <= last; m = addMonths(m, 1)) {
    months.push(m);
  }
  return months;
}

/**
 * D21: `7_dias` = [hoje − 6, hoje]; `30_dias` (padrão) = [hoje − 29, hoje]; `3_meses`/`12_meses` = do 1º dia do
 * mês (hoje − 2 / − 11 meses) até hoje; `personalizado` segue D20 (inválido cai em `30_dias`).
 * Anterior: N dias imediatamente antes (7/30 dias), pontas recuadas k meses (3/12 meses) ou D4 (personalizado).
 */
export function resolveReportPeriod(
  filters: ReportFilters,
  today: ISODate,
): ReportPeriod {
  let preset = filters.periodo;
  if (
    preset === "personalizado" &&
    !(isValidCustom(filters.de, filters.ate, today) && filters.ate)
  ) {
    preset = "30_dias";
  }

  let from: ISODate;
  let to: ISODate = today;
  let previous: { from: ISODate; to: ISODate };

  if (preset === "personalizado" && filters.de && filters.ate) {
    from = filters.de;
    to = filters.ate;
    previous = previousPeriod(from, to);
  } else if (preset === "3_meses" || preset === "12_meses") {
    const k = preset === "3_meses" ? 3 : 12;
    from = addMonths(startOfMonth(today), -(k - 1));
    previous = { from: addMonths(from, -k), to: addMonths(to, -k) };
  } else {
    const days = preset === "7_dias" ? 7 : 30;
    from = addDays(today, -(days - 1));
    const previousTo = addDays(from, -1);
    previous = { from: addDays(previousTo, -(days - 1)), to: previousTo };
  }

  return {
    preset,
    from,
    to,
    previousFrom: previous.from,
    previousTo: previous.to,
    label: labelOf(from, to),
    previousLabel: labelOf(previous.from, previous.to),
    months: monthsTouching(from, to),
  };
}
