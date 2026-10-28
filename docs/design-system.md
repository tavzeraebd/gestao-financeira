# Design System do Núcleo

Fonte de verdade: tokens em `src/app/globals.css`; componentes em `src/components/ui` (shadcn, estilo `base-nova`, sobre Base UI) e `src/components/shared`. Não é o design system da EBD. Hex só existe em `globals.css`; nas telas use apenas tokens (`bg-primary`, `text-muted-foreground`...).

## Tema

- Claro: Lime/Zinc. `--primary` = `#84CC16`. Escuro: somente a paleta Rocket (`#121214 #202024 #29292E #7C7C8A #C4C4CC #E1E1E6 #00B37E #00F593 #F75A68 #FBA94C`) ou `color-mix()` entre elas.
- Variante escura: classe `dark` em `<html>` (`@custom-variant dark (&:where(.dark, .dark *))`), via `ThemeProvider` (`next-themes`, `storageKey="nucleo-theme"`, padrão claro).
- Fonte: Inter em `--font-sans` (`src/styles/fonts.ts`, exporta `fontSans`).
- Raio base `--radius: 0.75rem`; cartões `rounded-xl`.

## Ajustes de AA em relação à tabela de referência do contrato (§3.1)

A referência dizia que o DS pode ajustar neutros para cumprir contraste. Três valores foram ajustados após medição:

| Token | Referência | Adotado | Motivo |
|---|---|---|---|
| `--ring` e `--sidebar-ring` (claro) | `#84CC16` | `#4D7C0F` | foco `#84CC16` sobre branco = 1,98:1 (mínimo 3:1 para indicador de foco) |
| `--input` (claro) | `#A1A1AA` | `#85858E` | borda de controle sobre `card` = 2,56:1 (mínimo 3:1) |
| `--input` (escuro) | `#29292E` | `#7C7C8A` | borda de controle sobre `card` = 1,12:1; `#7C7C8A` é Rocket |

**Regra de foco (A-1, Etapa 8).** O indicador de foco usa o anel `--ring` **pleno**: `focus-visible:ring-ring` (e `outline-ring` na base de `globals.css`), nunca com opacidade (`ring-ring/50`). A 50% o anel media 2,04:1 no tema claro, abaixo do mínimo de 3:1 (WCAG 2.4.7 e 1.4.11). Razões medidas com o anel pleno: claro `#4D7C0F` sobre `background` `#FAFAFA` = 4,78:1 e sobre `card` = 4,99:1; escuro `#00F593` sobre `background` `#121214` = 12,90:1 e sobre `card` = 11,20:1. Espessura (`ring-3`), offset e `border-ring` de apoio não mudam. Sem token novo. Teste de regressão: `ui/foco-pleno.test.ts`.

`#84CC16` segue como `--primary` (fundo de ação, com texto `#1A2E05`) e `--sidebar-primary`. Não use Lime 500 como cor de texto nem de ícone informativo sobre fundo claro: use `primary-text`.

## Contraste medido

Calculado por script (luminância relativa WCAG 2.x; `color-mix()` resolvido em sRGB antes da razão). Mínimos: texto 4,5:1; texto grande e componentes de interface 3:1. O placeholder (`subtle-foreground`) é medido em 3:1 e nunca deve carregar informação essencial.

