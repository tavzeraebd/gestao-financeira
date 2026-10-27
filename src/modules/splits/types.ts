import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type { CategoryColor, CategoryIconName } from "@/modules/categories/constants";
import type { MemberRef } from "@/modules/goals/types";
import type { SplitMode } from "./constants";

export type SplitPart = { member: MemberRef; amount: Cents };

export type SharedExpenseItem = {
  id: string;
  description: string;
  amount: Cents;
  date: ISODate;
  status: "pending" | "paid";
  payer: MemberRef | null;
  category: {
    id: string;
    name: string;
    color: CategoryColor;
    icon: CategoryIconName;
  };
  parts: SplitPart[];
  myShare: Cents | null;
};

export type SharedExpensesPage = {
  items: SharedExpenseItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type SplitDetail = {
  transaction: {
    id: string;
    description: string;
    amount: Cents;
    status: string;
    date: ISODate;
    payer: MemberRef | null;
    isPending: boolean;
  };
  splittable: boolean;
  parts: SplitPart[];
  /** Derivado: igual à prévia da divisão igual → `equal`; com parcelas diferentes → `amounts`; sem divisão → `null`. */
  mode: SplitMode | null;
  /** Integrantes ativos mais os ex-integrantes que já estão na divisão. */
  candidates: (MemberRef & { active: boolean })[];
  canEdit: boolean;
};

export type MemberBalances = {
  pairs: { debtor: MemberRef; creditor: MemberRef; amount: Cents }[];
  myMemberId: string;
};

export type SettlementView = {
  id: string;
  from: MemberRef;
  to: MemberRef;
  amount: Cents;
  date: ISODate;
  notes: string | null;
  /** Nome de quem registrou o acerto. */
  recordedBy: string;
  canDelete: boolean;
};
