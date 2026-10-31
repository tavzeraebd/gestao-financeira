# ADR-0041 — Despesa no cartão conta no mês do vencimento da fatura: data de apuração derivada na leitura, regra única em SQL espelhando `invoiceOf`

Status: **aceita** (2026-10-31; usuário aceitou P1–P3) · Escopo: funções `period_summary`, `monthly_cash_flow`, `category_totals`, `budget_progress`, `member_expense_totals` (mesma assinatura); funções novas `private.card_invoice_closing`, `private.card_invoice_due`, `private.reporting_date_of`, `private.reporting_transactions`, `public.reporting_date(transactions)`; lista de Transações; /inicio (classificação de cartão arquivado); card do cartão em Contas; D4, D5, D8, D10, D11, D14, D22, D23, D24 e a D26 nova (`financial-definitions.md` v1.5) · **Revisa** a ADR-0013 ("compra = despesa no período da compra"), a ADR-0020 §2, a ADR-0024 §3 e a ADR-0028 §1 · Reutiliza a ADR-0003, a ADR-0006, a ADR-0009, a ADR-0040 e a D24

**Contexto.** Pedido do usuário, já decidido: em todas as telas, a despesa no cartão conta no mês do vencimento da fatura, não no mês da compra. Ex.: o cartão fecha dia 11, e a compra de R$ 10 feita no dia 11 aparece no mês seguinte; o mês atual mostra só o gasto até o dia 10. A fatura de uma compra já está definida em `invoiceOf` (`src/modules/reports/domain/card-invoices.ts`, D24). Hoje ela só vale no comprometimento do /inicio (TS) e nas faturas de Contas (D25). Os totais por período estão em cinco funções SQL `security invoker`, que filtram por `transaction_date` (D4/D11). Fatos que limitam o desenho: `credit_card` ⇔ os dois dias preenchidos (CHECK em `accounts`); `type` da conta não pode ser alterado (fora do grant de update), mas os dias de fechamento e de vencimento podem; não existe coluna gerada que leia outra tabela; `transactions_before_write` impõe imutabilidade (cancelados) e auditoria a todo `update`; o índice de período é `transactions_family_date_idx (family_id, transaction_date)`.

**Decisão.**
1. **Data de apuração (D26).** Para `expense` em conta `credit_card` com os dois dias, data de apuração = vencimento de `invoiceOf(transaction_date, fechamento, vencimento)`. Nos demais casos, data de apuração = `transaction_date`. Ela vale para compra paga, pendente, parcela (D23), ocorrência materializada e estorno. O estorno usa a fatura da data **do estorno**: o crédito entra na fatura em que é lançado (D5), e meses passados não se reescrevem. A data de apuração é o vencimento, não o 1º dia do mês, para que intervalos de dias (7/30 dias, personalizado) também tenham resposta definida. Num mês civil, os dois critérios dão o mesmo resultado.
2. **Onde a regra vive.** Ela é derivada na leitura e nunca gravada. Funções novas, todas com `search_path = ''`:
   - `private.card_invoice_closing(p_date date, p_closing_day smallint) returns date` — `immutable strict parallel safe`. Fechamento = dia C do mês da compra (ajustado ao último dia do mês) se a compra é anterior a ele; senão, dia C do mês seguinte (ajustado).
   - `private.card_invoice_due(p_date date, p_closing_day smallint, p_due_day smallint) returns date` — `immutable strict parallel safe`. Vencimento = dia V do mês do fechamento (ajustado) se for **maior** que o fechamento; senão, dia V do mês seguinte (ajustado). É o espelho exato de `invoiceOf`.
   - `private.reporting_date_of(p_date date, p_type text, p_account_type text, p_closing_day smallint, p_due_day smallint) returns date` — `immutable parallel safe` (não `strict`). Devolve `card_invoice_due(...)` quando `p_type = 'expense'`, `p_account_type = 'credit_card'` e os dois dias não são nulos; senão, `p_date`.
   - `private.reporting_transactions(p_from date, p_to date) returns table (id uuid, type text, status text, amount numeric, reversal_of_id uuid, category_id uuid, assigned_member_id uuid, account_id uuid, transaction_date date, reporting_date date)` — `stable security invoker`. É o **único** lugar do recorte de período. Ela lê `transactions` com `family_id = (select private.current_family_id())`, `deleted_at is null`, `status in ('paid','pending')` e `type in ('income','expense')`, junta `accounts` e aplica o **prefiltro indexável** `transaction_date between (date_trunc('month', p_from) - interval '2 months')::date and p_to`, depois `reporting_date between p_from and p_to`. Datas nulas, não finitas ou invertidas → `INVALID_INPUT`. O prefiltro é exato: o vencimento é sempre posterior à compra e cai no mês da compra ou em um dos dois seguintes.
   - `public.reporting_date(t public.transactions) returns date` — `stable security invoker`, campo computado do PostgREST para a lista de Transações. Valor = `reporting_date_of` com a conta de `t`, lida sob RLS; se a conta não estiver visível, devolve `coalesce(..., t.transaction_date)`.
   - Grants: `revoke execute ... from public, anon`; `grant execute ... to authenticated`. As privadas precisam disso porque são chamadas por funções `invoker` (mesmo padrão de `private.today` e `private.recurrence_occurrence`).
