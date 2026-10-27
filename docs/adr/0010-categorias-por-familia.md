# ADR-0010 — Categorias sempre por família (padrões copiados na criação)

Status: aceita (implementação na Etapa 3) · Escopo: categories · **Diverge da spec** (§5.1: `family_id` nulo = global)

**Contexto.** Categorias globais complicam a RLS (linhas sem família), a FK composta de isolamento e a personalização (renomear/arquivar um padrão afetaria todas as famílias).

**Decisão.** `categories.family_id not null`; `create_family` semeia os padrões da spec §7.5 com `is_default = true`; a migration da Etapa 3 semeia as famílias já existentes.

**Alternativas.** Globais + tabela de "ocultas por família": mais tabelas e regras para o mesmo efeito.

**Consequências.** Mudança na lista padrão não se propaga a famílias existentes (aceitável); FKs compostas cobrem categorias.