| Tema | Par (frente / fundo) | Frente | Fundo | Razão | Mínimo | Resultado |
|---|---|---|---|---|---|---|
| Claro | foreground / card | `#18181b` | `#ffffff` | 17.72 | 4.5 | Aprovado |
| Claro | foreground / background | `#18181b` | `#fafafa` | 16.97 | 4.5 | Aprovado |
| Claro | muted-foreground / card | `#52525b` | `#ffffff` | 7.73 | 4.5 | Aprovado |
| Claro | muted-foreground / background | `#52525b` | `#fafafa` | 7.41 | 4.5 | Aprovado |
| Claro | subtle-foreground / card (placeholder) | `#71717a` | `#ffffff` | 4.83 | 3 | Aprovado |
| Claro | primary-foreground / primary | `#1a2e05` | `#84cc16` | 7.40 | 4.5 | Aprovado |
| Claro | primary-foreground / primary-hover | `#1a2e05` | `#65a30d` | 4.73 | 4.5 | Aprovado |
| Claro | primary-text / card | `#4d7c0f` | `#ffffff` | 4.99 | 4.5 | Aprovado |
| Claro | primary-text / background | `#4d7c0f` | `#fafafa` | 4.78 | 4.5 | Aprovado |
| Claro | primary-text / primary-soft | `#4d7c0f` | `#f7fee7` | 4.82 | 4.5 | Aprovado |
| Claro | danger / card | `#dc2626` | `#ffffff` | 4.83 | 4.5 | Aprovado |
| Claro | danger-foreground / danger | `#ffffff` | `#dc2626` | 4.83 | 4.5 | Aprovado |
| Claro | foreground / danger-soft (texto do Alert) | `#18181b` | `#fee2e2` | 14.50 | 4.5 | Aprovado |
| Claro | danger / danger-soft (ícone, não texto) | `#dc2626` | `#fee2e2` | 3.95 | 3 | Aprovado |
| Claro | foreground / success-soft | `#18181b` | `#dcfce7` | 16.13 | 4.5 | Aprovado |
| Claro | foreground / warning-soft | `#18181b` | `#fef3c7` | 15.91 | 4.5 | Aprovado |
| Claro | success / card | `#15803d` | `#ffffff` | 5.02 | 4.5 | Aprovado |
| Claro | success-foreground / success | `#ffffff` | `#15803d` | 5.02 | 4.5 | Aprovado |
| Claro | warning / card | `#b45309` | `#ffffff` | 5.02 | 4.5 | Aprovado |
| Claro | warning-foreground / warning | `#ffffff` | `#b45309` | 5.02 | 4.5 | Aprovado |
| Claro | secondary-foreground / secondary | `#18181b` | `#f4f4f5` | 16.12 | 4.5 | Aprovado |
| Claro | sidebar-foreground / sidebar | `#3f3f46` | `#ffffff` | 10.44 | 4.5 | Aprovado |
| Claro | sidebar-accent-foreground / sidebar-accent | `#3f6212` | `#ecfccb` | 6.52 | 4.5 | Aprovado |
| Claro | ring / card (componente) | `#4d7c0f` | `#ffffff` | 4.99 | 3 | Aprovado |
| Claro | input (borda) / card (componente) | `#85858e` | `#ffffff` | 3.66 | 3 | Aprovado |
| Escuro | foreground / card | `#e1e1e6` | `#202024` | 12.46 | 4.5 | Aprovado |
| Escuro | foreground / background | `#e1e1e6` | `#121214` | 14.36 | 4.5 | Aprovado |
| Escuro | muted-foreground / card | `#c4c4cc` | `#202024` | 9.37 | 4.5 | Aprovado |
| Escuro | muted-foreground / background | `#c4c4cc` | `#121214` | 10.79 | 4.5 | Aprovado |
| Escuro | subtle-foreground / card (placeholder) | `#7c7c8a` | `#202024` | 3.95 | 3 | Aprovado |
| Escuro | primary-foreground / primary | `#121214` | `#00b37e` | 6.90 | 4.5 | Aprovado |
| Escuro | primary-foreground / primary-hover | `#121214` | `#00f593` | 12.90 | 4.5 | Aprovado |
| Escuro | primary-text / card | `#00b37e` | `#202024` | 5.99 | 4.5 | Aprovado |
| Escuro | primary-text / background | `#00b37e` | `#121214` | 6.90 | 4.5 | Aprovado |
| Escuro | primary-text / primary-soft | `#00b37e` | `#1c322f` | 5.01 | 4.5 | Aprovado |
| Escuro | danger / card | `#f75a68` | `#202024` | 5.12 | 4.5 | Aprovado |
| Escuro | danger-foreground / danger | `#121214` | `#f75a68` | 5.90 | 4.5 | Aprovado |
| Escuro | foreground / danger-soft (texto do Alert) | `#e1e1e6` | `#40292e` | 10.23 | 4.5 | Aprovado |
| Escuro | danger / danger-soft (ícone, não texto) | `#f75a68` | `#40292e` | 4.20 | 3 | Aprovado |
| Escuro | foreground / success-soft | `#e1e1e6` | `#1b3632` | 9.95 | 4.5 | Aprovado |
| Escuro | foreground / warning-soft | `#e1e1e6` | `#41352a` | 9.12 | 4.5 | Aprovado |
| Escuro | success / card | `#00b37e` | `#202024` | 5.99 | 4.5 | Aprovado |
| Escuro | success-foreground / success | `#121214` | `#00b37e` | 6.90 | 4.5 | Aprovado |
| Escuro | warning / card | `#fba94c` | `#202024` | 8.41 | 4.5 | Aprovado |
| Escuro | warning-foreground / warning | `#121214` | `#fba94c` | 9.70 | 4.5 | Aprovado |
| Escuro | secondary-foreground / secondary | `#e1e1e6` | `#29292e` | 11.11 | 4.5 | Aprovado |
| Escuro | sidebar-foreground / sidebar | `#c4c4cc` | `#202024` | 9.37 | 4.5 | Aprovado |
| Escuro | sidebar-accent-foreground / sidebar-accent | `#e1e1e6` | `#1b3632` | 9.95 | 4.5 | Aprovado |
| Escuro | ring / card (componente) | `#00f593` | `#202024` | 11.20 | 3 | Aprovado |
| Escuro | input (borda) / card (componente) | `#7c7c8a` | `#202024` | 3.95 | 3 | Aprovado |
| Claro | chart-1 (ícone) / chart-1/15 sobre card | `#65a30d` | `#e8f1db` | 2.65 | 3 | Reprovado |
| Claro | chart-2 (ícone) / chart-2/15 sobre card | `#0284c7` | `#d9edf7` | 3.39 | 3 | Aprovado |
| Claro | chart-3 (ícone) / chart-3/15 sobre card | `#ea580c` | `#fce6db` | 2.96 | 3 | Reprovado |
| Claro | chart-4 (ícone) / chart-4/15 sobre card | `#7c3aed` | `#ebe1fc` | 4.53 | 3 | Aprovado |
| Claro | chart-5 (ícone) / chart-5/15 sobre card | `#db2777` | `#fadfeb` | 3.68 | 3 | Aprovado |
| Claro | chart-6 (ícone) / chart-6/15 sobre card | `#71717a` | `#eaeaeb` | 4.02 | 3 | Aprovado |
| Claro | chart-1 / card (ícone) | `#65a30d` | `#ffffff` | 3.09 | 3 | Aprovado |
| Claro | chart-2 / card (ícone) | `#0284c7` | `#ffffff` | 4.10 | 3 | Aprovado |
| Claro | chart-3 / card (ícone) | `#ea580c` | `#ffffff` | 3.56 | 3 | Aprovado |
| Claro | chart-4 / card (ícone) | `#7c3aed` | `#ffffff` | 5.70 | 3 | Aprovado |
| Claro | chart-5 / card (ícone) | `#db2777` | `#ffffff` | 4.60 | 3 | Aprovado |
| Claro | chart-6 / card (ícone) | `#71717a` | `#ffffff` | 4.83 | 3 | Aprovado |
| Claro | income / card (texto de Money) | `#15803d` | `#ffffff` | 5.02 | 4.5 | Aprovado |
| Claro | expense / card (texto de Money) | `#dc2626` | `#ffffff` | 4.83 | 4.5 | Aprovado |
| Claro | success / success-soft (ícone do SegmentedControl) | `#15803d` | `#dcfce7` | 4.57 | 3 | Aprovado |
| Claro | danger / danger-soft (ícone do SegmentedControl) | `#dc2626` | `#fee2e2` | 3.95 | 3 | Aprovado |
| Escuro | chart-1 (ícone) / chart-1/15 sobre card | `#00b37e` | `#1b3632` | 4.78 | 3 | Aprovado |
| Escuro | chart-2 (ícone) / chart-2/15 sobre card | `#00f593` | `#1b4035` | 7.91 | 3 | Aprovado |
| Escuro | chart-3 (ícone) / chart-3/15 sobre card | `#fba94c` | `#41352a` | 6.16 | 3 | Aprovado |
| Escuro | chart-4 (ícone) / chart-4/15 sobre card | `#c4c4cc` | `#39393d` | 6.63 | 3 | Aprovado |
| Escuro | chart-5 (ícone) / chart-5/15 sobre card | `#7c7c8a` | `#2e2e33` | 3.28 | 3 | Aprovado |
| Escuro | chart-6 (ícone) / chart-6/15 sobre card | `#f75a68` | `#40292e` | 4.20 | 3 | Aprovado |
| Escuro | chart-1 / card (ícone) | `#00b37e` | `#202024` | 5.99 | 3 | Aprovado |
| Escuro | chart-2 / card (ícone) | `#00f593` | `#202024` | 11.20 | 3 | Aprovado |
| Escuro | chart-3 / card (ícone) | `#fba94c` | `#202024` | 8.41 | 3 | Aprovado |
| Escuro | chart-4 / card (ícone) | `#c4c4cc` | `#202024` | 9.37 | 3 | Aprovado |
| Escuro | chart-5 / card (ícone) | `#7c7c8a` | `#202024` | 3.95 | 3 | Aprovado |
| Escuro | chart-6 / card (ícone) | `#f75a68` | `#202024` | 5.12 | 3 | Aprovado |
| Escuro | income / card (texto de Money) | `#00b37e` | `#202024` | 5.99 | 4.5 | Aprovado |
| Escuro | expense / card (texto de Money) | `#f75a68` | `#202024` | 5.12 | 4.5 | Aprovado |
| Escuro | success / success-soft (ícone do SegmentedControl) | `#00b37e` | `#1b3632` | 4.78 | 3 | Aprovado |
| Escuro | danger / danger-soft (ícone do SegmentedControl) | `#f75a68` | `#40292e` | 4.20 | 3 | Aprovado |
| Claro | chart-income / card (gráfico) | `#16a34a` | `#ffffff` | 3.30 | 3 | Aprovado |
| Claro | chart-expense / card (gráfico) | `#dc2626` | `#ffffff` | 4.83 | 3 | Aprovado |
| Claro | chart-1..6 / card (gráfico) | ver linhas "(ícone)" acima | `#ffffff` | 3.09 a 5.70 | 3 | Aprovado |
| Escuro | chart-income / card (gráfico) | `#00b37e` | `#202024` | 5.99 | 3 | Aprovado |
| Escuro | chart-expense / card (gráfico) | `#f75a68` | `#202024` | 5.12 | 3 | Aprovado |
| Escuro | chart-1..6 / card (gráfico) | ver linhas "(ícone)" acima | `#202024` | 3.95 a 11.20 | 3 | Aprovado |