3. **Funções alteradas** (`create or replace`, assinatura e retorno iguais, grants preservados): `period_summary`, `monthly_cash_flow`, `category_totals`, `budget_progress` (realizado **e** comprometido) e `member_expense_totals`. Todas passam a ler de `private.reporting_transactions` e a agrupar e filtrar por `reporting_date`. Validações, tetos (24 meses, 12 meses, 366 dias), arredondamento e saída em `text` não mudam, com uma exceção (SEC-35): a faixa `p_from < 2000-01-01`, `p_to > 9999-12-31` e ±infinity passa a ser recusada com `INVALID_INPUT`, pois o app já impõe o piso 2000-01-01. `refresh_notifications` herda a regra por chamar `budget_progress`, sem mudança.
4. **Não mudam** (seguem `transaction_date`): `account_balances` (D1/D3), dívida, "faturas em aberto" e limite (D8), `account_flows` (D22: fim = início + líquido exige a data do efeito no saldo), `pending_summary` e próximos vencimentos (D19), `projected_cash_flow` (D15, saldo futuro), `goal_summary`, `member_balances`, as RPCs de escrita, as notificações de vencimento e as faturas de Contas (D25, que já são por fatura). Transferência e pagamento de fatura continuam fora das despesas (D8).
5. **Dias atuais do cartão.** A classificação usa os dias vigentes. Se o cartão mudar fechamento ou vencimento, o histórico se reclassifica (totais e orçamentos de meses passados), e o saldo não muda. **Aceito**, por quatro razões: D24 e D25 já funcionam assim; não há requisito de congelamento; congelar exigiria coluna gravada mais backfill (ver Alternativas); e a decisão é reversível com uma coluna futura, sem quebrar contrato. O formulário da conta passa a avisar isso num `InfoHint`. Pergunta P1 ao usuário.
6. **Uma regra por linguagem, provadamente iguais.** TS: `invoiceOf` continua sendo a única implementação, usada por D24/D25 e pelo rótulo da lista. SQL: `private.card_invoice_due`. A prova é uma tabela única de casos em `src/modules/reports/domain/card-invoice-cases.json` (`{ purchase, closingDay, dueDay, closing, due, note }`):
   - o teste unitário de `invoiceOf` percorre a tabela;
   - `scripts/gen-card-invoice-cases.ts` gera `supabase/tests/database/690_card_invoice_cases.test.sql`, que roda `is(private.card_invoice_closing(...))` e `is(private.card_invoice_due(...))` por caso;
   - um teste unitário compara o arquivo gerado com o versionado e falha se divergirem.
   O comprometimento do /inicio não ganha implementação nova: continua em `withInvoice`/`invoiceOf`.
7. **Telas.**
   - Início, Relatórios, Orçamentos e Planejamento (base conhecida): mudam só pelos números das funções. O /inicio passa a classificar também cartão **arquivado** (os `cards` da classificação incluem os arquivados; a alocação da dívida continua só nos ativos, como hoje).
   - Transações: o filtro `de`/`ate` passa a valer sobre `reporting_date`, com o prefiltro equivalente em `transaction_date`. A coluna exibida e a ordenação continuam pela data real. A linha com `reportingDate ≠ transactionDate` mostra "Fatura <mês>".
   - Contas: os rótulos passam a ser "Fatura de <mês do vencimento>" (aberta e fechada), sem mudança de dados.

**Desempenho e dados existentes.**
- Nenhuma tabela, coluna, índice ou policy nova. O prefiltro mantém o uso de `transactions_family_date_idx` e lê no máximo dois meses a mais de linhas da família, que já tem teto de 100 000 ativos (ADR-0033).
- O join com `accounts` é por PK, e o custo por linha é uma função `immutable`.
- Índice por expressão é impossível (os dias estão em outra tabela) e desnecessário nesse volume.
- Critério: `explain analyze` de `budget_progress` com 12 meses e de `monthly_cash_flow` com 24 meses, na base de seed, mostra *Index Scan/Bitmap* em `transactions_family_date_idx`.
- Dados gravados: **nenhum muda**. No deploy, todos os totais mensais históricos com despesas de cartão mudam de mês, inclusive meses passados de orçamento. Um orçamento pode passar a ≥ 80% e gerar `budget_near_limit` (esperado).
- Migration única (`supabase/migrations/2026110110000x_card_expense_invoice_month.sql`): só funções, sem lock relevante, aplicada à mão em produção pelo runbook. O deploy do app pode ir antes ou depois sem quebrar: o contrato das RPCs é o mesmo, e o campo `reporting_date` só é lido pelo app novo. Por isso, **a migration vai primeiro**.
- Down manual: reexecutar os corpos anteriores das 5 funções (cópias em comentário na própria migration) e dar `drop` nas 5 funções novas.

