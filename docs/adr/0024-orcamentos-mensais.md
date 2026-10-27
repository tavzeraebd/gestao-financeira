# ADR-0024 — Orçamentos mensais por categoria de despesa, calculados por função `security invoker`

Status: aceita (2026-10-24, Etapa 5) · Escopo: `budgets`, `budget_progress`, `/orcamentos` · Refina o `data-model.md` §5.5 e a D14

**Contexto.** A spec §7.8 pede: planejado, realizado, saldo disponível, % consumido, indicadores de atenção, comparação com períodos anteriores e a definição do que entra no cálculo. O `data-model.md` §5.5 previa `period_type monthly|custom` e `name`. A D14 dizia que "comprometido" eram todas as despesas pendentes do período, sem recorte por categoria.

**Decisão.**
1. **Só mensal**: o orçamento vale para cada mês civil de `start_month` até `end_month` (opcional), com o mesmo limite em todos os meses (D14). Ficam fora `custom` e `name`: a spec não pede período personalizado, e o rótulo é o nome da categoria ou "Todas as despesas".
2. `category_id` aponta para uma categoria de despesa, pai ou filha (nulo = todas as despesas). É imutável depois de criado e tem FK composta. Há um orçamento ativo por categoria (`nulls not distinct`). Categoria-pai inclui as filhas.
3. Cálculo: `budget_progress(p_from_month, p_to_month)` (`security invoker`, até 12 meses) devolve `spent` (D4: despesas efetivadas da categoria; estornos abatem pela data do estorno; transferências e pendentes ficam fora) e `committed` (despesas pendentes da mesma categoria no mês). Disponível, percentual e estado (`ok` < 80%, `attention` de 80% a 100%, `exceeded` > 100%) ficam em `budgets/domain/progress.ts`, em TS puro.
4. **Categoria arquivada**: o orçamento existente continua calculando, e a UI mostra o selo "Categoria arquivada" sugerindo arquivar o orçamento. Criar orçamento ou reativar um arquivado com categoria arquivada → `CATEGORY_ARCHIVED`. Excluir categoria com orçamento → FK `23503` (`CATEGORY_IN_USE`).
5. Escrita direta com RLS (owner/admin). Não há exclusão (arquivar). Não há auditoria: é planejamento, e a spec §5.1 pede auditoria de permissões, exclusões e lançamentos. A Etapa 5 não gera alertas: o estado aparece na UI, e as notificações `budget_near_limit` ficam para a Etapa 7.

**Alternativas.** Período `custom`: complica a comparação entre períodos sem requisito. Limite versionado por mês: a D14 manda usar o limite vigente. Calcular no TS: viola a §14.

**Consequências.** "Comparação com períodos anteriores" mostra os 3 meses anteriores dentro da vigência, com o limite atual. Mudar o limite muda também a leitura dos meses passados (o mesmo limite vigente, decisão D14).
