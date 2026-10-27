# ADR-0028 — Relatórios: mesmo módulo `reports`, mesmas funções do dashboard, duas funções novas e período próprio

Status: aceita (2026-10-24, Etapa 7) · Escopo: `/relatorios/**`, `src/modules/reports`, funções `account_flows` e `member_expense_totals` · Aplica a ADR-0020 §1 e a ADR-0021

**Contexto.** A spec §7.11 pede receitas × despesas, fluxo de caixa, por categoria, por conta, por integrante, evolução mensal, comparação de períodos, orçado × realizado e progresso das metas, com os **mesmos serviços de cálculo do dashboard**. A ADR-0020 fixou `src/modules/reports` como único lugar dos cálculos. O mockup 5 usa presets de 7 dias, 30 dias, 3 meses e 12 meses.

**Decisão.**
1. Os relatórios são consultas novas em `reports/queries.ts`, que chamam as funções existentes: `period_summary` (receitas × despesas e comparação), `monthly_cash_flow` (fluxo e evolução mensal), `category_totals` + `buildCategoryBreakdown` (categorias), `budget_progress` (orçado × realizado), `goal_summary` (metas). Nada é recalculado em TS além da composição já existente em `reports/domain`.
2. Duas funções novas, no padrão da Etapa 4 (`security invoker`, `text`, sem parâmetro de família): `account_flows(p_from, p_to)` (D22, entradas e saídas por conta, **com** transferências) e `member_expense_totals(p_from, p_to)` (D10, Σ = despesas(P)).
3. Período dos relatórios (D21): `7_dias`, `30_dias` (padrão), `3_meses`, `12_meses` e `personalizado` (até 366 dias), na URL. Comparação pelo período anterior de mesmo comprimento.
4. Rotas: `/relatorios` (visão geral) e `/relatorios/{categorias,contas,integrantes,orcamentos,metas}`, cada uma com só as consultas da própria seção. Gráficos só pelos componentes de `src/components/charts` (ADR-0021); um componente novo, `HorizontalBarChart`, sem pacote novo.
5. Sem exportação (não pedida) e sem cache (ADR-0015).

**Alternativas.** Uma página única com todos os relatórios: cerca de 15 consultas por acesso. Recalcular por integrante em TS a partir das transações: viola a §14. Período igual ao do dashboard (mês atual/anterior): não atende o mockup 5.

**Consequências.** Σ por integrante = despesas(P) e Σ líquido das contas de ativo = variação do consolidado são testadas (R20). "Evolução mensal" mostra receitas, despesas e resultado por mês (não a evolução do patrimônio, que exigiria um saldo por mês).
