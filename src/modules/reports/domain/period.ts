import {
  addDays,
  addMonths,
  compareISODate,
  diffInDays,
  endOfMonth,
  formatDateBR,
  formatMonthBR,
  startOfMonth,
  type ISODate,
} from "@/lib/dates";
import {
  CASH_FLOW_MONTHS,
  MAX_PERIOD_DAYS,
  MIN_PERIOD_DATE,
} from "../constants";
import type { DashboardFilters, DashboardPeriod } from "../types";

function isFullMonth(from: ISODate, to: ISODate): boolean {
  return from === startOfMonth(from) && to === endOfMonth(from);
}

export function labelOf(from: ISODate, to: ISODate): string {
  return isFullMonth(from, to)
    ? formatMonthBR(from, "long")
    : `${formatDateBR(from)} a ${formatDateBR(to)}`;
}

/** D4: mês civil inteiro -> mês civil anterior; senão, os N dias imediatamente anteriores. */
export function previousPeriod(
  from: ISODate,
  to: ISODate,
): { from: ISODate; to: ISODate } {
  if (isFullMonth(from, to)) {
    const previousFrom = addMonths(from, -1);
    return { from: previousFrom, to: endOfMonth(previousFrom) };
  }
  const days = diffInDays(from, to) + 1;
  const previousTo = addDays(from, -1);
  return { from: addDays(previousTo, -(days - 1)), to: previousTo };
}

/** D17: 6 meses civis terminando no mês de `to`. */
export function cashFlowWindow(to: ISODate): { from: ISODate; to: ISODate } {
  return {
    from: addMonths(startOfMonth(to), -(CASH_FLOW_MONTHS - 1)),
    to: endOfMonth(to),
  };
}

export function isValidCustom(
  de: ISODate | undefined,
  ate: ISODate | undefined,
  today: ISODate,
): de is ISODate {
  if (!de || !ate) return false;
  return (
    compareISODate(de, ate) <= 0 &&
    compareISODate(de, MIN_PERIOD_DATE) >= 0 &&
    compareISODate(ate, endOfMonth(today)) <= 0 &&
    diffInDays(de, ate) + 1 <= MAX_PERIOD_DAYS
  );
}

/** D20: resolve o filtro da URL em período e período anterior. Personalizado inválido cai em `mes_atual`. */
export function resolvePeriod(
  filters: DashboardFilters,
  today: ISODate,
): DashboardPeriod {
  let preset = filters.periodo;
  let from = startOfMonth(today);
  let to = endOfMonth(today);

  if (preset === "mes_anterior") {
    from = addMonths(startOfMonth(today), -1);
    to = endOfMonth(from);
  } else if (preset === "personalizado") {
    if (isValidCustom(filters.de, filters.ate, today) && filters.ate) {
      from = filters.de;
      to = filters.ate;
    } else {
      preset = "mes_atual";
    }
  }

  const previous = previousPeriod(from, to);
  return {
    preset,
    from,
    to,
    previousFrom: previous.from,
    previousTo: previous.to,
    label: labelOf(from, to),
    previousLabel: labelOf(previous.from, previous.to),
  };
}
