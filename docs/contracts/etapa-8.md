# Contrato de execução — Etapa 8 (PWA, acessibilidade e responsividade)

Versão 1.0 (2026-10-28) · Dono: orchestrator/architect · Alteração só por pedido ao orchestrator (§8).
Referências: spec §2.6 (layout mobile, "instalável como PWA se viável sem comprometer segurança"), §9 (acessibilidade, estados), §11 Etapa 8, §12 F, §13, §14 (cache);
`acceptance-criteria.md` (CA-E8-*; cenário F); `design-system.md` (contraste medido, `ResponsiveList`, gráficos, "Responsivo", "Pendências conhecidas");
`threat-model.md` (A1 vazamento entre famílias; AB-80 e AB-117, troca de usuário no mesmo navegador); ADRs 0015, 0016, 0017, 0019, 0021, **0031**, **0032**;
`policies/security.md` (consultada: o service worker toca a fronteira de cache de dados financeiros e de sessão, então a mudança é `structural` e vai a security depois) e
`policies/stack.md`/`dependencies.md`. Documentação do Next 16 em `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`.
**Não há mudança de banco, de RPC, de módulo de domínio nem de matriz de permissões.**

**Dependência:** a Etapa 7 está em produção (2026-10-28). Pendente dela, **sem bloquear** esta etapa: pgTAP (010, 100–560), testes de integração e E2E, que aguardam o
Docker Desktop (`roadmap.md`), além do botão "Agora não" de `/convite/[token]` (CA-E7-61, não entregue). A Etapa 8 não depende desses itens para ser escrita;
só **não pode ser declarada concluída** sem os critérios `E-docker` (§6). O incremento "OAuth Google" (roadmap) segue planejado e **não é tocado**: o contrato apenas
garante que `/auth/**` fica fora do service worker (§3.1), para que o callback do provedor e os links de e-mail nunca passem por ele, e que o botão "Continuar com
Google", quando existir, caia nas mesmas regras de alvo, rótulo e foco desta etapa.

## 0. Regras do contrato

1. Valem as regras do `etapa-3.md` §0 ao `etapa-7.md` §0, em especial a ADR-0015: **nenhum dado de família, de sessão ou de usuário é guardado em cache do navegador**.
2. **O service worker tem lista fechada** (ADR-0031 §3): estáticos públicos com hash, ícones e uma única página, `/offline`. Ampliar a lista é mudança de contrato (§8) e ADR nova.
3. Sem biblioteca de PWA, sem push, sem *background sync*, sem fila de escrita offline, sem botão ou aviso próprio de instalação, sem aviso próprio de "nova versão".
4. Dependências novas: **somente** `@axe-core/playwright` e `axe-core`, `devDependencies`, última estável (`npm view`), no passo A-qa (§1). Nada em produção.
5. Acessibilidade: **WCAG 2.2 AA** é o piso (ADR-0032 §1). A correção de uma falha encontrada não pode mudar contrato público de componente, token, fonte ou paleta
   (regra do Design System EBD/Núcleo: token novo só com autorização do usuário). Se uma correção exigir token novo, a tarefa para e vira CR (§8).
6. Responsividade: larguras suportadas **360, 390, 768 e 1280**; 320 só para reflow (1.4.10). Nenhum redesenho de tela: corrige-se o que quebra, não se redesenha o que funciona.
7. Fora do escopo: dados offline, push/notificação do sistema, sincronização, *share target*, atalhos (`shortcuts`) e capturas no manifest, loja de aplicativos, modo escuro
   próprio do manifest, internacionalização, AAA, mudanças de produto/UX não exigidas por critério (ex.: novo menu, novo fluxo), SEC-4/SEC-10 e CSP completa (Etapa 9),
   estabilizar `e2e/familia.spec.ts:111` (Etapa 9), "Agora não" do convite (pendência da Etapa 7). Não criar rota, componente ou dependência para eles.

## 1. Fases e sequência

