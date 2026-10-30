import {
  addDays,
  addMonths,
  formatMonthBR,
  startOfMonth,
  type ISODate,
} from "@/lib/dates";
import { addCents, asCents, sumCents, type Cents } from "@/lib/money";
import { MAX_OCCURRENCES_PER_SERIES } from "../constants";
import type {
  CommitmentEntry,
  CommitmentHorizon,
  CommitmentMonth,
  CommitmentNextDue,
  CommitmentOverview,
  CommitmentSeries,
} from "../types";

const ZERO = asCents(0);

/** Data da ocorrência `n` (0-based) da série; espelha `private.recurrence_occurrence` do banco. */
export function occurrenceDate(series: CommitmentSeries, n: number): ISODate {
  const step = series.intervalCount * n;
  switch (series.frequency) {
    case "weekly":
      return addDays(series.startDate, 7 * step);
    case "monthly":
      return addMonths(series.startDate, step);
    case "yearly":
      return addMonths(series.startDate, 12 * step);
  }
}

/** Menor índice cuja ocorrência é >= `target` (e >= início da série). */
function firstIndexOnOrAfter(
  series: CommitmentSeries,
  target: ISODate,
): number {
  let n = 0;
  // Pula em blocos de 16 enquanto a ocorrência ainda é anterior, depois avança de um em um.
  while (occurrenceDate(series, n + 16) < target) n += 16;
  while (occurrenceDate(series, n) < target) n += 1;
  return n;
}

/**
 * Ocorrências futuras ainda não lançadas de uma série, no intervalo `[max(próxima, hoje), end)` e até a
 * data final da série. Série sem fim é limitada pelo fim do horizonte (`end`), nunca infinita.
 * As já lançadas viram contas pendentes (o banco materializa à frente) e não entram aqui.
 */
export function expandSeries(
  series: CommitmentSeries,
  today: ISODate,
  end: ISODate,
): CommitmentEntry[] {
  const from =
    series.nextOccurrenceDate > today ? series.nextOccurrenceDate : today;
  const entries: CommitmentEntry[] = [];
  let n = firstIndexOnOrAfter(series, from);
  for (let i = 0; i < MAX_OCCURRENCES_PER_SERIES; i += 1, n += 1) {
    const date = occurrenceDate(series, n);
    if (date >= end) break;
    if (series.endDate !== null && date > series.endDate) break;
    entries.push({
      type: series.type,
      amount: series.amount,
      date,
      categoryId: series.categoryId,
      description: series.description,
      ...(series.payrollDeduction ? { payroll: true } : {}),
    });
  }
  return entries;
}

function monthLabel(month: ISODate): string {
  const short = formatMonthBR(month, "short").replace(".", "");
  return `${short}/${month.slice(2, 4)}`;
}

export type CommitmentInput = {
  today: ISODate;
  horizon: CommitmentHorizon;
  /** Contas em aberto (`pending`), de qualquer data; as além do horizonte são ignoradas. */
  pending: readonly CommitmentEntry[];
  series: readonly CommitmentSeries[];
};

export type CommitmentResult = {
  overview: CommitmentOverview;
  /** Despesas comprometidas no horizonte (contas em aberto + recorrências futuras). */
  expenses: CommitmentEntry[];
};

/**
 * Comprometimento futuro = despesas em aberto + ocorrências futuras das despesas recorrentes, por mês, do
 * mês de hoje até `horizon` meses à frente (`horizon + 1` meses). Em aberto e vencido entra no mês de hoje.
 * Séries em desconto em folha entram no comprometido (coluna `payroll`), mas ficam fora de `cashCommitted`.
 * Receita esperada = receitas a receber em aberto + ocorrências futuras das receitas recorrentes.
 */
