import type { z } from "zod";
import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type {
  CategoryColor,
  CategoryIconName,
} from "@/modules/categories/constants";
import type { HistoryEntry } from "@/modules/transactions/types";
import type { BillKind, BillSituation, BillStatus } from "./constants";
import type { billFiltersSchema } from "./schemas";

export type { BillKind, BillSituation, BillStatus };

/** Filtros já normalizados (saída do schema tolerante). */
export type BillFilters = z.output<typeof billFiltersSchema>;

export type BillListItem = {
  id: string;
  kind: BillKind;
  description: string;
  amount: Cents;
  /** Vencimento: `transaction_date` enquanto `pending`; `due_date` depois. */
  dueDate: ISODate;
  /** Data do pagamento; `null` se não está `paid`. */
  paidOn: ISODate | null;
  status: BillStatus;
  /** Dias até o vencimento (negativo se vencido). */
  days: number;
  account: { id: string; name: string };
  category: {
    id: string;
    name: string;
    color: CategoryColor;
    icon: CategoryIconName;
  };
  assignedMember: { id: string; displayName: string | null } | null;
  recurrence: { id: string; label: string } | null;
  canPay: boolean;
  canEdit: boolean;
  canCancel: boolean;
};

export type BillPage = {
  items: BillListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type BillDetail = BillListItem & {
  notes: string | null;
  createdBy: { id: string; displayName: string };
  createdAt: string;
  /** `null` para member: a RLS de `audit_events` não deixa ler. */
  history: HistoryEntry[] | null;
};

export type BillsSummary = {
  payable: Cents;
  receivable: Cents;
  overduePayable: Cents;
  overdueReceivable: Cents;
  overdueCount: number;
};
