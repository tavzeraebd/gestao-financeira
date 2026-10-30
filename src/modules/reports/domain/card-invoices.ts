import { addMonths, endOfMonth, startOfMonth, type ISODate } from "@/lib/dates";
import { subCents, type Cents } from "@/lib/money";
import type { CommitmentEntry } from "../types";

/** Cartão com os dias de fechamento e vencimento da fatura (1..31). */
export type CardTerms = {
  id: string;
  name: string;
  closingDay: number;
  dueDay: number;
};

export type Invoice = { closingDate: ISODate; dueDate: ISODate };

/** Dia `day` do mês de `monthFirst`; dia inexistente vira o último dia do mês (como `recurrence_occurrence`). */
function dayOfMonth(monthFirst: ISODate, day: number): ISODate {
  const last = Number(endOfMonth(monthFirst).slice(8, 10));
  const clamped = String(Math.min(day, last)).padStart(2, "0");
  return `${monthFirst.slice(0, 8)}${clamped}` as ISODate;
}

/**
 * D24: fatura de uma compra. Fecha no mês da compra se o dia da compra é <= fechamento, senão no mês seguinte.
 * Vence no primeiro vencimento depois do fechamento (mesmo mês se vencimento > fechamento, senão o seguinte).
 */
export function invoiceOf(
  purchase: ISODate,
  closingDay: number,
  dueDay: number,
): Invoice {
  const first = startOfMonth(purchase);
  const closingThisMonth = dayOfMonth(first, closingDay);
  const closingDate =
    purchase <= closingThisMonth
      ? closingThisMonth
      : dayOfMonth(addMonths(first, 1), closingDay);
  const closingFirst = startOfMonth(closingDate);
  const sameMonth = dayOfMonth(closingFirst, dueDay);
  const dueDate =
    sameMonth > closingDate
      ? sameMonth
      : dayOfMonth(addMonths(closingFirst, 1), dueDay);
  return { closingDate, dueDate };
}

/** Compra efetivada no cartão, lida do banco (despesa paga, não estorno). */
export type CardPurchase = {
  id: string;
  accountId: string;
  description: string;
  amount: Cents;
  date: ISODate;
  categoryId: string;
};

/**
 * Dívida aberta do cartão = compras mais recentes (o pagamento quita as faturas mais antigas primeiro).
 * `purchases` vem da mais nova para a mais antiga; a última pode entrar só com o valor residual.
 * `covered` é falso quando o histórico acaba antes de somar a dívida (resultado possivelmente subestimado).
 */
export function allocateOpenDebt(
  purchases: readonly CardPurchase[],
  debt: Cents,
): { open: CardPurchase[]; covered: boolean } {
  const open: CardPurchase[] = [];
  let remaining = debt;
  for (const purchase of purchases) {
    if (remaining <= 0) break;
    if (purchase.amount <= 0) continue;
    const amount = purchase.amount <= remaining ? purchase.amount : remaining;
    open.push({ ...purchase, amount });
    remaining = subCents(remaining, amount);
  }
  return { open, covered: remaining <= 0 };
}

/** Marca a entrada de despesa em cartão com a fatura: `date` passa a ser o vencimento da fatura (D24). */
export function withInvoice(
  entry: CommitmentEntry,
  card: CardTerms | undefined,
): CommitmentEntry {
  if (!card || entry.type !== "expense") return entry;
  const { dueDate } = invoiceOf(entry.date, card.closingDay, card.dueDay);
  return {
    ...entry,
    date: dueDate,
    accountId: card.id,
    cardName: card.name,
    purchaseDate: entry.date,
    invoiceMonth: startOfMonth(dueDate),
  };
}

/** Compras ainda não quitadas de um cartão como entradas comprometidas no mês do vencimento da fatura. */
export function openPurchaseEntries(
  purchases: readonly CardPurchase[],
  card: CardTerms,
  debt: Cents,
): { entries: CommitmentEntry[]; covered: boolean } {
  const { open, covered } = allocateOpenDebt(purchases, debt);
  return {
    covered,
    entries: open.map((p) =>
      withInvoice(
        {
          type: "expense",
          amount: p.amount,
          date: p.date,
          categoryId: p.categoryId,
          description: p.description,
          origin: "card",
          sourceId: p.id,
        },
        card,
      ),
    ),
  };
}
