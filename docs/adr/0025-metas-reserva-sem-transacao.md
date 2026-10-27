# ADR-0025 — Metas: progresso = Σ contribuições; aporte é reserva sem lançamento vinculado

Status: aceita (2026-10-24, Etapa 6) · Escopo: `goals`, `goal_contributions`, `/metas` · **Revisa** `financial-definitions.md` D9 (item b) e `data-model.md` §5.6–5.7 (remove `goal_contributions.transaction_id`)

**Contexto.** A spec §7.9 pede nome, objetivo, acumulado, restante, percentual, data-alvo, histórico de aportes e status, e a §8 exige definir como aportes e retiradas afetam saldos. A D9 v1.1 previa dois modos: aporte só como marcação e aporte ligado a uma transferência (`transaction_id`, `unique`, trigger exigindo `type='transfer'`). O segundo modo obriga a manter duas linhas em sincronia: editar ou excluir a transferência, estornar, trocar a conta, valor diferente do aporte. Já existe a transferência entre contas (ADR-0018), que move dinheiro sem ser receita nem despesa (D4).

**Decisão.**
1. **Fonte única do progresso**: `acumulado = Σ deposit − Σ withdrawal` de `goal_contributions` não excluídas. Não existe `current_amount`.
2. **Aporte é reserva (alocação), não movimento de conta.** Nenhuma contribuição tem vínculo com `transactions`. Ela não altera saldo de conta (D1), saldo consolidado (D3), receitas, despesas e resultado (D4), orçamento (D14) nem fluxo de caixa. Se a família de fato move o dinheiro (corrente → poupança), registra uma transferência comum, que também não muda o consolidado. As duas coisas são independentes e não se contam duas vezes.
3. Invariantes no banco: acumulado nunca fica negativo (retirada ou exclusão lógica de aporte que o deixaria < 0 → `GOAL_NEGATIVE_PROGRESS`, sob `pg_advisory_xact_lock` da meta); contribuição só em meta `active` (`GOAL_NOT_ACTIVE`); data ≤ hoje; contribuição é imutável (corrigir = excluir logicamente e registrar outra).
4. Status `active ↔ paused`, `active|paused → completed|canceled`; `completed` e `canceled` são finais. Concluir manualmente é permitido mesmo abaixo do alvo (decisão da família).
5. Estimativa de conclusão (D9): média mensal = líquido dos últimos 90 dias ÷ 3; a tela sempre mostra a premissa. Média ≤ 0 → "sem estimativa".
6. Imagem da meta = ícone de uma lista fechada (`GOAL_ICONS`), sem Storage.

**Alternativas.** Aporte ligado a transferência (D9 v1.1, item b): sincronização de duas linhas, regras de edição e de estorno cruzadas, e nenhum ganho para o usuário, que pode registrar a transferência à parte. Aporte como despesa: viola a spec §8 (aporte não é despesa) e distorce o resultado. Conta "virtual" por meta: cria uma conta de ativo que soma no consolidado duas vezes.

**Consequências.** O consolidado continua sendo só a soma das contas; "reservado em metas" é uma informação à parte, sem garantia de que o dinheiro esteja separado (o texto da tela diz isso). A regressão R15 prova que nenhum número financeiro muda com aportes e retiradas.
