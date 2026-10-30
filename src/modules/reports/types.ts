import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type {
  CategoryColor,
  CategoryIconName,
} from "@/modules/categories/constants";
import type { AccountType } from "@/modules/accounts/constants";
import type { BudgetStatus } from "@/modules/budgets/constants";
import type { GoalIconName, GoalStatus } from "@/modules/goals/constants";
import type { BillListItem } from "@/modules/bills/types";
import type { TransactionListItem } from "@/modules/transactions/types";
import type {
  COMMITMENT_HORIZONS,
  PERIOD_PRESETS,
  REPORT_CATEGORY_TYPES,
  REPORT_PRESETS,
} from "./constants";

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

// --- Comprometimento futuro (/inicio) ---

export type CommitmentHorizon = (typeof COMMITMENT_HORIZONS)[number];

/** Filtros de URL do /inicio já normalizados. */
export type CommitmentFilters = { horizonte: CommitmentHorizon };

/** Despesa ou receita em aberto, já com a data de vencimento (vencidos entram com a data original). */
export type CommitmentEntry = {
  type: "income" | "expense";
  amount: Cents;
  date: ISODate;
  categoryId: string;
  description: string;
};

/** Série recorrente ativa (a agenda ainda não materializada vem de `nextOccurrenceDate`). */
export type CommitmentSeries = {
  type: "income" | "expense";
  amount: Cents;
  description: string;
  categoryId: string;
  frequency: "weekly" | "monthly" | "yearly";
  intervalCount: number;
  startDate: ISODate;
  endDate: ISODate | null;
  nextOccurrenceDate: ISODate;
};

export type CommitmentMonth = {
  month: ISODate;
  label: string;
  longLabel: string;
  /** Despesas em aberto (contas a pagar já lançadas) com vencimento no mês. */
  pending: Cents;
  /** Ocorrências futuras de despesas recorrentes ainda não lançadas. */
  recurring: Cents;
  /** `pending + recurring`. */
  committed: Cents;
  /** Receita esperada no mês (a receber + recorrências de receita). */
  income: Cents;
  /** `committed / income × 100`; `null` sem receita esperada. */
  percent: number | null;
};

export type CommitmentNextDue = {
  date: ISODate;
  description: string;
  amount: Cents;
  overdue: boolean;
};

export type CommitmentOverview = {
  /** Primeiro dia do mês atual e do último mês do horizonte. */
  from: ISODate;
  to: ISODate;
  horizon: CommitmentHorizon;
  /** `"outubro de 2026 a outubro de 2027"`. */
  label: string;
  months: CommitmentMonth[];
  totalCommitted: Cents;
  currentMonthCommitted: Cents;
  /** Mês de maior comprometimento (`null` sem nenhum compromisso). */
  heaviest: { month: ISODate; longLabel: string; committed: Cents } | null;
  nextDue: CommitmentNextDue | null;
  hasIncome: boolean;
};

/** Saldo consolidado das contas hoje (só lançamentos efetivados), comparado ao fim do mês anterior. */
export type BalanceSnapshot = Pick<
  Dashboard,
  "consolidated" | "previousAsOf" | "openCardDebt" | "hasCreditCards"
>;

export type ProjectedBalanceMonth = {
  month: ISODate;
  label: string;
  longLabel: string;
  /** Saldo atual + receita esperada acumulada − comprometido acumulado, ao fim do mês. */
  balance: Cents;
  negative: boolean;
};

export type ProjectedBalance = {
  months: ProjectedBalanceMonth[];
  /** Mês de menor saldo projetado (o primeiro, em empate); `null` sem meses. */
  lowest: ProjectedBalanceMonth | null;
  hasNegative: boolean;
};

export type CommitmentDashboard = {
  overview: CommitmentOverview;
  balance: BalanceSnapshot;
  projection: ProjectedBalance;
  byCategory: CategoryBreakdown;
  /** Até 5 compromissos em aberto com vencimento em 30 dias (vencidos incluídos), só leitura. */
  upcomingBills: BillListItem[];
};

export type ReportPreset = (typeof REPORT_PRESETS)[number];

/** Filtros de URL dos relatórios já normalizados (D21). */
export type ReportFilters = {
  periodo: ReportPreset;
  de?: ISODate;
  ate?: ISODate;
};

export type CategoryReportFilters = ReportFilters & {
  tipo: (typeof REPORT_CATEGORY_TYPES)[number];
};

export type ReportPeriod = {
  preset: ReportPreset;
  from: ISODate;
  to: ISODate;
  previousFrom: ISODate;
  previousTo: ISODate;
  label: string;
  previousLabel: string;
  /** 1º dia de cada mês civil que toca o período. */
  months: ISODate[];
};

export type ReportOverview = {
  period: ReportPeriod;
  summary: { income: Comparison; expense: Comparison; result: Comparison };
  cashFlow: CashFlowMonth[];
  expenseByCategory: CategoryBreakdown;
};

export type CategoryReportRow = {
  categoryId: string;
  name: string;
  color: CategoryColor;
  icon: CategoryIconName | null;
  archived: boolean;
  current: Cents;
  previous: Cents;
  comparison: Comparison;
};

export type CategoryReport = {
  period: ReportPeriod;
  type: "expense" | "income";
  breakdown: CategoryBreakdown;
  rows: CategoryReportRow[];
};

export type AccountReportRow = {
  id: string;
  name: string;
  type: AccountType;
  archived: boolean;
  opening: Cents;
  inflow: Cents;
  outflow: Cents;
  /** Entradas − saídas (D22). */
  net: Cents;
  closing: Cents;
};

export type AccountReport = {
  period: ReportPeriod;
  accounts: AccountReportRow[];
  /** Σ líquido das contas de ativo (cartões fora) = `consolidated.delta`. */
  assetNet: Cents;
  /** Saldo consolidado (D3) no fim × no início do período. */
  consolidated: Comparison;
};

export type MemberReportRow = {
  /** `null` = "Família (sem responsável)". */
  member: { id: string; displayName: string } | null;
  amount: Cents;
  percent: number | null;
};

export type MemberReport = {
  period: ReportPeriod;
  /** Despesas do período (D4); igual à soma das linhas. */
  total: Cents;
  rows: MemberReportRow[];
};

export type BudgetReportRow = {
  budgetId: string;
  /** `null` = todas as despesas. */
  category: {
    id: string;
    name: string;
    color: CategoryColor;
    icon: CategoryIconName;
    archived: boolean;
  } | null;
  limit: Cents;
  spent: Cents;
  percent: number | null;
  status: BudgetStatus;
};

export type BudgetReportMonth = {
  month: ISODate;
  label: string;
  rows: BudgetReportRow[];
};

export type BudgetReport = {
  period: ReportPeriod;
  months: BudgetReportMonth[];
};

export type GoalReportRow = {
  id: string;
  name: string;
  icon: GoalIconName;
  status: GoalStatus;
  target: Cents;
  saved: Cents;
  deposits: Cents;
  withdrawals: Cents;
  percent: number | null;
};

export type GoalReport = {
  period: ReportPeriod;
  goals: GoalReportRow[];
};
