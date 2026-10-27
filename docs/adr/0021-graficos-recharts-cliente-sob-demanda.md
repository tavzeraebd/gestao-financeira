# ADR-0021 — Gráficos com Recharts em client components carregados sob demanda, sem o `chart` do shadcn

Status: aceita (2026-10-24, Etapa 4) · Escopo: `src/components/charts/**`, `package.json` · Refina ADR-0015 e ADR-0019

**Contexto.** A spec §3.1/§7.11 nomeia o Recharts. Todo gráfico precisa ter título, período, legenda quando necessária, valores em BRL, estado sem dados, layout responsivo e acessibilidade que não dependa só de cor. A ADR-0015 proíbe cache de dados de família. O componente `chart` do shadcn injeta CSS com `dangerouslySetInnerHTML` (`ChartStyle`), o que o threat model veta (AB-55). As cores de dado são os tokens `chart-1..6`, `chart-income` e `chart-expense` (ADR-0019).

**Decisão.**
1. O Recharts, na última versão estável, é o **único** pacote novo das Etapas 4 e 5. Quem instala é o design-system, na Fase A da Etapa 4.
2. O `recharts` só é importado em `src/components/charts/*.tsx` com `"use client"`. As telas usam `charts/lazy.tsx`, que carrega os gráficos com `next/dynamic` (`ssr: false`, `loading` = `Skeleton`). Assim o Recharts fica fora do bundle das outras rotas.
3. O `chart` do shadcn não é usado. As cores chegam ao SVG como `var(--color-chart-N)` (`fill`/`stroke`), sem hex nem `<style>` injetado.
4. Os dados chegam **só por props** de um Server Component da requisição, todos serializáveis (`Cents` inteiros e strings já formatadas). O gráfico não faz fetch, não grava em `localStorage`/`sessionStorage` e não usa biblioteca de cache de cliente.
5. Acessibilidade: o `ChartCard` mostra título e período visíveis, uma legenda com nome e valor em texto e um botão "Ver tabela" (`aria-expanded`) que troca o gráfico por uma tabela com os mesmos dados. O SVG tem `role="img"` e um `aria-label` com o resumo. Com `prefers-reduced-motion`, as animações do Recharts ficam desligadas. Nenhuma informação depende só da cor.

**Alternativas.** `chart` do shadcn: `dangerouslySetInnerHTML` e uma camada de config de cor que não traz ganho. SVG próprio sem biblioteca: a spec nomeia o Recharts, e manter eixos, tooltip e responsividade à mão custa mais. Recharts renderizado no servidor: ele depende de medição e de hooks do cliente.

**Consequências.** Antes da hidratação, a rota mostra o `Skeleton` no lugar do gráfico. O número principal de cada bloco é HTML do servidor e não depende do gráfico. Os relatórios da Etapa 7 reutilizam os mesmos componentes. Se a versão estável do Recharts for incompatível com React 19.3/Next 16.4, o caso vai ao orchestrator (pedido de mudança). O plano B é SVG próprio, sem pacote novo.