Medição dos gráficos (Etapa 4, mesmo método; script fora do repositório): os oito tokens `chart-*` passam em 3:1 como componente gráfico sobre `card` nos dois temas; o menor é `chart-1` no claro (3.09) e `chart-5` no escuro (3.95). Nenhuma exceção. Mesmo assim, no tema escuro `chart-1` e `chart-income` têm o mesmo valor (`#00b37e`), assim como `chart-6` e `chart-expense` (`#f75a68`): a cor sozinha não identifica a série, por isso todo gráfico leva legenda em texto e a alternativa em tabela (ver "Gráficos").

### Medição da Etapa 8 (mesmo método; script fora do repositório)

| Tema | Par (frente / fundo) | Frente | Fundo | Razão | Mínimo | Resultado |
|---|---|---|---|---|---|---|
| Claro | SkipLink: foreground / background | `#18181b` | `#fafafa` | 16.97 | 4.5 | Aprovado |
| Escuro | SkipLink: foreground / background | `#e1e1e6` | `#121214` | 14.36 | 4.5 | Aprovado |
| Claro | SkipLink: anel `ring` / background | `#4d7c0f` | `#fafafa` | 4.78 | 3 | Aprovado |
| Escuro | SkipLink: anel `ring` / background | `#00f593` | `#121214` | 12.90 | 3 | Aprovado |
| Claro | Ícone do app: marca (`primary-foreground`) / `primary` | `#1a2e05` | `#84cc16` | 7.40 | 3 | Aprovado |
| Claro | Ícone do app: folha direita a 75% / `primary` | `#355609` | `#84cc16` | 4.31 | 3 | Aprovado |
| Claro | `chart-1` (ícone) / `chart-1/15` sobre card (reprovado, reavaliado) | `#65a30d` | `#e8f1db` | 2.66 | 3 | Reprovado, aceito (decorativo) |
| Claro | `chart-3` (ícone) / `chart-3/15` sobre card (reprovado, reavaliado) | `#ea580c` | `#fce6db` | 2.96 | 3 | Reprovado, aceito (decorativo) |