**Segurança (threat model curto, fx-threat-modeling).**
1. *O que entra:* só datas de período, já validadas, e dias vindos do banco (CHECK 1..31). Requisito: `reporting_transactions` rejeita nulo, `infinity` e intervalo invertido com `INVALID_INPUT` — pgTAP `throws_ok`.
2. *Quem chama:* tudo é `security invoker`; nenhuma função `definer` nova. A família vem de `current_family_id()` mais a RLS. Requisito: as quatro privadas não são expostas — `rpc-exposure.test.ts` recebe `card_invoice_closing`, `card_invoice_due`, `reporting_date_of` e `reporting_transactions` com 404.
3. *O que sai:* as mesmas colunas de antes; o campo computado devolve só uma data de linha que o chamador já vê. Requisito: `anon` não executa nenhuma função nova (`has_function_privilege` em pgTAP).
4. *Se falhar:* o risco é de integridade (total no mês errado), não de sigilo. Mitigação: tabela compartilhada de casos e regressão R4/R11/R21/R22/R24–R26. Custo por linha limitado pelo prefiltro e pelos tetos existentes.
5. *Quem não deveria:* integrante da família B que chama `/rpc/reporting_date` com uma linha forjada com uma conta de A recebe a própria `transaction_date` forjada; os dias de A não vazam (a RLS de `accounts` esconde a conta). Requisito: teste de isolamento em pgTAP ou integração. `search_path = ''` com nomes qualificados em todas as funções; `supabase db lint` sem aviso.

**Testes afetados.**
- pgTAP:
  - novo `690_card_invoice_cases` (gerado) e um teste da D26 com R24–R26 e o isolamento;
  - `150_balances_regression` e `360_etapa5_regression`: R4 reescrito (cartão 10/20, compra 15/03 → abril);
  - `210_dashboard_regression`: R11 com a compra em dia anterior ao fechamento, para continuar em março;
  - `680_installment_purchases`: R21/R22 com os números da v1.5;
  - `540_report_functions`: Σ `member_expense_totals` = despesas com despesa de cartão atravessando o mês;
  - `500/600_privileges`: as funções novas.
- Integração: `financial-regression`, `dashboard`, `installments`, `budgets`, `transactions` (filtro por mês com compra do mês anterior, a confirmar pelo implementador quais asserções quebram) e `rpc-exposure`.
- E2E (não rodar agora): `contas.spec.ts` (rótulos "Fatura de …", com os mesmos `data-testid`), `transacoes.spec.ts`, `inicio.spec.ts`, `orcamentos.spec.ts` e `relatorios.spec.ts`, onde houver compra de cartão.

**Alternativas.**
- **Coluna gravada `reporting_date` mantida por trigger, com índice.** Indexável, mas exige backfill de todas as linhas passando por `transactions_before_write` (que rejeita `update` em cancelados e audita cada linha) e cascata a cada mudança de dia do cartão, além de mexer no trigger central. É mais risco do que a mudança justifica.
- **Coluna gerada:** impossível, porque depende de `accounts`.
- **Congelar a fatura na compra** (`invoice_due_date` gravado no insert): sem requisito, pede a mesma migração de dados e cria uma segunda verdade quando o usuário corrige os dias. Fica para quando houver pedido (P1).
- **View `security_invoker` para a lista:** troca o endpoint e complica os embeds por nome de FK de `ITEM_COLUMNS`. O campo computado mantém a tabela e os embeds.
- **Janelas inversas por cartão em filtros PostgREST montados no TS:** seria uma segunda implementação (inversa) da regra.
- **Recalcular os totais no TS a partir das linhas:** viola a spec §14 e a ADR-0020 §1.
- **Aplicar também a saldos e ao relatório por conta:** quebra a D1 e a reconciliação da D22.
- **Data de apuração = 1º dia do mês do vencimento:** igual num mês civil, mas sem sentido em intervalos de dias.

**Consequências.**
- D4 deixa de ser "regime de caixa pela data da compra" para despesas de cartão. Em um mesmo mês, o relatório por conta (D22) e o resumo (D4) mostram valores diferentes para o cartão. Isso é intencional e explicado em `InfoHint` (P2).
- Borda herdada da ADR-0040: com fechamento entre 29 e 31, duas parcelas podem cair na mesma fatura e nenhuma na anterior. Cada uma conta na sua fatura (R26).
- O comprometimento (/inicio) e os totais passam a ter a mesma fronteira de mês para o cartão. Continua a diferença de natureza: o comprometimento olha o que está em aberto, os totais olham o que foi realizado.
- Revisões ao aceitar esta ADR:
  - ADR-0013: "Compra = despesa paga no cartão (período da compra)" passa a "data da compra para saldo; mês da fatura para totais (ADR-0041)";
  - ADR-0020 §2, ADR-0024 §3 e ADR-0028 §1: nota "período por data de apuração (D26)";
  - `data-model.md`: as funções novas, as alteradas e o campo computado;
  - `docs/contracts`: nota da v1.5 na linha das 5 funções.
- Fora do escopo: `projected_cash_flow` continua descontando o pendente de cartão na data dele (aproximação já aceita na ADR-0040); o comprometimento do /inicio continua ignorando a dívida de cartão arquivado; e não haverá visão de extrato da fatura.
