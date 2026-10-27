# ADR-0011 — Recorrências materializadas sob demanda e idempotentes

Status: aceita (implementação na Etapa 5) · Escopo: recurrences, transactions

**Contexto.** Spec §5.1/§7.7: o dashboard não pode depender de job; prevenir duplicidade; recuperar falhas; não prometer processamento sem mecanismo real.

**Decisão.** A RPC `materialize_recurrences()` cria ocorrências `pending` até o fim do mês seguinte e é chamada ao acessar o app (layout/dashboard). `unique (recurrence_id, occurrence_date)` garante idempotência e o catch-up recupera atrasos. Projeções além do horizonte são virtuais. Regras de datas: `financial-definitions.md` D12. `pg_cron` pode entrar depois como gatilho extra, sem mudar o modelo.

**Alternativas.** Job agendado como único mecanismo: falha silenciosa e dependência de infraestrutura. Só ocorrências virtuais: impossível pagar ou editar uma ocorrência.

**Consequências.** O primeiro acesso do mês faz a materialização (custo pequeno); editar a série só regenera futuras não editadas.
