import { addCents, subCents, type Cents } from "@/lib/money";
import type {
  CommitmentMonth,
  ProjectedBalance,
  ProjectedBalanceMonth,
} from "../types";

/**
 * Saldo projetado ao fim de cada mês = saldo atual + receita esperada acumulada − comprometido acumulado
 * (até o mês, inclusive), usando só o comprometido de caixa (`cashCommitted`): o desconto em folha não é
 * subtraído, porque o salário lançado já é líquido. Parte do saldo de hoje, já com tudo o que foi realizado;
 * o que está em aberto ou é recorrente entra só nos meses em que vence. Negativo = abaixo de zero.
 */
export function buildProjectedBalance(
  currentBalance: Cents,
  months: readonly CommitmentMonth[],
): ProjectedBalance {
  let running = currentBalance;
  const projected: ProjectedBalanceMonth[] = months.map((m) => {
    running = subCents(addCents(running, m.income), m.cashCommitted);
    return {
      month: m.month,
      label: m.label,
      longLabel: m.longLabel,
      balance: running,
      negative: running < 0,
    };
  });
  let lowest: ProjectedBalanceMonth | null = null;
  for (const m of projected) {
    if (lowest === null || m.balance < lowest.balance) lowest = m;
  }
  return {
    months: projected,
    lowest,
    hasNegative: projected.some((m) => m.negative),
  };
}
