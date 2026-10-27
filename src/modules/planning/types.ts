import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";

export type ValueSource = "known" | "informed" | "estimated";

export type ResultFormat = "brl" | "months" | "percent" | "month" | "text";

export type ResultLine = {
  label: string;
  /** `brl`: `Cents`; `months`/`percent`: `number`; `month`: `ISODate` (1º dia); `text`: texto. */
  value: Cents | number | string;
  format: ResultFormat;
  source: ValueSource;
};

export type SimulationError = "OUT_OF_RANGE" | "NO_BASELINE";

export type SimulationSuccess = {
  ok: true;
  headline: ResultLine;
  lines: ResultLine[];
  premises: string[];
};

export type SimulationResult =
  | SimulationSuccess
  | { ok: false; error: SimulationError };

export type ProjectionRow = {
  month: ISODate;
  label: string;
  income: Cents;
  expense: Cents;
  balance: Cents;
};

/** `projectBalance` devolve também as linhas da tabela "Mês · Entradas · Saídas · Saldo". */
export type ProjectionResult =
  | (SimulationSuccess & { rows: ProjectionRow[] })
  | { ok: false; error: SimulationError };

export type PlanningBaseline = {
  today: ISODate;
  hasAccounts: boolean;
  consolidatedBalance: Cents;
  averageWindow: { from: ISODate; to: ISODate };
  averageMonthly: { income: Cents; expense: Cents; result: Cents };
  /** Despesa média mensal por categoria (> 0), em ordem decrescente. */
  categoryAverages: {
    categoryId: string;
    name: string;
    color: string;
    icon: string;
    average: Cents;
  }[];
  goals: {
    id: string;
    name: string;
    saved: Cents;
    target: Cents;
    pace: Cents;
    targetDate: ISODate | null;
  }[];
  projection: {
    month: ISODate;
    label: string;
    pendingIncome: Cents;
    pendingExpense: Cents;
    recurringIncome: Cents;
    recurringExpense: Cents;
  }[];
};