A página `/offline` e o texto do `SkipLink` usam só pares já medidos acima (`foreground`/`background`, `muted-foreground`/`background`, `primary-foreground`/`primary` do `Button`). Nada novo a medir no escuro para o ícone: o PNG é fixo, no tema claro, como o `theme_color` do manifest.

**Decisão sobre os dois "Reprovado" (CA-E8-27).** Mantidos e justificados, sem mudar token: o `CategoryIcon` é decorativo (`aria-hidden`), o nome da categoria vem sempre ao lado (ADR-0019) e WCAG 1.4.11 não exige contraste de elemento puramente decorativo; o mesmo ícone passa 3:1 sobre `card` (3.09 e 3.56) e a informação nunca depende só da cor. A única correção possível sem token novo (trocar a cor do ícone de `chart-1`/`chart-3` por `primary-text`/`warning`) chega a 4.29 e 4.18, mas descaracteriza as cores de categoria (ADR-0019): é mudança de contrato visual, não feita sem pedido do usuário. Nenhum pedido de mudança aberto. As razões de 2,65/2,96 da tabela acima e 2.66/2.96 desta medição diferem só no arredondamento do fundo tingido.

Observações de uso derivadas da medição:
- `Badge` `success`/`warning`/`danger` usam fundo sólido do token com `*-foreground` (texto), nunca texto colorido sobre `*-soft` (`danger` sobre `danger-soft` não atinge 4,5:1).
- `Alert` colorido usa texto `foreground` sobre `*-soft`; só o ícone e a borda levam a cor do estado. Estado nunca é comunicado só por cor: sempre ícone + texto.
- `text-primary-text` para link/texto em verde; `text-destructive`/`text-danger` só sobre `card`/`background`.

