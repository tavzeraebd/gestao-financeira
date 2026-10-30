import type { ISODate } from "@/lib/dates";
import { asCents, sumCents, type Cents } from "@/lib/money";
import type { AccountBase } from "@/modules/accounts/repository";
import type { CategoryView } from "@/modules/categories/types";
import { OTHER_CATEGORIES_KEY, REMOVED_CATEGORY_NAME } from "../constants";
import type {
  AccountBalanceRow,
  CategoryDetail,
  CategorySlice,
  CommitmentDetailItem,
  CommitmentDetails,
  CommitmentEntry,
  CommitmentItemGroup,
  CommitmentMonth,
  CommitmentOrigin,
  MonthDetail,
  ProjectedBalance,
} from "../types";
import { bucketMonth } from "./commitments";

/** Nome exibido da categoria: arquivada ganha o sufixo; ausente vira "Categoria removida". */
export function categoryNames(
  categories: readonly CategoryView[],
): Map<string, string> {
  return new Map(
    categories.map((c) => [
      c.id,
      c.archivedAt !== null ? `${c.name} (arquivada)` : c.name,
    ]),
  );
}

/** Tela de detalhe da origem: conta em aberto ou série recorrente. */
export function commitmentItemHref(
  origin: CommitmentOrigin,
  sourceId: string,
): string {
  return origin === "bill"
    ? `/compromissos/${sourceId}`
    : `/recorrencias/${sourceId}/editar`;
}

function groupOf(entry: CommitmentEntry): CommitmentItemGroup {
  if (entry.type === "income") return "income";
  if (entry.payroll) return "payroll";
  return entry.origin === "series" ? "recurring" : "bills";
}

function toItem(
  entry: CommitmentEntry,
  today: ISODate,
  names: ReadonlyMap<string, string>,
): CommitmentDetailItem {
  return {
    key: `${entry.origin}-${entry.sourceId}-${entry.date}`,
    group: groupOf(entry),
    type: entry.type,
    description: entry.description,
    date: entry.date,
    amount: entry.amount,
    categoryName: names.get(entry.categoryId) ?? REMOVED_CATEGORY_NAME,
    origin: entry.origin,
    sourceId: entry.sourceId,
    overdue: entry.origin === "bill" && entry.date < today,
  };
}

function byDateThenDescription(
  a: CommitmentDetailItem,
  b: CommitmentDetailItem,
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.description.localeCompare(b.description, "pt-BR");
}

type Context = {
  today: ISODate;
  names: ReadonlyMap<string, string>;
};

/**
 * Um detalhamento por mês do horizonte: o resumo do mês, o saldo projetado de abertura e de fechamento
 * (abertura + receita esperada − comprometido de caixa) e os itens de cada grupo. Os itens somam os mesmos
 * valores de `buildCommitments`, porque usam a mesma regra de mês.
 */
export function buildMonthDetails(
  months: readonly CommitmentMonth[],
  projection: ProjectedBalance,
  currentBalance: Cents,
  entries: readonly CommitmentEntry[],
  { today, names }: Context,
): MonthDetail[] {
  const first = months[0]?.month;
  const itemsByMonth = new Map<ISODate, CommitmentDetailItem[]>();
  if (first) {
    for (const entry of entries) {
      const key = bucketMonth(entry, first);
      const list = itemsByMonth.get(key) ?? [];
      list.push(toItem(entry, today, names));
      itemsByMonth.set(key, list);
    }
  }
  let opening = currentBalance;
  return months.map((m, i) => {
    const closing = projection.months[i]?.balance ?? opening;
    const groups: MonthDetail["groups"] = {
      bills: [],
      recurring: [],
      payroll: [],
      income: [],
    };
    for (const item of itemsByMonth.get(m.month) ?? []) {
      groups[item.group].push(item);
    }
    for (const list of Object.values(groups)) list.sort(byDateThenDescription);
    const detail: MonthDetail = {
      ...m,
      opening,
      closing,
      negative: closing < 0,
      groups,
    };
    opening = closing;
    return detail;
  });
}

