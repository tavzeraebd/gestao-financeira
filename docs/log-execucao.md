# Log de execução — Gestão Financeira

Período: 2026-10-27 e 2026-10-28.

## Feito

- Repositório privado: github.com/tavzeraebd/gestao-financeira.
- Supabase online: projeto `gestao-financeira` (ref `vkvgwroqjccbmbhmeoao`), com migrations das Etapas 1 a 7 aplicadas e lint remoto sem erros.
- Render: serviço `gestao-financeira-web` (https://gestao-financeira-web-ogxx.onrender.com).
  - Build: `pnpm install --frozen-lockfile && pnpm build`.
  - Start: `pnpm start`.
  - `NODE_VERSION` 24.
  - Deploy automático na `main`.
- Gate de segurança da fábrica alterado para ler `pnpm-lock.yaml` (aprovado por você, opção A).
- Dependências atualizadas.
- Exceção do TypeScript 7 em `.depsignore`, válida até 2026-11-27 (o typescript-eslint ainda não suporta TS 7).
- Etapa 6 fechada: docs, `canDelete` de acertos e `divisao.spec`.
- Etapa 7 implementada:
  - banco (4 migrations);
  - servidor;
  - telas de relatórios, notificações, família e atividade.
- Revisão de segurança aprovada com ressalva: SEC-26 (média), SEC-27 e SEC-28 (baixas). Detalhes em `.claude/factory/project-memory/security/achados.md`.

## Verificado

- `tsc`.
- `eslint`.
- 770 testes unitários.
- `pnpm build`.
- Gate de segurança: PASSA.
- Lint do banco remoto.

## Não verificado (sem Docker)

- pgTAP (400 a 560).
- Testes de integração.
- E2E Playwright, incluindo `e2e/relatorios`, `notificacoes`, `atividade`, `divisao` e os 6 de link de e-mail.
- Conferência visual mobile e desktop.

## Pendências para você

1. Supabase Auth, em URL Configuration: definir Site URL e Redirect URLs como `https://gestao-financeira-web-ogxx.onrender.com` e `/**`.
2. Apagar no Render o serviço antigo quebrado `gestao-financeira` (final `-39z4`).
3. Gerar novas chaves `service_role` e `secret` do Supabase. As antigas apareceram na conversa.
4. Conferir a exceção do TypeScript 7 em `.depsignore`.
5. Segurança:
   - SEC-24 e SEC-28 (volume) adiados para a Etapa 9.
   - SEC-26: decidir se exige trilha de acessos negados.
6. `/convite/[token]`, botão "Agora não" (CA-E7-61): não foi feito.
7. Rodar pgTAP, testes de integração e E2E quando houver Docker.

## Achados de acessibilidade/responsividade (Etapa 8)

Fonte: `pnpm test:e2e:publico` (build de produção, porta 3300, sem Docker), 2026-10-28: 310 passaram, 16 falharam (2 achados x 4 viewports). `pnpm lighthouse:publico` (Lighthouse 13.5.0 via `pnpm dlx`): acessibilidade 100 e boas práticas 100 em /login, /cadastro, /recuperar-senha e /offline, móvel e desktop, nenhuma auditoria reprovada (CA-E8-62). axe (WCAG 2.2 AA) em /login, /cadastro, /recuperar-senha, /redefinir-senha, /offline e 404, 4 viewports x 2 temas (48 execuções): 0 violações e 0 "incomplete". Só rotas públicas sem banco; as autenticadas (CA-E8-22, 41, 43, 46, 47) ficam `@docker`, escritas e compilando, não executadas.

| # | Rota | Critério WCAG / CA | Severidade | Dono | Decisão |
|---|---|---|---|---|---|
| A-1 | /login, /cadastro, /recuperar-senha (tema claro; escuro passa) | 2.4.7 e 1.4.11 / CA-E8-25: indicador de foco mede 2,04:1 (mínimo 3:1). Causa localizada: `--ring` a 50% de opacidade, em `outline-ring/50` (base de `globals.css:206`, afeta links sem estilo próprio) e em `focus-visible:ring-ring/50` (ex.: botão "Mostrar senha" em `password-input.tsx`). O padrão `ring-ring/50` aparece em cerca de 25 componentes (`ui/`, `shared/`, `layout/`); onde há `border-ring` de apoio (Input, Button) o teste passa, o resto não foi medido (telas autenticadas). | serious | design-system (`globals.css`, `ui/`, `shared/`); frontend para links em `modules/` | Corrigir sem token novo: usar `--ring` pleno (`ring-ring`, `outline-ring`) no tema claro. Teste de regressão: `teclado.spec.ts` "foco visível e não obscurecido" (hoje vermelho nos 4 viewports) |
| A-2 | 404 (`src/app/not-found.tsx`) | 1.3.1 e 2.4.1 / CA-E8-31 e CA-E8-20: a página não tem `main` (e portanto não tem destino para pular conteúdo); tem 1 h1. axe não reprova (regra `landmark-one-main` é de boas práticas). | moderate | frontend | Corrigir: `main#conteudo` (`tabIndex={-1}`) e `SkipLink`, sem mudar o visual. Teste de regressão: `a11y.spec.ts` "estrutura" na rota 404 (hoje vermelho nos 4 viewports) |
| A-3 | todas as públicas | CA-E8-20 | resolvido | frontend | SkipLink já ligado em (public) e /offline: 4 rotas x 4 viewports passam (primeiro Tab foca o link, visível só com foco, alvo >= 40px, Enter leva a `main#conteudo` com `tabindex="-1"`). `onboarding` e `(app)` não são cobertos sem banco |
| A-4 | públicas | CA-E8-28 | resolvido | design-system | regra global de reduced-motion funciona: sem animação nem transição em /login (menu de tema aberto incluído) e /offline; controle negativo sem a preferência detecta transição |
| A-5 | /login, /cadastro | 2.5.8, CA-E8-26, CA-E8-44, CA-E8-30, CA-E8-32 | sem achado | — | alvos >= 24px (principais >= 40px), campos >= 16px abaixo de md, label + autocomplete corretos, colar permitido, erro com aria-describedby/aria-invalid e foco no primeiro erro, reflow a 320px, zoom de 200% e espaçamento 1.4.12 sem rolagem horizontal nem corte |

Não verificado: CA-E8-33 (leitor de tela), contraste nas telas autenticadas, foco obscurecido por `BottomNav`/cabeçalho (só existe com sessão), todos os `E-docker`. Falsos positivos de contraste do axe na primeira execução vinham do botão de envio animando ao hidratar; `auditar` agora espera a página estabilizar (`estabilizar` em `e2e/helpers/a11y.ts`), sem enfraquecer regra.

### Correções da auditoria CI (run 40656905334, a11y-telas) — design-system

- `scrollable-region-focusable` (/relatorios/categorias|contas|integrantes|orcamentos): `ui/table.tsx` torna o contêiner região focável nomeada quando rolável.
- `color-contrast` (/contas, /categorias, incl. vazio): aba inativa de `ui/tabs.tsx` (`text-foreground/60` = 4,50:1 sobre `muted`) passa a `text-muted-foreground` (7,03:1). Token existente; nenhum token novo foi necessário.
- Alvos < 24px: link da meta em `goals-card` (/inicio), `Switch` (/compromissos/novo), `Checkbox` (/divisao/[id]) e rádio nativo (/familia) agora medem 40px de altura no próprio elemento.
- Não verificado (sem Docker/Playwright): reexecução do E2E; só tsc, eslint e vitest.


## Próximas etapas

_(vazio por ora)_

8.
9.
