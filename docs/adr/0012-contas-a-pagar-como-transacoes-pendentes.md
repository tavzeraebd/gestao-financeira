# ADR-0012 — Contas a pagar/receber são transações pendentes

Status: aceita (Etapa 5) · Escopo: transactions · Refina a spec (§7.6 não define entidade)

**Contexto.** A spec exige relação compromisso ↔ transação sem dupla contabilização.

**Decisão.** Não há tabela de contas a pagar: compromisso = `transactions.status = 'pending'`. Pagar muda a mesma linha para `paid` com a data do pagamento; `due_date` guarda o vencimento original; vencido é derivado.

**Alternativas.** Tabela `bills` ligada a `transactions`: duas linhas por fato, sincronização e risco de contar duas vezes.

**Consequências.** Listagens distinguem previsto e efetivado pelo status; pagamento parcial fica fora do MVP.
