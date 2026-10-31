# ADR-0013 — Cartão de crédito como conta de passivo com fatura derivada

Status: aceita (Etapas 3/5) · Escopo: accounts, transactions, dashboard

**Contexto.** Spec §5.1/§8 pede regra para compras e pagamento de fatura sem dupla contabilização.

**Decisão.** Conta `credit_card` com limite, dia de fechamento e vencimento. Compra = despesa paga no cartão (período da compra; **desde a [ADR-0041](0041-despesa-de-cartao-no-mes-da-fatura.md), a despesa conta no mês do vencimento da fatura; o saldo e a dívida seguem a data da compra**). Pagamento da fatura = transferência ativo→cartão (não é despesa). Fatura calculada pelas datas, sem tabela própria. Cartões ficam fora do saldo consolidado; o indicador "Faturas em aberto" é separado.

**Alternativas.** Despesa só no pagamento da fatura: perde a categoria e a data real da compra. Tabela de faturas: complexidade sem requisito.

**Consequências.** Parcelamento e fechamento manual de fatura ficam fora do MVP (nova ADR se forem exigidos).
