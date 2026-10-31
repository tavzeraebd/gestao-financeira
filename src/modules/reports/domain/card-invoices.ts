import {
  addDays,
  addMonths,
  endOfMonth,
  startOfMonth,
  type ISODate,
} from "@/lib/dates";
import { addCents, asCents, subCents, sumCents, type Cents } from "@/lib/money";
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
 * D24: fatura de uma compra. Fecha no mês da compra se a compra é anterior ao fechamento daquele mês; a compra
 * feita no dia do fechamento ou depois fecha no mês seguinte. Vence no primeiro vencimento depois do fechamento (mesmo mês se vencimento > fechamento, senão o seguinte).
 */
export function invoiceOf(
  purchase: ISODate,
  closingDay: number,
  dueDay: number,
): Invoice {
  const first = startOfMonth(purchase);
  const closingThisMonth = dayOfMonth(first, closingDay);
  const closingDate =
    purchase < closingThisMonth
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

/**
 * ADR-0041: início do prefiltro em `transaction_date` para um filtro `de` sobre `reporting_date`.
 * A fatura vence no máximo 2 meses depois da compra, então nenhuma compra anterior a este dia pode ter `reporting_date >= from`.
 */
export function reportingPrefilterStart(from: ISODate): ISODate {
  return addMonths(startOfMonth(from), -2);
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

/** Parcela pendente de compra parcelada no cartão (D23); só data e valor entram na fatura aberta. */
export type PendingInstallment = { date: ISODate; amount: Cents };

export type OpenInvoice = {
  closingDate: ISODate;
  dueDate: ISODate;
  amount: Cents;
};

export type ClosedInvoice = OpenInvoice & { overdue: boolean };

/** D25: fatura aberta (ciclo de hoje) e fatura fechada a pagar de um cartão. */
export type CardInvoices = { open: OpenInvoice; closed: ClosedInvoice };

/**
 * D25: faturas de um cartão em `today`.
 * Ciclo aberto = [fechamento anterior, fechamento − 1 dia] (a fatura de `invoiceOf(today)`); fatura fechada mais
 * recente = a que fecha no dia em que o ciclo aberto começa. `debt` é a dívida do cartão (>= 0, D8);
 * `purchases` vem da mais nova para a mais antiga, com o valor líquido de estornos (D24).
 * Aberta = dívida alocada às compras do ciclo + parcelas pendentes do ciclo; fechada = dívida − alocado do ciclo.
 */
export function cardInvoices(input: {
  today: ISODate;
  closingDay: number;
  dueDay: number;
  debt: Cents;
  purchases: readonly CardPurchase[];
  pendingInstallments: readonly PendingInstallment[];
}): CardInvoices {
  const { today, closingDay, dueDay, debt } = input;
  const open = invoiceOf(today, closingDay, dueDay);
  const cycleStart = dayOfMonth(
    addMonths(startOfMonth(open.closingDate), -1),
    closingDay,
  );
  const closed = invoiceOf(addDays(cycleStart, -1), closingDay, dueDay);
  const inCycle = (date: ISODate) =>
    date >= cycleStart && date < open.closingDate;

  const allocated = sumCents(
    allocateOpenDebt(input.purchases, debt)
      .open.filter((p) => inCycle(p.date))
      .map((p) => p.amount),
  );
  const installments = sumCents(
    input.pendingInstallments
      .filter((i) => inCycle(i.date))
      .map((i) => i.amount),
  );
  const closedAmount =
    debt > allocated ? subCents(debt, allocated) : asCents(0);
  return {
    open: { ...open, amount: addCents(allocated, installments) },
    closed: {
      ...closed,
      amount: closedAmount,
      overdue: closed.dueDate < today,
    },
  };
}
