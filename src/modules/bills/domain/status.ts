import { diffInDays, type ISODate } from "@/lib/dates";
import type { TransactionStatus } from "@/modules/transactions/constants";
import type { BillStatus } from "../constants";

export type BillStatusInput = {
  status: TransactionStatus;
  transactionDate: ISODate;
  dueDate: ISODate | null;
};

/**
 * D6: vencido = `pending` com `transactionDate < hoje` (derivado, nunca gravado); vence hoje = `pending`
 * com `transactionDate = hoje`. `days` = dias até o vencimento (negativo se vencido). O vencimento de
 * um compromisso `pending` é `transactionDate`; o de `paid`/`canceled` é `dueDate` (ou `transactionDate`
 * se não houver).
 */
export function billStatusOf(
  input: BillStatusInput,
  today: ISODate,
): { status: BillStatus; days: number } {
  const due =
    input.status === "pending"
      ? input.transactionDate
      : (input.dueDate ?? input.transactionDate);
  const days = diffInDays(today, due);

  if (input.status === "paid") return { status: "paid", days };
  if (input.status === "canceled") return { status: "canceled", days };
  if (days < 0) return { status: "overdue", days };
  if (days === 0) return { status: "due_today", days };
  return { status: "pending", days };
}