| Fase | Quem | O quê | Pode começar quando |
|---|---|---|---|
| A-ds | design-system | `SkipLink`; `globals.css` (`scroll-padding`, regra global de reduced-motion); ícones PNG; correções de componente da auditoria de componentes (CA-E8-73) à medida que o QA reportar; `docs/design-system.md` | agora |
| A-fe | frontend | `src/lib/pwa/**` (constantes, `buildServiceWorkerSource`, testes); `src/app/{manifest.ts,sw.js/route.ts,offline/page.tsx}`; `viewport`; `ServiceWorkerRegister`; cabeçalhos em `next.config.ts`; `matcher` do proxy; ligação do `SkipLink` e do `id="conteudo"` nos layouts | agora (ícones por A-ds para o teste de CA-E8-01) |
| A-qa | qa | `@axe-core/playwright` + `axe-core`; `playwright.publico.config.ts`, `e2e/publico/**`, scripts; helpers de axe/teclado/foco/viewport; specs `@docker`; testes de componente com axe; roda Lighthouse | A-ds e A-fe mínimos (manifest, SW e `/offline` no ar) para a parte PWA; a auditoria de componentes pode começar já |
| B | design-system + frontend | corrigem os achados da auditoria (cada um com teste de regressão) por dono do arquivo; QA reexecuta | A-qa entregar a lista de achados |
| C | orchestrator (+ QA, reviewer, security) | integração (§6); architect atualiza `architecture.md`/`design-system.md` se algo mudou; roadmap | todos de B entregues |

Paralelismo: A-ds, A-fe e A-qa juntas. B é um ciclo achado → correção → reexecução; termina quando a lista de achados `serious`/`critical` está vazia e as demais estão decididas no log.

## 2. Mapa de donos (acréscimos; os mapas anteriores continuam valendo)

| Caminho | Dono |
|---|---|
| `src/lib/pwa/**`, `src/app/manifest.ts`, `src/app/offline/**`, `src/app/sw.js/route.ts`, `src/components/pwa/**`, `next.config.ts`, `src/app/layout.tsx` (`viewport`, `ServiceWorkerRegister`), `src/app/(app)/layout.tsx`, `src/app/(public)/layout.tsx`, `src/app/onboarding/layout.tsx` (skip link e `id`) | frontend |
| `src/proxy.ts` — **somente** a linha do `matcher` que exclui `webmanifest` (exceção ao mapa da Etapa 7; autorizada por este contrato) | frontend |
| `src/components/shared/skip-link.tsx` e teste, `src/app/globals.css` (somente `scroll-padding` e a regra global de reduced-motion), `public/icons/**`, `src/app/apple-icon.png`, `src/components/{ui,shared,charts}/**` (correções de A11y), `docs/design-system.md` | design-system |
| Correções de A11y em `src/modules/*/components/**` e `src/app/**` (telas) | frontend |
| `playwright.config.ts` (`testIgnore`, `serviceWorkers`), `playwright.publico.config.ts`, `e2e/publico/**`, `e2e/{a11y-telas,responsivo-telas,pwa-autenticado}.spec.ts`, `e2e/helpers/{a11y,viewports,rotas}.ts`, `tests/a11y/**`, `package.json`/`pnpm-lock.yaml` (só A-qa: as duas devDependencies e os scripts) | qa |
| `docs/**` (exceto `docs/design-system.md`), `.claude/**` | orchestrator/architect |

## 3. Interfaces

### 3.1 PWA (frontend, com ícones do design-system)

**Manifest** — `src/app/manifest.ts`, `MetadataRoute.Manifest`:

| Campo | Valor |
|---|---|
| `id` · `scope` · `start_url` | `/` · `/` · `/inicio` (sem sessão, o `proxy` redireciona a `/login`; instalar não exige estar logado) |
| `name` · `short_name` · `description` | `Núcleo` · `Núcleo` · a descrição de `metadata` do layout raiz |
| `lang` · `dir` · `display` · `categories` | `pt-BR` · `ltr` · `standalone` · `["finance"]` |
| `orientation` | **ausente** (WCAG 1.3.4) |
| `background_color` · `theme_color` | valores de `--background` e `--primary` do tema claro, copiados de `globals.css`; **teste de igualdade** (CA-E8-02) impede divergência. Hex permitido só neste arquivo e no `viewport` |
| `icons` | `/icons/icon-192.png` (192, `any`), `/icons/icon-512.png` (512, `any`), `/icons/icon-maskable-512.png` (512, `maskable`) |