## Componentes

- **Button** (`ui/button.tsx`: `Button`, `buttonVariants`): `variant` `default|secondary|outline|ghost|destructive|link`; `size` `default|sm|lg|icon` (e `xs`, `icon-xs`, `icon-sm`, `icon-lg` do shadcn; xs/icon-xs/icon-sm têm alvo < 40px e não devem ser o controle principal). Alturas: default 40px, sm 36px, lg 44px, icon 40px. `loading` desabilita, define `aria-busy="true"`, mostra ícone `motion-safe:animate-spin` e mantém o texto. Não há `asChild`: use `render`.
  ```tsx
  <Button render={<Link href="/inicio" />} nativeButton={false}>Ir para o início</Button>
  <Button loading={isPending}>Salvar</Button>
  ```
- **Alert**: `variant` `default|destructive|success|warning`; `destructive` tem `role="alert"`, os demais `role="status"`.
- **Badge**: `variant` `default|secondary|outline|success|warning|danger`; aceita `render`.
- **Input/Label**: `aria-invalid` aplica borda e anel de erro; altura 40px.
- **Skeleton**: `motion-safe:animate-pulse`.
- **Sidebar**: `collapsible="icon"`; item ativo por `isActive` em `SidebarMenuButton` (que aceita `render`).
- **shared**: `Logo` (`variant` `full|mark`, `currentColor`), `ThemeToggle`, `EmptyState`, `PageHeader`, `PasswordInput`.
- Montagem do app (feita pelo frontend no layout): `ThemeProvider`, `TooltipProvider` e `Toaster` de `ui/sonner`.

### Estados

Todos os controles principais: hover, `focus-visible` (anel `ring`), disabled (opacidade 50%, sem ponteiro), erro (`aria-invalid`) e loading (`Button.loading`; `Skeleton` para blocos). Estados sem sentido são omitidos explicitamente (por exemplo, `Badge` não tem disabled/loading).

### Etapa 3: componentes novos

Novos em `ui/` (gerados com `shadcn add`, sem `--overwrite`): `select`, `popover`, `calendar`, `table`, `pagination`, `textarea`, `radio-group`, `input-group`. Ajustes de alvo de toque após a geração: `Select` 40px (item `min-h-10`), `InputGroup` 40px, células do calendário 40px (no `DatePicker`). Os arquivos gerados importavam `cn` do pacote npm `cn` (SEC-9); foram trocados por `@/lib/utils` e o pacote removido.

`shared/` (tokens apenas, foco `ring`, estados disabled e erro por `aria-invalid`, pt-BR):

| Componente | Uso | Estados |
|---|---|---|
| `MoneyInput` | valor em texto pt-BR (`value: string`, `onChange(v)`, `allowNegative?`); prefixo "R$" oculto; `inputMode="decimal"`; no blur válido reescreve com `toBRLInput`, inválido mantém o texto | default, foco, disabled, erro |
| `Money` | `{ cents, direction? }`; sinal em texto (`+`, `−`); `text-income`/`text-expense` | n/a (sem interação) |
| `DatePicker` | `{ id, value, onChange, today, min?, max?, disabled? }`; "Hoje"/"Ontem"/`dd/mm/aaaa`; atalhos e calendário em pt-BR por teclado | default, foco, aberto, disabled, erro |
| `SegmentedControl<T>` | radio group; `tone` expense usa `danger-soft` + texto `foreground` | default, hover, foco, marcado, disabled |
| `ResponsiveList<T>` | ≥ `md` tabela com `caption` `sr-only`; < `md` cartões `rounded-xl border bg-card`; versão oculta com `hidden` | vazio/carregando/erro ficam com a tela (`EmptyState`, `Skeleton`) |
| `PaginationNav` | links; até 5 números com `aria-current="page"`; no celular anterior/próxima + "Página X de Y"; nada com 1 página | atual, desabilitado (`aria-disabled`) nas pontas |
| `FiltersPanel` | ≥ `md` linha que quebra + "Limpar filtros"; < `md` botão "Filtros (n)" abre `Sheet` inferior; filhos renderizados uma vez | fechado, aberto |
| `SearchInput` | `type="search"`, lupa, botão "Limpar busca" quando há texto | default, foco, disabled |
| `CategoryIcon` | quadrado `rounded-lg`, `bg-chart-N/15` + `text-chart-N`; ícone da allowlist de 30 nomes (`CATEGORY_ICON_COMPONENTS`) | decorativo (`aria-hidden`) |

