# ADR-0004 — Saldo derivado das movimentações

Status: aceita · Escopo: contas, dashboard, relatórios (Etapa 3+)

**Contexto.** Spec §7.4 exige uma única fonte de verdade para o saldo; edição e estorno não podem deixá-lo inconsistente.

**Decisão.** Não existe coluna de saldo. Saldo = `opening_balance` + Σ lançamentos efetivados (D1), calculado no banco por função `security invoker` com índice `(account_id, transaction_date)`. O mesmo serviço atende dashboard e relatórios.

**Alternativas.** Coluna `current_balance` mantida por trigger: duas fontes de verdade e risco de deriva em edição, exclusão e concorrência.

**Consequências.** Leitura agregada (custo aceitável para volume familiar). Se ficar lento, snapshot mensal materializado com invalidação explícita (nova ADR).

**Atualização (2026-10-23, Etapa 3).** `account_balances` devolve `balance text` (ADR-0003), e a data padrão é `private.today()` (America/Sao_Paulo), não `current_date`. Ver ADR-0018.
