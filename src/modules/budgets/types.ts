import type { z } from "zod";
import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type {
  CategoryColor,
  CategoryIconName,
} from "@/modules/categories/constants";
import type { BudgetStatus } from "./constants";
import type { budgetMonthSchema } from "./schemas";

export type { BudgetStatus };

/** Filtros de URL já normalizados: `mes` = dia 1 do mês. */
export type BudgetMonthFilters = z.output<typeof budgetMonthSchema>;

export type BudgetHistoryEntry = {
  month: ISODate;
  label: string;
  spent: Cents;
  percent: number | null;
  status: BudgetStatus;
};

export type BudgetView = {
  id: string;
  /** `null` = todas as despesas. */
  category: {
    id: string;
    name: string;
    color: CategoryColor;
    icon: CategoryIconName;
    archived: boolean;
  } | null;
  amountLimit: Cents;
  spent: Cents;
  committed: Cents;
  available: Cents;
  percent: number | null;
  status: BudgetStatus;
  /** Até 3 meses anteriores dentro da vigência. */
  history: BudgetHistoryEntry[];
  startMonth: ISODate;
  endMonth: ISODate | null;
  archivedAt: string | null;
  canManage: boolean;
};

export type BudgetsOverview = {
  month: ISODate;
  label: string;
  budgets: BudgetView[];
};

/** Dados do formulário de edição (`getBudget`). */
export type BudgetEditData = {
  id: string;
  /** `null` = todas as despesas. */
  categoryId: string | null;
  categoryName: string | null;
  amountLimit: Cents;
  startMonth: ISODate;
  endMonth: ISODate | null;
  archivedAt: string | null;
};