**Teclado do `DatePicker`.** Enter/Espaço no botão abre o calendário e o foco vai para o dia selecionado (ou para "hoje" recebido em `today`; o react-day-picker só move o foco entre dias depois que um dia está focado, por isso o `autoFocus` e o `initialFocus`). Setas movem entre dias; PageUp/PageDown, entre meses; Shift+PageUp/PageDown, entre anos; Home/End, início e fim da semana; Enter/Espaço escolhe; Esc fecha e devolve o foco ao botão. "Hoje" e "Ontem" ficam antes do calendário na ordem de Tab. A prova das setas é do E2E (`e2e/date-picker-teclado.spec.ts`): o jsdom não move o foco entre dias. Causa de as setas não funcionarem: o `CalendarDayButton` gerado pelo shadcn guardava um `ref` mas não o ligava ao botão, então o `focus()` do dia seguinte nunca acontecia; `ui/calendar.tsx` agora passa `ref={ref}`.

**Cores em gráficos.** Use sempre `chartColorVar` (`var(--chart-N)` / `var(--chart-income|expense)`, variáveis da `:root`). Não use `var(--color-*)` em `style` ou atributos SVG: em `@theme inline` o Tailwind só emite essas variáveis quando uma classe as usa, e a barra de Despesas saía preta. O E2E `CR-frontend-2` em `e2e/inicio.spec.ts` confere o `fill` computado e o marcador da legenda nos dois temas.

**Padrão de lista responsiva.** Dados tabulares com ação por linha usam `ResponsiveList`: colunas para desktop e `renderCard` para celular. Cada versão oculta usa `hidden`/`md:hidden`, então só uma entra na árvore de acessibilidade. Não há `"use client"`: pode receber funções de Server Components.

**Cores de categoria (ADR-0019).** São `chart-1..6`; o ícone é decorativo e o nome vem sempre ao lado, então a cor nunca carrega a informação sozinha. Medição (linhas "chart-N" na tabela acima): ícone sobre `card` passa 3:1 em todas as seis, nos dois temas. Sobre o próprio fundo suave (`/15`), `chart-1` (2,65) e `chart-3` (2,96) no tema claro ficam abaixo de 3:1; aceito porque o ícone é decorativo (WCAG 1.4.11 não exige) e o tile ainda tem contorno de forma e nome adjacente. Não ajustamos tokens. Não use a cor de categoria como texto.

### Etapa 5: `Switch`, `Progress`, `ProgressMeter`, `SubNav` e status de compromisso

Novos em `ui/` (gerados com `shadcn add switch progress`, sem `--overwrite`): `switch` e `progress`, sobre `@base-ui/react` (nenhuma dependência nova). O gerador importava `cn` do pacote npm `cn` e o adicionava ao `package.json` (mesmo caso do SEC-9); o import foi trocado por `@/lib/utils` e o pacote não entra (CR-design-system-1). Ajustes: `Switch` com área de toque de 40px ou mais (`after:-inset-y-3` amplia o alvo sem mudar o desenho; sempre dentro de `label` ou com `aria-label`); `Progress` com `motion-reduce:transition-none` no indicador.

| Componente | Uso | Estados |
|---|---|---|
| `Switch` (`ui/switch`) | liga/desliga que revela campos (ex.: "Repetir"); `checked`/`onCheckedChange`; `size` `default|sm` (use `default`) | default, hover, foco (`ring`), marcado, disabled (50%), erro (`aria-invalid`); loading não se aplica |
| `ProgressMeter` (`shared/progress-meter`, sem `"use client"`) | `{ value: number \| null, tone: default\|warning\|danger, label, valueText }`. Barra cheia em 100% no máximo (`aria-valuenow` de 0 a 100); `aria-valuetext` recebe o `valueText` real ("112% do limite"). Tons: `bg-primary`, `bg-warning`, `bg-danger` (tokens de estado, não `chart-*`). Quem usa calcula o percentual e o tom (nunca o componente) e mostra o estado também em texto, com `Badge` + ícone | sem interação: sem hover, foco, disabled nem erro; loading é `Skeleton` da tela |
| `SubNav` (`shared/sub-nav`, `"use client"`) | `{ items: { href, label }[], "aria-label" }`; trilho `bg-muted` como o `SegmentedControl`; `aria-current="page"` no ativo, que casa subrotas (`/compromissos/abc` ativa `/compromissos`); rola na horizontal dentro do trilho no celular; alvo `min-h-10` | default, hover, foco, ativo; disabled/erro/loading não se aplicam (é navegação) |

**Status de compromisso** (`Badge` + ícone + texto; a cor nunca vai sozinha): Pendente `secondary`, Vence hoje `warning`, Vencido `danger`, Pago/Recebido `success`, Cancelado `outline`. Para orçamento: "Dentro do limite" (`success`), "Atenção" (`warning`), "Limite estourado" (`danger`), também com ícone, junto de `ProgressMeter`.

