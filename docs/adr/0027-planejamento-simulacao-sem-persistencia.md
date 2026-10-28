# ADR-0027 — Planejamento: simulação em TS puro no cliente, sem persistência; base conhecida vinda do servidor

Status: aceita (2026-10-24, Etapa 6) · Escopo: `src/modules/planning`, `/planejamento`, função `projected_cash_flow` · Refina `financial-definitions.md` D15 e D12 (projeção virtual)

**Contexto.** A spec §7.12 pede simular compra de carro, viagem, prazo de meta, novo compromisso mensal, redução de despesas e saldo futuro, com premissas e resultados transparentes, diferenciando conhecido, informado e estimado, sem prometer aconselhamento. A ADR-0011 diz que projeções além do horizonte da materialização usam ocorrências virtuais calculadas pela mesma função de agenda.

**Decisão.**
1. **Nada é gravado**: nem cenário, nem entrada, nem resultado. As entradas ficam só no estado do formulário (sem URL, sem `localStorage`, sem log).
2. As fórmulas ficam em `src/modules/planning/domain/*.ts` (TS puro, sem `server-only`, testado) e rodam no cliente a cada mudança de entrada. Não há action nem RPC de simulação.
3. A **base conhecida** vem de uma query do servidor (`getPlanningBaseline`) que reutiliza as funções existentes (`account_balances`, `monthly_cash_flow`, `category_totals`, `goal_summary`) e uma função nova, `projected_cash_flow(p_months)` (`security invoker`), que soma pendentes materializados e ocorrências **virtuais** das séries ativas a partir de `next_occurrence_date`, pela `private.recurrence_occurrence` da Etapa 5 (sem contar duas vezes).
4. Juros só com taxa **informada** pelo usuário (0 é válido: "sem juros"). Nenhuma taxa sugerida, nenhum rendimento presumido.
5. Cada valor exibido leva a origem: **Conhecido** (dado do app), **Informado** (entrada), **Estimado** (resultado do cálculo ou projeção). Aviso fixo: "Simulação para apoiar decisões. Não é recomendação nem aconselhamento financeiro."

**Alternativas.** Persistir cenários: não é pedido e cria dado financeiro hipotético para proteger. Calcular no servidor por action: ida e volta a cada tecla sem ganho de segurança (as entradas são do próprio usuário). Projetar recorrências em TS: segunda implementação da agenda D12.

**Consequências.** A simulação usa `number` (D15) e converte para centavos com meio para longe do zero; os totais saem do valor exato, não da parcela arredondada. Entradas têm teto para evitar `Infinity`/`NaN`. O planejamento lê, mas não altera, nenhum dado.

## Emendas

**2026-10-27 · implementação da Etapa 6 (migration `20261024101600`; `etapa-6.md` v1.1).** Item 3: `projected_cash_flow(p_months)` (1..12) soma ocorrências virtuais a partir de `greatest(next_occurrence_date, hoje)`, e não só de `next_occurrence_date` (série atrasada não projeta o passado), com no máximo 60 ocorrências por série. Pendentes atrasados entram no mês de hoje. Para a função invoker avaliar a agenda, `recurrence_occurrence` e `recurrence_first_index` receberam `grant execute` a `authenticated`. O restante da decisão vale como escrito.