**Layout raiz** (`src/app/layout.tsx`): `export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: <--background claro> }, { media: "(prefers-color-scheme: dark)", color: <--background escuro> }] }`.
**Sem** `maximumScale` e **sem** `userScalable` (WCAG 1.4.4). `metadata.appleWebApp = { capable: true, title: "Núcleo", statusBarStyle: "default" }`. Limite conhecido: `theme-color` segue a preferência do sistema, não o botão de tema do app; aceito.

**Ícones** (design-system): marca do `Logo` (`src/components/shared/logo.tsx`) em `--primary-foreground` (`#1A2E05`) sobre `--primary` (`#84CC16`), nenhum token novo. `icon-192.png`, `icon-512.png` (marca a ~70% do lado), `icon-maskable-512.png` (marca inteira dentro do círculo central de 80%; fundo cheio até a borda), `src/app/apple-icon.png` 180x180 (fundo cheio, sem cantos transparentes). Método sem dependência nova: rota temporária com `ImageResponse` de `next/og` (já faz parte do Next) que desenha o SVG do `Logo` e é apagada depois; ou qualquer ferramenta local. O arquivo final é binário versionado e a procedência vai em `docs/design-system.md`.

**Service worker** (ADR-0031). Em `src/lib/pwa/`:

| Arquivo · export | Contrato |
|---|---|
| `constants.ts` | `SW_PATH = "/sw.js"`, `OFFLINE_PATH = "/offline"`, `STATIC_CACHE_PREFIX = "nucleo-static-"`, `STATIC_PREFIXES = ["/_next/static/", "/icons/"]`, `STATIC_EXACT = ["/favicon.ico"]`, `BYPASS_PREFIXES = ["/auth/", "/_next/image", "/_next/data", "/sw.js", "/manifest.webmanifest"]` |
| `service-worker.ts` · `buildServiceWorkerSource(version: string): string` | Devolve o texto do worker (ES2020, sem `import`), com a versão embutida (`const VERSION = "<v>"`, cache `nucleo-static-<v>`). Eventos: `install` (`skipWaiting()`; pré-cache de `/offline` com `cache: "reload"` e `credentials: "omit"`; dos `/_next/static/...` encontrados no HTML por `Promise.allSettled`), `activate` (apaga `nucleo-static-*` ≠ atual; `clients.claim()`), `fetch` (regras abaixo) |
| `register.ts` · `registerServiceWorker(): Promise<void>` | Só `NODE_ENV === "production"` e `"serviceWorker" in navigator`; após `load`; `register(SW_PATH, { scope: "/", updateViaCache: "none" })`; `registration.update()` em `visibilitychange` para `visible`, no máximo 1 por hora (marca de tempo em memória); qualquer erro engolido |
| `src/components/pwa/service-worker-register.tsx` · `ServiceWorkerRegister` | `"use client"`, `useEffect` → `registerServiceWorker()`, não renderiza nada. Montado no layout raiz |
| `src/app/sw.js/route.ts` · `GET` | `export const dynamic = "force-static"`; `Response` com `buildServiceWorkerSource(process.env.SW_VERSION ?? "dev")` e `Content-Type: application/javascript; charset=utf-8` |

Regras do evento `fetch`, nesta ordem (cada ramo que não casa **não chama `respondWith`**):
1. `request.method !== "GET"`, URL de outra origem, `request.headers.has("range")`, `next-action`, `rsc`, `searchParams.has("_rsc")`, ou caminho em `BYPASS_PREFIXES` → ignora.
2. Caminho em `STATIC_PREFIXES`/`STATIC_EXACT` → cache-first; no miss, `fetch` e `cache.put` **somente** se `status === 200`, `type === "basic"` e `Cache-Control` sem `no-store`/`private`.
3. `request.mode === "navigate"` → `fetch(request)`; se **lançar** (falha de rede), `caches.match("/offline")` e, se faltar, `Response("Sem conexão", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })`. Resposta com qualquer status passa intacta e **não é guardada**.
4. Qualquer outro caso → ignora.

