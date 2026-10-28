# ADR-0026 — Divisão de despesas: parcelas só por RPC, Σ = valor exato, reescala no pagamento; liquidação sem efeito em contas

Status: aceita (2026-10-24, Etapa 6) · Escopo: `expense_splits`, `settlements`, `set_transaction_splits`, `/divisao` · Refina `financial-definitions.md` D10 e D13 e `data-model.md` §5.8

**Contexto.** A spec §7.10 separa (1) a despesa familiar original, (2) a distribuição de responsabilidade entre integrantes e (3) a liquidação entre eles, e exige que a divisão não duplique a despesa e que a soma das parcelas seja o valor original exato. A matriz aprovada dá a divisão a owner/admin e ao autor da despesa, por RPC. Na Etapa 5 o valor de um compromisso pode mudar no pagamento (`pay_pending_transaction`) e na edição.

**Decisão.**
1. (1) A despesa é a linha de `transactions` e conta uma vez no consolidado e em D4. (2) As parcelas ficam em `expense_splits` e **nenhuma** função de saldo, de totais ou de orçamento as lê. (3) A liquidação fica em `settlements` e não toca conta nem consolidado.
2. `expense_splits` não tem grant de escrita. Só a RPC `set_transaction_splits(p_transaction_id, p_mode, p_shares)` (`security definer`) grava, substituindo o conjunto inteiro. Modos: `equal` (a RPC calcula), `amounts` (o usuário informa; Σ tem de ser exata) e `none` (remove). Uma constraint trigger `deferrable initially deferred` confere Σ parcelas = `transactions.amount` no commit.
3. Arredondamento (D13): `private.allocate_cents(total, pesos[])`, maior resto, empate pela ordem dos integrantes (`joined_at`, depois `id`). É a mesma regra do `allocate` de `src/lib/money`, que o app usa só para a prévia; a paridade é testada com a mesma tabela de casos.
4. Mudou o valor da despesa (pagamento com valor real, edição): um trigger `after update of amount` (`security definer`) **reescala** as parcelas na proporção anterior, pela mesma `allocate_cents`. Estorno não tem divisão própria: herda a proporção do original na leitura.
5. Quem pagou = `assigned_member_id` (o "responsável pelo pagamento" da spec). Saldo entre integrantes = parcelas de X em despesas **efetivadas** pagas por Y (líquidas de estorno) − liquidações de X para Y, compensado por par. Despesa sem responsável não gera dívida.
6. Participantes: 2 a 20, distintos, da família do chamador e com vínculo ativo; um ex-integrante só pode continuar numa divisão em que já estava (preserva o histórico). Liquidação com ex-integrante é permitida (a dívida é histórica).

**Alternativas.** Parcelas como lançamentos (uma despesa por integrante): duplica a despesa no consolidado, contra a spec. Grant de escrita em `expense_splits` com policy: não garante Σ exata entre linhas. Bloquear o pagamento com valor diferente quando há divisão: obriga a desfazer e refazer a divisão a cada conta com valor variável. Arredondar cada parcela por `round()`: a soma pode não fechar.

**Consequências.** D13 existe em SQL e em TS, com teste de paridade (exceção consciente à regra "uma fórmula, um lugar": a fonte de verdade é o SQL; o TS é só prévia). A Etapa 7 usa `member_expense_totals` e `member_balances` nos relatórios.

## Emendas

**2026-10-27 · pós-revisão da Etapa 6 (migration `20261024101700`; `etapa-6.md` v1.1).** A implementação refinou a decisão sem mudar o desenho:
1. **Parcela mínima (item 3 e 4).** Se o rateio (`equal`, `amounts` ou reescala por mudança de valor) produzir parcela ≤ 0, a RPC e `private.rescale_splits` falham com `SPLIT_AMOUNT_TOO_SMALL` (`P0001`), e não mais com `23514` da CHECK de `expense_splits.amount`. Consequência: pagar ou editar para um valor muito baixo uma despesa dividida é rejeitado; a saída é remover a divisão ou aumentar o valor.
2. **Auditoria sem ruído (item 2, SEC-23).** `set_transaction_splits` é no-op quando o conjunto novo é idêntico ao atual, e `none` sem parcelas não audita. `transaction.splits_changed` só existe quando algo mudou.
3. **Quem exclui o acerto (item 1, SEC-25).** A exclusão lógica de `settlements` vale para owner/admin, autor **e** as partes (`from`/`to`) com vínculo ativo. Sem isso, quem foi apontado em um acerto que não registrou não tinha como contestá-lo. Toda exclusão continua auditada (`settlement.deleted`).
4. **Fora desta etapa.** `member_expense_totals`, citada nas consequências, não foi criada; é da Etapa 7. `member_balances` existe e é a única função que lê `expense_splits`.
