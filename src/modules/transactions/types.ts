import type { z } from "zod";
import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type {
  CategoryColor,
  CategoryIconName,
} from "@/modules/categories/constants";
import type {
  TransactionStatus,
  TransactionType,
} from "@/modules/transactions/constants";
import type { transactionFiltersSchema } from "@/modules/transactions/schemas";

export type { TransactionStatus, TransactionType };

/** Filtros já normalizados (saída do schema tolerante). */
export type TransactionFilters = z.output<typeof transactionFiltersSchema>;

/** Sinal exibido: transferência é `neutral`, salvo com filtro de conta; estorno inverte. */
export type TransactionDirection = "in" | "out" | "neutral";

export type TransactionListItem = {
  id: string;
  type: TransactionType;
  description: string;
  amount: Cents;
  direction: TransactionDirection;
  transactionDate: ISODate;
  status: TransactionStatus;
  account: { id: string; name: string };
  destinationAccount: { id: string; name: string } | null;
  category: {
    id: string;
    name: string;
    color: CategoryColor;
    icon: CategoryIconName;
  } | null;
  assignedMember: { id: string; displayName: string | null } | null;
  reversalOfId: string | null;
  /** Série de origem, se a ocorrência veio de uma recorrência. */
  recurrenceId: string | null;
  canManage: boolean;
};

export type TransactionPage = {
  items: TransactionListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type HistoryField =
  | "amount"
  | "transactionDate"
  | "accountId"
  | "destinationAccountId"
  | "categoryId";

/** Entrada do histórico (auditoria). Valores como vêm da auditoria: `amount` em texto decimal, datas ISO, ids. */
export type HistoryEntry = {
  id: string;
  action:
    | "transaction.updated"
    | "transaction.deleted"
    | "transaction.reversed"
    | "transaction.paid"
    | "transaction.canceled";
  occurredAt: string;
  actorName: string | null;
  changes: { field: HistoryField; old: string | null; new: string | null }[];
};

export type TransactionDetail = TransactionListItem & {
  notes: string | null;
  /** Vencimento original; `null` em lançamento criado já efetivado. */
  dueDate: ISODate | null;
  recurrence: { id: string; label: string } | null;
  createdBy: { id: string; displayName: string };
  createdAt: string;
  updatedAt: string;
  reversals: { id: string; amount: Cents; transactionDate: ISODate }[];
  reversibleAmount: Cents;
  canEdit: boolean;
  canDelete: boolean;
  canReverse: boolean;
  /** `null` para member: a RLS de `audit_events` não deixa ler. */
  history: HistoryEntry[] | null;
};

export type PeriodSummary = {
  income: Cents;
  expense: Cents;
  result: Cents;
};