**`next.config.ts`** (mudança pontual, sem tocar `securityHeaders` nem `noReferrerHeaders`): (a) `const buildId = process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? Date.now().toString(36)` calculado uma vez, usado em `generateBuildId` e em `env: { SW_VERSION: buildId }`; (b) regra `{ source: "/sw.js", headers: [Content-Type, Cache-Control: "no-cache, no-store, must-revalidate", Content-Security-Policy: "default-src 'self'; script-src 'self'; frame-ancestors 'none'"] }` depois da regra `/:path*`.
**`src/proxy.ts`**: `matcher` ganha `webmanifest` na lista de extensões. `PRIVATE_PREFIXES` não muda (`/offline` é pública).

**`/offline`** — `src/app/offline/page.tsx`, estática (`export const dynamic = "force-static"`), `metadata = { title: "Sem conexão", robots: { index: false } }`; **fora** de `(app)` e `(public)` (sem `requireUser`, sem Supabase, sem sessão); `main#conteudo` com `Logo`, `h1` "Você está sem conexão", texto "O Núcleo precisa de internet para mostrar os dados da sua família. Por segurança, nenhum dado financeiro fica guardado neste aparelho. Verifique a conexão e tente de novo." e botão `Button` "Tentar novamente" (cliente: `window.location.reload()`). Só tokens e componentes existentes; `SkipLink` presente.

### 3.2 Acessibilidade (design-system e frontend; QA mede)

**`SkipLink`** (design-system, `src/components/shared/skip-link.tsx`): `<a href="#conteudo">Pular para o conteúdo</a>`, primeiro filho de `body`/layout, `sr-only` até `focus-visible` (então posicionado no topo, `bg-background`, `ring`, alvo ≥ 40px, `z-index` acima do cabeçalho). Frontend: `id="conteudo"` e `tabIndex={-1}` no `main` de `SidebarInset` (`src/components/ui/sidebar.tsx`), de `(public)/layout.tsx`, de `onboarding/layout.tsx` e de `/offline`; mantém **um** `main` por tela (`e2e/landmark-main.spec.ts`).
**`globals.css`** (design-system): `html { scroll-padding-top: <altura do cabeçalho>; scroll-padding-bottom: calc(<altura da BottomNav> + env(safe-area-inset-bottom)); }` por breakpoint, e `@media (prefers-reduced-motion: reduce)` global que zera `animation`/`transition` e `scroll-behavior`, **exceto** o indicador de carregamento (`animate-spin`), que fica porque sempre vem com texto. Sem token novo.

**Checklist WCAG 2.2 AA da auditoria** (cada linha vira teste ou inspeção objetiva; critério de aceite em `acceptance-criteria.md`):

| Critério WCAG | O que verificar neste app | CA |
|---|---|---|
| 1.1.1, 1.3.1, 1.3.5, 2.4.2, 3.1.1 | alternativa textual em imagens e gráficos (`role="img"` + `aria-label` + tabela), estrutura (um `main`, um `h1`, `caption`, `th scope`), `autocomplete`, `title` por rota, `lang` | 29, 30, 31 |
| 1.3.4, 1.4.4, 1.4.10, 1.4.12 | sem trava de orientação nem de zoom; reflow a 320; espaçamento de texto | 03, 32 |
| 1.4.1, 1.4.3, 1.4.11, 1.4.13 | cor nunca sozinha (já regra); contraste texto 4,5 e componentes 3; tooltip/conteúdo em foco dispensável e não único | 27, 29 |
| 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11 | teclado completo sem armadilha, ordem de foco, foco visível e **não obscurecido** por cabeçalho/`BottomNav`/toast (risco real: `BottomNav` fixa) | 24, 25 |
| 2.4.1 | link "Pular para o conteúdo" (**hoje inexistente**) | 20, 70 |
| 2.2.1, 2.3.3 (boa prática), 2.5.1, 2.5.7 | sem limite de tempo exceto a sessão (mensagem da ADR-0017); movimento reduzido; nenhum gesto de arrastar ou de vários dedos obrigatório (gráficos têm tabela) | 28, 29 |
| 2.5.8 | alvo mínimo 24px (e 40px nos principais) | 26 |
| 3.2.6, 3.3.7 | ajuda e dado já informado não pedido de novo | 30 |
| 3.3.1, 3.3.3, 3.3.8 | erro identificado e sugerido; autenticação sem teste cognitivo e com colar/gerenciador de senha | 30 |
| 4.1.2, 4.1.3 | nome/papel/valor de controles; mensagens de status (toast, "Marcar todas como lidas", carregando) em região `status`/`alert` | 21..23, 30 |