export function buildCommitments(input: CommitmentInput): CommitmentResult {
  const { today, horizon } = input;
  const first = startOfMonth(today);
  const end = startOfMonth(addMonths(first, horizon + 1));
  const monthStarts = Array.from({ length: horizon + 1 }, (_, i) =>
    addMonths(first, i),
  );
  const index = new Map(monthStarts.map((m, i) => [m, i]));

  const pending = input.pending.filter((e) => e.date < end);
  const virtual = input.series.flatMap((s) => expandSeries(s, today, end));

  const slots = monthStarts.map(() => ({
    pending: [] as Cents[],
    recurring: [] as Cents[],
    payroll: [] as Cents[],
    income: [] as Cents[],
  }));
  const bucket = (entry: CommitmentEntry) =>
    slots[
      index.get(entry.date < first ? first : startOfMonth(entry.date)) ?? 0
    ];

  for (const entry of pending) {
    const slot = bucket(entry);
    if (entry.type === "income") slot?.income.push(entry.amount);
    else slot?.pending.push(entry.amount);
  }
  for (const entry of virtual) {
    const slot = bucket(entry);
    if (entry.type === "income") slot?.income.push(entry.amount);
    else if (entry.payroll) slot?.payroll.push(entry.amount);
    else slot?.recurring.push(entry.amount);
  }

  const months: CommitmentMonth[] = monthStarts.map((month, i) => {
    const slot = slots[i];
    const pendingTotal = sumCents(slot?.pending ?? []);
    const recurringTotal = sumCents(slot?.recurring ?? []);
    const incomeTotal = sumCents(slot?.income ?? []);
    const payrollTotal = sumCents(slot?.payroll ?? []);
    const cashCommitted = addCents(pendingTotal, recurringTotal);
    const committed = addCents(cashCommitted, payrollTotal);
    return {
      month,
      label: monthLabel(month),
      longLabel: formatMonthBR(month, "long"),
      pending: pendingTotal,
      recurring: recurringTotal,
      payroll: payrollTotal,
      cashCommitted,
      committed,
      income: incomeTotal,
      percent: incomeTotal > 0 ? (committed / incomeTotal) * 100 : null,
    };
  });

  const expenses = [...pending, ...virtual].filter((e) => e.type === "expense");

  let heaviest: CommitmentOverview["heaviest"] = null;
  for (const m of months) {
    if (
      m.committed > 0 &&
      (heaviest === null || m.committed > heaviest.committed)
    ) {
      heaviest = {
        month: m.month,
        longLabel: m.longLabel,
        committed: m.committed,
      };
    }
  }

  let nextDue: CommitmentNextDue | null = null;
  for (const e of expenses) {
    // Desconto em folha não é conta a pagar: não é "próximo vencimento".
    if (e.payroll) continue;
    if (nextDue === null || e.date < nextDue.date) {
      nextDue = {
        date: e.date,
        description: e.description,
        amount: e.amount,
        overdue: e.date < today,
      };
    }
  }

  const last = months[months.length - 1];
  const firstMonth = months[0];
  return {
    expenses,
    overview: {
      from: first,
      to: last?.month ?? first,
      horizon,
      label: `${firstMonth?.longLabel ?? ""} a ${last?.longLabel ?? ""}`,
      months,
      totalCommitted: sumCents(months.map((m) => m.committed)),
      currentMonthCommitted: firstMonth?.committed ?? ZERO,
      heaviest,
      nextDue,
      hasIncome: months.some((m) => m.income > 0),
    },
  };
}

/** Soma das despesas comprometidas por categoria (entrada de `buildCategoryBreakdown`). */
export function totalsByCategory(
  entries: readonly CommitmentEntry[],
): { categoryId: string; amount: Cents }[] {
  const totals = new Map<string, Cents>();
  for (const e of entries) {
    totals.set(
      e.categoryId,
      addCents(totals.get(e.categoryId) ?? ZERO, e.amount),
    );
  }
  return [...totals].map(([categoryId, amount]) => ({ categoryId, amount }));
}