Tokens: nenhum novo. Testes: `shared/shared-etapa5.test.tsx`.

### Etapa 6: `Checkbox`, `GoalIcon`, `ValueSourceBadge` e status de meta

`checkbox` gerado com `shadcn add checkbox` (sem `--overwrite`), sobre `@base-ui/react`. O gerador importava `cn` do pacote npm `cn`; o import foi trocado por `@/lib/utils` e o pacote não entra (mesma CR da Etapa 5). `package.json` e `pnpm-lock.yaml` ficaram idênticos. Ajuste: `after:-inset-y-3` leva o alvo a 40px de altura (e `-inset-x-3`, a 40px de largura) sem mudar o desenho.

| Componente | Uso | Estados |
|---|---|---|
| `Checkbox` (`ui/checkbox`) | marcar/desmarcar uma opção; `checked`/`onCheckedChange`; sempre dentro de `label` ou com `aria-label` | default, hover, foco (`ring`), marcado, disabled (50%), erro (`aria-invalid`); loading não se aplica |
| `GoalIcon` (`shared/goal-icon`, sem `"use client"`) | `{ icon, size?: sm\|md\|lg, label? }`. Ícone Lucide da chave da meta num bloco `rounded-lg bg-primary/10 text-primary`. Sem `label` é decorativo (`aria-hidden`); com `label` vira `role="img"`. Chave desconhecida cai em `target` | sem interação: sem hover, foco, disabled, erro nem loading |
| `ValueSourceBadge` (`shared/value-source-badge`, sem `"use client"`) | `{ source: known\|informed\|estimated }` → `Badge` + ícone + texto: Conhecido (`outline`, `DatabaseIcon`), Informado (`secondary`, `PencilIcon`), Estimado (`outline`, `CalculatorIcon`, itálico). Nunca só cor | sem interação |

**Status de meta** (`Badge` + ícone + texto): Ativa `default`, Pausada `secondary`, Concluída `success`, Cancelada `outline`.

Tokens: nenhum novo. Testes: `shared/shared-etapa6.test.tsx`.

## Formulários: `Field` + `Controller` (substitui o `form` do shadcn)

`ui/form.tsx` não existe mais no registry. Use `ui/field.tsx` (`Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldContent`, `FieldTitle`, `FieldSeparator`) com `Controller` do react-hook-form. A ligação de acessibilidade é manual: `data-invalid` no `Field`, `aria-invalid` no controle e `aria-describedby` apontando para os `id` de `FieldDescription`/`FieldError` (ambos aceitam `id` e demais props de elemento). `FieldError` tem `role="alert"`.

```tsx
<Controller
  name="email"
  control={form.control}
  render={({ field, fieldState }) => (
    <Field data-invalid={fieldState.invalid}>
      <FieldLabel htmlFor="email">E-mail</FieldLabel>
      <Input
        {...field}
        id="email"
        type="email"
        aria-invalid={fieldState.invalid}
        aria-describedby={fieldState.invalid ? "email-erro" : "email-ajuda"}
      />
      <FieldDescription id="email-ajuda">Usado para entrar.</FieldDescription>
      {fieldState.invalid && (
        <FieldError id="email-erro" errors={[fieldState.error]} />
      )}
    </Field>
  )}
/>
```

## Gráficos (Etapa 4, ADR-0021)

Recharts 3 (única dependência nova das Etapas 4 e 5), só em `src/components/charts/*.tsx` com `"use client"`. O `chart` do shadcn não é usado (injeta CSS com `dangerouslySetInnerHTML`). Nenhum token novo.

| Componente | Uso |
|---|---|
| `colors.ts` · `ChartColor`, `chartColorVar(c)` | `"chart-3"` -> `"var(--color-chart-3)"`. Única forma de dar cor a um gráfico; nenhum hex em `*.tsx` |
| `ChartCard` | Moldura de todo gráfico: `h2` de título, período visível, `info` ao lado do título, legenda, botão "Ver tabela"/"Ver gráfico" e `EmptyState` quando `isEmpty` (sem botão) |
| `ChartLegend` | Lista com marcador de cor decorativo, nome e valor em texto; quebra no celular |
| `DonutChart` | Rosca com rótulo central, separador `var(--color-card)`, tooltip com `formatBRL` |
| `CashFlowBarChart` | Barras agrupadas Receitas (`chart-income`) e Despesas (`chart-expense`), eixo Y em BRL compacto, legenda em texto |
| `lazy.tsx` · `LazyDonutChart`, `LazyCashFlowBarChart` | **Única** porta de entrada das telas: `next/dynamic` com `ssr: false` e `Skeleton` no carregamento |

Quando usar: série temporal ou composição de valores em BRL em tela de resumo/relatório. Quando não usar: um único número (use `Money`/card de métrica) ou dados sem período definido.