**Achados já conhecidos (evidência do repositório), a resolver ou justificar na auditoria:** (a) inexistência de link de pular conteúdo; (b) sem `scroll-padding` com `BottomNav` e cabeçalho fixos (2.4.11); (c) `animate-*` de `tw-animate-css` nos diálogos/menus não obedece `prefers-reduced-motion` por padrão (CA-E1-14 cobre só sidebar/skeleton/spinner); (d) `docs/design-system.md` lista dois pares "Reprovado" (ícone `chart-1`/`chart-3` sobre fundo tingido, claro); (e) `Button` `xs`/`icon-xs`/`icon-sm` abaixo de 40px (Pendências conhecidas); (f) sem `viewportFit: "cover"`, logo `env(safe-area-inset-*)` em `BottomNav`/sheets só vale depois dele, e cabeçalho/laterais não têm inset. São hipóteses a **medir**, não a presumir verdadeiras.

### 3.3 Responsividade (frontend e design-system; QA mede)

Viewports: **360x780**, **390x844**, **768x1024**, **1280x800**; reflow 320x640. Breakpoints Tailwind padrão (`design-system.md` "Responsivo").
Regras: sem rolagem horizontal da página; lista/tabela em cartões abaixo de `md`; campos ≥ 16px abaixo de `md`; modais na área útil (`dvh`); safe areas; sem dependência de hover; caminho de volta dentro da tela (modo instalado). Região de dados com rolagem interna precisa ser focável e nomeada.

**Inventário de rotas** (fonte: `src/app/**/page.tsx` e `route.ts` em 2026-10-28; `e2e/helpers/rotas.ts` do QA é a lista executável e deve falhar o build do teste se aparecer `page.tsx` fora dela):

