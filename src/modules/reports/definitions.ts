export type IndicatorId =
  | "consolidatedBalance"
  | "openCardDebt"
  | "income"
  | "expense"
  | "result"
  | "expenseByCategory"
  | "cashFlow"
  | "recentTransactions"
  | "upcomingBills"
  | "goals";

export const INDICATOR_DEFINITIONS: Record<
  IndicatorId,
  { title: string; description: string; ref: string }
> = {
  consolidatedBalance: {
    title: "Saldo atual",
    description:
      "Soma dos saldos das contas, sem cartões de crédito. A variação compara com o saldo no fim do período anterior e considera só lançamentos efetivados.",
    ref: "D3",
  },
  openCardDebt: {
    title: "Faturas em aberto",
    description:
      "Quanto ainda deve nos cartões de crédito hoje, somando os saldos devedores de todos os cartões.",
    ref: "D8",
  },
  income: {
    title: "Receitas",
    description:
      "Soma das receitas efetivadas no período. Transferências e lançamentos pendentes ficam de fora; estornos reduzem o total.",
    ref: "D4",
  },
  expense: {
    title: "Despesas",
    description:
      "Soma das despesas efetivadas no período, inclusive compras no cartão. Transferências e lançamentos pendentes ficam de fora; estornos reduzem o total.",
    ref: "D4",
  },
  result: {
    title: "Resultado",
    description:
      "Receitas menos despesas efetivadas no período. A variação é calculada sobre o valor absoluto do resultado anterior.",
    ref: "D4",
  },
  expenseByCategory: {
    title: "Categorias de gastos",
    description:
      "Despesas efetivadas do período por categoria. Subcategorias somam na categoria principal; com mais de seis categorias, as menores agrupam em Outras categorias.",
    ref: "D16",
  },
  cashFlow: {
    title: "Fluxo de caixa mensal",
    description:
      "Receitas e despesas efetivadas de cada um dos seis últimos meses civis, incluindo o mês do fim do período.",
    ref: "D17",
  },
  recentTransactions: {
    title: "Últimas transações",
    description:
      "Os cinco lançamentos efetivados mais recentes dentro do período escolhido.",
    ref: "D18",
  },
  upcomingBills: {
    title: "Próximos vencimentos",
    description:
      "Contas a pagar e a receber pendentes que vencem nos próximos 30 dias, incluindo as já vencidas, em ordem de vencimento (até cinco).",
    ref: "D19",
  },
  goals: {
    title: "Metas",
    description:
      "Soma dos aportes menos as retiradas. É uma reserva registrada: não muda o saldo das contas.",
    ref: "D9",
  },
};