Acessibilidade e comportamento (padrão para todo gráfico):
- Os dados chegam só por props (`Cents` e strings já formatadas), de um Server Component. Sem fetch, `localStorage` ou cache no cliente.
- O contêiner do SVG tem `role="img"` e `aria-label` com o resumo; a informação completa está na tabela. O botão "Ver tabela" tem `aria-expanded` e `aria-controls`, alvo de 40px (`Button` padrão) e foco visível do `Button`. A tabela tem `caption` (somente leitura de tela) e valores em `formatBRL`.
- Nenhuma informação depende só da cor: legenda em texto com nome e valor, e a tabela.
- `prefers-reduced-motion: reduce` desliga as animações (`isAnimationActive={false}`, via `useReducedMotion`).
- Estados: default (gráfico), hover (tooltip), foco (botão da tabela), vazio (`EmptyState`), carregando (`Skeleton` do `lazy.tsx`). Desabilitado e erro não se aplicam ao gráfico: o erro de carga é tratado pelo `error.tsx` da rota.
- Responsivo: altura fixa (224/256px) e largura fluida (`ResponsiveContainer`).

## Responsivo

Breakpoints Tailwind padrão. Mobile é abaixo de `md` (menu "Mais" em `Sheet`); entre `md` e `lg` a sidebar fica recolhida em ícones; a partir de `lg`, expandida.

## Acessibilidade global (Etapa 8, ADR-0032; WCAG 2.2 AA)

Nenhum token, fonte ou cor novos.

- **`SkipLink`** (`shared/skip-link.tsx`, CA-E8-70). `<SkipLink targetId="conteudo" />` renderiza `<a href="#conteudo">Pular para o conteúdo</a>`. Deve ser o primeiro filho do layout; o destino é o `main` com `id="conteudo"` e `tabIndex={-1}` (ligação feita pelo frontend nos layouts `(app)`, `(public)`, `onboarding` e `/offline`). Visual: `sr-only` até `focus-visible`; então `fixed top-2 left-2 z-50`, `bg-background text-foreground`, `min-h-10` (alvo de 40px), `rounded-lg` e anel `ring`. Estados: default oculto; foco visível; hover, disabled, erro e loading não se aplicam (é âncora de navegação). Usar em toda tela com `main`; não usar mais de um por página. Teste: `shared/skip-link.test.tsx`.
- **`scroll-padding`** (`globals.css`, 2.4.11). `html { scroll-padding-top: 4rem }` (cabeçalho `h-16`); abaixo de `md`, `scroll-padding-bottom: calc(3.5rem + 1px + env(safe-area-inset-bottom))` (`BottomNav` `min-h-14` + borda). Se a altura do cabeçalho ou da `BottomNav` mudar, atualize os dois valores.
- **Movimento reduzido** (`globals.css`, CA-E8-28). Em `prefers-reduced-motion: reduce`, regra global zera `animation-*`, `transition-*` e `scroll-behavior` em todos os elementos e pseudo-elementos, o que cobre as entradas e saídas de `tw-animate-css` (`Dialog`, `Sheet`, `Dropdown`, `Popover`, `Sonner`) e `animate-pulse`, sem classe por componente. Exceção: elementos com `.animate-spin` (indicador de carregamento, sempre acompanhado de texto). Observação: `Button.loading` usa `motion-safe:animate-spin`, então com movimento reduzido o ícone do botão já fica parado e o texto "carregando" segue visível; não alterado nesta tarefa.
- **Ícones do app** (CA-E8-72). `public/icons/icon-192.png`, `icon-512.png` (marca a 70% do lado, fundo `primary` cheio), `icon-maskable-512.png` (marca a 58% do lado, dentro do círculo central de 80%; fundo cheio até a borda) e `src/app/apple-icon.png` (180x180, 70%, fundo cheio sem transparência). Procedência: marca do `Logo` (mesmos três `path`, viewBox recortado ao desenho) em `--primary-foreground` (`#1a2e05`) sobre `--primary` (`#84cc16`), tema claro; gerados em 2026-10-28 por rota temporária com `ImageResponse` de `next/og` (Next 16.4.3, `next dev`), sem dependência nova, e a rota foi apagada. Para regenerar, recriar a rota temporária com os mesmos valores. Os hex só existiam nessa rota descartável, não em tela.

## Pendências conhecidas

- `Button` `xs`/`icon-xs`/`icon-sm` do shadcn têm alvo menor que 40px; não use como ação principal.
- `chart-1`/`chart-3` (claro) sobre o próprio fundo `/15` ficam abaixo de 3:1; aceito e justificado (ícone decorativo) em "Medição da Etapa 8".