/**
 * Itens de cada fatia do gráfico por categoria, agrupados por mês. "Outras categorias" reúne as
 * categorias que ficaram fora das fatias nomeadas.
 */
export function buildCategoryDetails(
  slices: readonly CategorySlice[],
  expenses: readonly CommitmentEntry[],
  months: readonly CommitmentMonth[],
  { today, names }: Context,
): CategoryDetail[] {
  const first = months[0]?.month;
  if (!first) return [];
  const labels = new Map(months.map((m) => [m.month, m.longLabel]));
  const named = new Map<string, string>();
  for (const slice of slices) {
    if (slice.categoryId !== null) named.set(slice.categoryId, slice.key);
  }
  const hasOther = slices.some((s) => s.key === OTHER_CATEGORIES_KEY);
  const sliceKeyOf = (categoryId: string) =>
    named.get(categoryId) ?? (hasOther ? OTHER_CATEGORIES_KEY : null);

  const grouped = new Map<string, Map<ISODate, CommitmentDetailItem[]>>();
  for (const entry of expenses) {
    const key = sliceKeyOf(entry.categoryId);
    if (key === null) continue;
    const byMonth = grouped.get(key) ?? new Map();
    const month = bucketMonth(entry, first);
    const list = byMonth.get(month) ?? [];
    list.push(toItem(entry, today, names));
    byMonth.set(month, list);
    grouped.set(key, byMonth);
  }

  return slices.map((slice) => {
    const byMonth = grouped.get(slice.key) ?? new Map();
    const monthsOfSlice = [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, items]) => {
        const sorted = [...items].sort(byDateThenDescription);
        return {
          month,
          longLabel: labels.get(month) ?? month,
          total: sumCents(sorted.map((i) => i.amount)),
          items: sorted,
        };
      });
    return {
      key: slice.key,
      name: slice.archived ? `${slice.name} (arquivada)` : slice.name,
      total: slice.amount,
      percent: slice.percent,
      months: monthsOfSlice,
    };
  });
}

/**
 * Saldo por conta que compõe o saldo atual (cartões ficam fora do consolidado e aparecem como fatura).
 * Contas inativas só entram com saldo diferente de zero.
 */
export function buildAccountRows(
  accounts: readonly AccountBase[],
  balances: ReadonlyMap<string, Cents>,
): AccountBalanceRow[] {
  return accounts
    .map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: balances.get(a.id) ?? asCents(0),
      archived: !a.isActive,
    }))
    .filter((a) => !a.archived || a.balance !== 0)
    .sort((a, b) => {
      const cardA = a.type === "credit_card" ? 1 : 0;
      const cardB = b.type === "credit_card" ? 1 : 0;
      if (cardA !== cardB) return cardA - cardB;
      return a.name.localeCompare(b.name, "pt-BR");
    });
}

export type CommitmentDetailsInput = {
  today: ISODate;
  currentBalance: Cents;
  openCardDebt: Cents;
  months: readonly CommitmentMonth[];
  projection: ProjectedBalance;
  entries: readonly CommitmentEntry[];
  /** Despesas do mês corrente (base da rosca); as outras janelas não entram. */
  expenses: readonly CommitmentEntry[];
  slices: readonly CategorySlice[];
  names: ReadonlyMap<string, string>;
  accounts: readonly AccountBalanceRow[];
};

export function buildCommitmentDetails(
  input: CommitmentDetailsInput,
): CommitmentDetails {
  const context = { today: input.today, names: input.names };
  return {
    currentBalance: input.currentBalance,
    openCardDebt: input.openCardDebt,
    months: buildMonthDetails(
      input.months,
      input.projection,
      input.currentBalance,
      input.entries,
      context,
    ),
    categories: buildCategoryDetails(
      input.slices,
      input.expenses,
      input.months,
      context,
    ),
    accounts: [...input.accounts],
  };
}
