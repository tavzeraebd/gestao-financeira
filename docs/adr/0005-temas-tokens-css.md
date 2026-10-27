# ADR-0005 — Temas por tokens CSS (Tailwind v4) com classe `.dark` e next-themes

Status: aceita · Escopo: design system

**Contexto.** Spec §2.4: tokens semânticos, claro (Lime) e escuro (Rocket com valores exatos), persistência da escolha, Tailwind v4 sem config JS.

**Decisão.** Variáveis CSS em `:root`/`.dark` em `src/app/globals.css`, expostas por `@theme inline`; variante `dark` por classe. `next-themes` (`attribute="class"`, padrão `light`, opção `system`, `storageKey="nucleo-theme"`). O claro usa o hex da spec `#84CC16` (Lime 500 do Tailwind v3), não o oklch do v4. O escuro usa só valores Rocket; tons suaves por `color-mix()` desses valores. Texto sobre `primary` é escuro (contraste AA).

**Alternativas.** `data-theme` + script próprio: reimplementa o next-themes. Cookie lido no servidor: não cobre `system` sem flash. `tailwind.config.js` com a paleta: incompatível com a orientação v4 da spec.

**Consequências.** Preferência por dispositivo (localStorage; não é dado financeiro); hex só em `globals.css`; troca de tema nunca toca dados.
