import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type {
  CategoryColor,
  CategoryIconName,
} from "@/modules/categories/constants";
import type { GoalIconName } from "@/modules/goals/constants";
import type { BillListItem } from "@/modules/bills/types";
import type { TransactionListItem } from "@/modules/transactions/types";
import type { PERIOD_PRESETS } from "./constants";

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export type DashboardFilters = {
  periodo: PeriodPreset;
  de?: ISODate;
  ate?: ISODate;
};

export type DashboardPeriod = {
  preset: PeriodPreset;
  from: ISODate;
  to: ISODate;
  previousFrom: ISODate;
  previousTo: ISODate;
  /** `"outubro de 2026"` para mês inteiro; senão `"01/10/2026 a 15/10/2026"`. */
  label: string;
  previousLabel: string;
};

export type Comparison = {
  current: Cents;
  previous: Cents;
  delta: Cents;
  /** `null` quando `previous = 0` ("sem base de comparação"). */
  percent: number | null;
};

export type CategorySlice = {
  key: string;
  categoryId: string | null;
  name: string;
  color: CategoryColor;
  icon: CategoryIconName | null;
  amount: Cents;
  /** Só nas fatias; `0` em `negative`. */
  percent: number;
  archived: boolean;
};

export type CategoryBreakdown = {
  /** Despesas do período (D4). */
  total: Cents;
  slices: CategorySlice[];
  negative: CategorySlice[];
  rows: CategorySlice[];
};

export type CashFlowMonth = {
  month: ISODate;
  label: string;
  longLabel: string;
  income: Cents;
  expense: Cents;
  result: Cents;
};

export type DashboardState = "no_accounts" | "no_transactions" | "ready";

/** Card Metas do /inicio (D9): saldo guardado e alvo; não entra no saldo das contas. */
export type DashboardGoal = {
  id: string;
  name: string;
  icon: GoalIconName;
  saved: Cents;
  target: Cents;
  percent: number | null;
};

export type Dashboard = {
  state: DashboardState;
  period: DashboardPeriod;
  asOf: ISODate;
  previousAsOf: ISODate;
  consolidated: Comparison;
  openCardDebt: Cents;
  hasCreditCards: boolean;
  income: Comparison;
  expense: Comparison;
  result: Comparison;
  expenseByCategory: CategoryBreakdown;
  cashFlow: { from: ISODate; to: ISODate; months: CashFlowMonth[] };
  recentTransactions: TransactionListItem[];
  /** D19: até 5 pendentes com vencimento em 30 dias (vencidos incluídos). */
  upcomingBills: BillListItem[];
  /** Até 3 metas ativas: data-alvo crescente (sem data por último), depois criação. */
  goals: DashboardGoal[];
};
