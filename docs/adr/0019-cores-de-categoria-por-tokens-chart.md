# ADR-0019 — Cores de categoria são as chaves `chart-1` a `chart-6` (tokens existentes)

Status: aceita (2026-10-23, Etapa 3) · Escopo: `categories.color`, `categories.icon`, componentes de categoria · Refina `data-model.md` §5.2

**Contexto.** O `data-model.md` §5.2 previa 9 chaves de cor (`lime`, `sky`, `violet`, `pink`...). A ADR-0005 limita o tema escuro aos valores Rocket e a `color-mix()` entre eles. Rocket não tem azul, violeta, rosa nem amarelo, então 9 cores distintas no escuro são impossíveis sem quebrar a ADR-0005.

**Decisão.** `categories.color` aceita só `'chart-1'` a `'chart-6'`, mapeadas para os tokens `--chart-N` que já existem (claro: Lime/Sky/Orange/Violet/Pink/Zinc; escuro: valores Rocket). A cor é decorativa: nome e ícone sempre aparecem juntos. `categories.icon` é um nome Lucide de uma allowlist do app (`src/modules/categories/constants.ts`); o banco confere só o formato.

**Alternativas.** 9 chaves com tokens novos: viola a ADR-0005 no escuro. Hex por categoria: proibido (hex só em `globals.css`).

**Consequências.** Com mais de 6 categorias, as cores se repetem (os gráficos da Etapa 4 mostram legenda com nome). Mudar a paleta é mudar só os valores dos tokens. Nenhum token novo na Etapa 3.
