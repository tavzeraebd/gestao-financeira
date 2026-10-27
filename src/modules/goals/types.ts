import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";
import type { ContributionKind, GoalIconName, GoalStatus } from "./constants";

/** D9: estimativa de conclusão e aporte necessário. Sempre acompanhada da premissa (`premise`). */
export type GoalEstimate = {
  /** Aporte mensal usado (ritmo atual ou valor informado). Pode ser ≤ 0. */
  pace: Cents;
  paceSource: "history" | "informed";
  /** Meses até concluir; `null` sem estimativa (ritmo ≤ 0 ou meta já atingida). */
  months: number | null;
  /** 1º dia do mês previsto; `null` sem estimativa. */
  estimatedMonth: ISODate | null;
  /** Meses até a data-alvo; `null` sem data-alvo, data passada ou meta atingida. */
  monthsToTarget: number | null;
  /** Mínimo mensal para chegar à data-alvo (arredonda para cima); `null` se não se aplica. */
  requiredMonthly: Cents | null;
  targetDatePassed: boolean;
  premise: string;
};

export type GoalView = {
  id: string;
  name: string;
  description: string | null;
  icon: GoalIconName;
  status: GoalStatus;
  targetAmount: Cents;
  saved: Cents;
  remaining: Cents;
  percent: number | null;
  targetDate: ISODate | null;
  estimate: GoalEstimate;
  completedAt: string | null;
  canManage: boolean;
  canContribute: boolean;
};

export type MemberRef = { id: string; displayName: string };

export type ContributionView = {
  id: string;
  kind: ContributionKind;
  amount: Cents;
  date: ISODate;
  member: MemberRef;
  notes: string | null;
  canDelete: boolean;
};

export type GoalDetail = GoalView & {
  contributions: {
    items: ContributionView[];
    total: number;
    page: number;
    pageCount: number;
  };
  /** Integrantes ativos (opções do `Select` de aporte). */
  members: MemberRef[];
};