| Grupo | Rotas |
|---|---|
| Públicas (sem banco) | `/login`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha` (sem sessão redireciona), `/offline`, 404 |
| Públicas (com banco) | `/convite/[token]` |
| Onboarding | `/onboarding` |
| Início e transações | `/inicio`, `/transacoes`, `/transacoes/nova`, `/transacoes/[id]`, `/transacoes/[id]/editar` |
| Contas e categorias | `/contas`, `/contas/nova`, `/contas/[id]/editar`, `/categorias` |
| Compromissos e recorrências | `/compromissos`, `/compromissos/novo`, `/compromissos/[id]`, `/compromissos/[id]/editar`, `/recorrencias`, `/recorrencias/[id]/editar` |
| Orçamentos | `/orcamentos`, `/orcamentos/novo`, `/orcamentos/[id]/editar` |
| Metas e divisão | `/metas`, `/metas/nova`, `/metas/[id]`, `/metas/[id]/editar`, `/divisao`, `/divisao/[transactionId]`, `/divisao/acertos`, `/divisao/acertos/novo` |
| Planejamento e relatórios | `/planejamento`, `/relatorios`, `/relatorios/{categorias,contas,integrantes,orcamentos,metas}` |
| Notificações e família | `/notificacoes`, `/familia`, `/familia/atividade` |
| Configurações | `/configuracoes` |
| Fora da auditoria de tela | `/` (redireciona), `/auth/confirm` (route handler), `/manifest.webmanifest`, `/sw.js` (auditados nos critérios de PWA) |

### 3.4 Verificação (qa)

- **Scripts novos** em `package.json`: `test:e2e:publico` (`playwright test -c playwright.publico.config.ts`) e `lighthouse:publico` (roteiro que chama `pnpm dlx lighthouse` contra as URLs públicas; resultados em `test-results/`, que já é ignorado pelo git).
- **`playwright.publico.config.ts`**: `testDir: "./e2e/publico"`, **sem** `globalSetup`; `webServer` com `pnpm build && pnpm start` e variáveis públicas fictícias que satisfaçam `src/lib/env` (por exemplo `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` e uma chave qualquer): sem cookie, `updateSession` não faz chamada de rede (`getClaims` sem sessão), o que o QA confirma no primeiro passo; se a página consultar o Supabase, o QA registra CR (§8). Projetos `v360`, `v390`, `v768`, `v1280` (Chromium), `use: { serviceWorkers: "block" }`, e `pwa.spec.ts` com `serviceWorkers: "allow"`.
- **`playwright.config.ts`**: `testIgnore: ["**/publico/**"]` e `use.serviceWorkers: "block"`.
- **Helpers**: `e2e/helpers/a11y.ts` (`auditar(page)` com `@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`; falha em `serious`/`critical` e em regras de nome/rótulo/papel/landmark; devolve o restante para o log), `e2e/helpers/viewports.ts`, `e2e/helpers/rotas.ts` (inventário §3.3), `tests/a11y/axe.ts` (axe-core em jsdom sem `color-contrast`).
- **Specs `@docker`** (compilam e listam todas as rotas agora; executam com Docker): `a11y-telas.spec.ts`, `responsivo-telas.spec.ts`, `pwa-autenticado.spec.ts` (CA-E8-09 com sessão e troca de usuário).
- **Sem Docker, hoje**: Vitest (service worker em sandbox, manifest, registro, `SkipLink`, componentes com axe), `pnpm test:e2e:publico`, Lighthouse, `pnpm check`, `pnpm build`, `pnpm outdated`/`audit`, security gate.

## 4. Fluxos (resumo)

- **Instalar:** navegador lê `/manifest.webmanifest` + ícones; o worker ativo e o HTTPS (Render) bastam; instalação nativa do navegador; abre em `/inicio`; sem sessão → `/login`.
- **Navegar online:** o worker não interfere em navegação nem em RSC/ações; só serve estáticos com hash do cache.
- **Cair a rede:** navegação lança → `/offline` (URL original preservada) → "Tentar novamente" recarrega a URL; ação de formulário sem rede segue o tratamento da ADR-0017 (nenhuma escrita offline).
- **Deploy:** `SW_VERSION` muda → bytes de `/sw.js` mudam → o navegador instala o novo worker → `skipWaiting` + `clients.claim` + `activate` apaga o cache antigo; abas abertas seguem funcionando (chunk velho ausente → recarga normal do Next).
- **Logout / troca de usuário:** nada a limpar, pois nenhum dado de usuário está no cache (CA-E8-09 prova).

## 5. Entregas e aceite por agente

### 5.1 frontend
A-fe: itens do §3.1 (menos ícones) e a ligação do skip link; B: correções de tela/módulo apontadas pela auditoria; `loading`/`error` existentes preservados.
Aceite: CA-E8-01..03, 06, 07, 10 (junto com o QA), 11, 13, 20 (ligação), 31; CA-E8-40..47 nas telas.
### 5.2 design-system
A-ds: `SkipLink`, `globals.css`, ícones, `docs/design-system.md` (skip link, reduced-motion global, `scroll-padding`, procedência dos ícones, medição dos pares novos e decisão sobre os "Reprovado"); B: correções em `ui/`/`shared/`/`charts/`.
Aceite: CA-E8-02 (ícones/cores), 20 (componente), 25..28, 70..73.
### 5.3 qa
A-qa: dependências, configs, helpers, specs públicos e `@docker`, testes de componente com axe, Lighthouse, lista de achados no `docs/log-execucao.md` (rota, critério WCAG, severidade, dono, decisão); reexecução em B.
Aceite: CA-E8-04, 05, 08, 09 (público), 12, 21, 23, 24 (público), 60..63; CA-E8-22, 29 (E2E), 41, 43, 47 e 09 (sessão) **escritos e compilando**, aguardando Docker. QA **não** corrige código de produção.

## 6. Integração (Fase C)

Ordem: `pnpm install` → `pnpm check` → `pnpm build` → `pnpm test:e2e:publico` → Lighthouse nas URLs públicas → `pnpm outdated`/`audit` → `node ~/.claude/factory/security/gate.mjs "<projeto>"` → revisão (reviewer + **security**, mudança `structural`: o worker decide o que o navegador guarda; verificar CA-E8-04/05/09, os cabeçalhos de `/sw.js`, que `/auth/**` está fora e que nada de `(app)` entra no cache).
**Etapa 8 "concluída no código" = todos os critérios `U`, `G`, `E-pub`, `L` e de inspeção verdes + gate `PASSA` + revisão.** **"Concluída" definitivamente** = o mesmo + os `E-docker` (CA-E8-09 com sessão, 22, 29, 41, 43, 46, 47 e as variantes `@docker` de 20, 24, 25, 26, 30, 31, 32, 42, 44), no mesmo dia em que o Docker permitir rodar também o pendente das Etapas 6 e 7. Até lá o roadmap mostra a pendência por nome. CA-E8-33 (leitor de tela) sem leitor disponível fica "não verificado" e aparece assim no relatório. O architect atualiza `architecture.md` (§ do PWA e do cache) e marca no roadmap o cenário F da spec §12 como completo só quando CA-E8-40..47 estiverem verdes.

## 7. Bloqueadores e riscos

| Item | Impacto | Mitigação |
|---|---|---|
| Service worker mal configurado vira cache de página autenticada servida a outra família (A1, AB-117) | o pior caso da etapa | lista fechada (ADR-0031 §3); só `GET` mesma origem; navegação nunca guardada; testes CA-E8-04/05/09; revisão `structural` + security |
| Docker Desktop indisponível | `E-docker` não roda; telas autenticadas sem axe real | camada 1 (ADR-0032) cobre públicas e componentes; specs escritos e compilando; pendência nomeada no roadmap |
| jsdom não mede contraste nem layout | contraste só nas públicas e na tabela medida | CA-E8-27 e E-pub; resto na camada 2 |
| `/offline` sem estilo se os ativos não entraram no pré-cache | página feia, mas funcional | `Promise.allSettled`; fonte pode cair em fallback do sistema; CA-E8-08 confere o texto, não a fidelidade |
| Cada deploy troca o worker | pequeno custo de rede | aceito (ADR-0031 §6) |
| `viewport-fit=cover` sem tratar insets | conteúdo sob entalhe em iOS/Android | CA-E8-45 exige `env(safe-area-inset-*)` em cabeçalho, `BottomNav`, sheets e laterais |
| Correção de a11y exige token ou redesenho | mudança de Design System | CR (§8); token só com autorização do usuário |
| `theme-color` não acompanha o botão de tema do app | barra do sistema pode destoar | aceito e documentado (§3.1) |
| `pnpm dlx lighthouse` instala em tempo de execução | resultado varia por versão | registrar a versão no log; critério é "acessibilidade 100", não pontuação absoluta |
| `/convite/[token]` "Agora não" ainda pendente (CA-E7-61) | tela pública auditada sem o botão | auditar como está; se for entregue durante a etapa, repassa os mesmos critérios |
| Spec truncada na §15 | — | segue aberto |

## 8. Pedido de mudança

Formato no handoff: `CR-<agente>-<n>: <arquivo/interface> — <mudança> — <motivo> — <impacto em quem>`.
O orchestrator decide. Se uma interface da §3 muda (especialmente a lista fechada do worker), este documento sobe de versão (1.1) antes da implementação.
