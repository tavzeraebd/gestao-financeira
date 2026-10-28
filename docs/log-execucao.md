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


## Etapa 9 · camada de banco (T-01, T-02, T-03) — database, 2026-10-28

Escrito por leitura contra o schema real; **nada executado** (sem Docker) e nada aplicado no Supabase online. M4/T-09 não feito.
Migrations: `20261028100000_etapa9_volume_limits.sql`, `20261028100100_etapa9_security_events.sql`, `20261028100200_etapa9_member_denials.sql`.
pgTAP novos: 600, 610, 620, 630, 640; ajustados: 000 (helper `tests.reset_refresh_gate`), 010 (16 tabelas), 510, 530, 550; 520 e 560 revistos e sem mudança (só sucesso).
Validação prevista: `CI Docker` (`db reset`, `db test`, `db lint`, `db:types`).

### Decisões pendentes / dúvidas

- **M2 (trigger em `auth.users`)**: a migration confere `has_table_privilege(current_user, 'auth.users', 'TRIGGER')` antes de criar qualquer coisa e aborta com mensagem `ETAPA9_M2` (a CLI roda o arquivo em uma transação: nada fica aplicado, login/cadastro intocados). Evidência a favor: `on_auth_user_created` (20261023100100) já está em produção. Se abortar no `db push`, decidir: conceder o privilégio ao papel das migrations ou rever o ADR-0035 (a alternativa "RPC chamada pela Server Action" foi rejeitada por poder ser forjada). Não há fallback silencioso por desenho.
- **Ordem de deploy do M3 (corrige contrato §6)**: o `family/repository.ts` atual ignora o `data` das RPCs. Com M3 aplicada e app antigo, uma negação aparece como sucesso na tela (o banco não muda). O app com repositório tolerante (T-13) deve subir **antes ou junto** de M3; app novo + RPC antiga é seguro.
- Volume não medido: `CREATE INDEX` não concorrente (a CLI usa transação) bloqueia escrita nas 3 tabelas durante a construção; esperado breve pelo porte atual, não medido.
- Falso positivo possível: se o Auth reescrever o hash por reajuste de custo no login, gera evento `password.changed` sem ação do usuário.

### EXPLAIN pendente (CA de M1; exige banco com Docker/CI)

Rodar com `explain (analyze, buffers)` num banco com algumas milhares de linhas e conferir o índice usado:

```sql
-- frequência (3): esperado Index Scan/Only em <tabela>_created_by_created_at_idx
select count(*) from (select 1 from public.transactions t where t.created_by = :uid and t.created_at > now() - interval '1 hour' and t.recurrence_id is null limit 500) s;
select count(*) from (select 1 from public.goal_contributions c where c.created_by = :uid and c.created_at > now() - interval '1 hour' limit 500) s;
select count(*) from (select 1 from public.settlements s2 where s2.created_by = :uid and s2.created_at > now() - interval '1 hour' limit 200) s;
-- volume (existentes): transactions_family_date_idx, goal_contributions_goal_date_idx, settlements_family_date_idx;
-- goal_contributions por família: prefixo de goal_contributions_family_idempotency_key (sem índice parcial dedicado)
```

## Etapa 9 · M4 exclusão de conta (T-09) — database, 2026-10-28

Escrito por leitura contra o schema real; **nada executado** (sem Docker) e nada aplicado no Supabase online.
Migration: `20261028100300_etapa9_account_deletion.sql` (nova; nenhuma antiga alterada). pgTAP novos: `650_account_deletion`, `655_account_deletion_auth`, `660_etapa9_regression`; helpers novos em `000_setup` (seed, hashes, catálogo, `login_amr`). 010 e 600 não precisaram de ajuste (contagens por nome; M4 não cria tabela em `public`).
Validação prevista: `CI Docker` (`db reset`, `db test`, `db lint`).

### Decisões pendentes / dúvidas (M4)

- **Escrita em `auth.*` pelo papel das migrations (DÚVIDA ABERTA)**: `delete_my_account` atualiza `auth.users` e apaga `auth.identities`, `auth.sessions`, `auth.mfa_factors` (e `auth.one_time_tokens`, se existir). Evidência a favor: `on_auth_user_created` e o trigger de M2 já estão em produção; contra: o `postgres` do Supabase hospedado não é dono dessas tabelas e UPDATE/DELETE não foi verificado. Desenho: `private.account_erasure_auth_ready` confere os privilégios ANTES de qualquer escrita e a RPC aborta com `ACCOUNT_ERASURE_UNAVAILABLE` (nada alterado); a parte de `auth.*` é o último passo e qualquer erro dela sobe e desfaz a transação (655 prova). **Verificar na homologação com conta descartável** antes do aceite. **Plano B** (ADR-0038): Admin API `deleteUser` com `service_role` isolada em um módulo, ADR nova e decisão do usuário sobre a credencial.
- **`banned_until`**: usado `9999-12-31 00:00:00+00` em vez de `'infinity'` (driver Go pode não ler o valor especial). Ratificar; o CA-E9-22 diz "infinito".
- **Acréscimo ao ADR-0038 §4**: `invited_email` também é nulado nos convites que o titular ACEITOU (criados por outros). Ratificar.
- **Resíduo fora do escopo do banco**: `auth.audit_log_entries` (GoTrue) pode guardar e-mail/IP; retenção não tratada. Decisão do usuário.
- **Backend**: o código `ACCOUNT_ERASURE_UNAVAILABLE` (P0001) precisa entrar na lista fechada de `errors.ts`/`error-messages.ts`; `FORBIDDEN` (42501) é devolvido numa segunda chamada de conta já excluída.
- **Custo**: exclusão de família grande (teto 100000 lançamentos) não medida; pode bater no `statement_timeout` do papel (falha limpa, sem efeito).

## Etapa 9 · fechamento (2026-10-28)

**No ar (Render + Supabase):** commits 77ff403 (exclusão de conta, rate limit) e e8c758f (CSP com nonce, "Atividade de segurança" em /configuracoes, `member.action_denied` no histórico, testes de CSP e rate limit). `CI` e `CI Docker` verdes nos dois (pgTAP, integração e E2E completo).

**Verificado:** lint, typecheck, 1083 testes unitários, build, `security:check`, gate `PASSA`, E2E públicos de CSP (60/60 com reflow), CSP real servida pela produção em /login.

**Não verificado:** CSP em telas autenticadas com os diálogos/toasts abertos (T-43 `csp-telas.spec.ts` não escrito; o E2E completo passou, o que indica que não há quebra funcional, mas não prova zero violação); 404 global sob CSP; valor real de `TRUSTED_PROXY_HOPS` no Render.

**Decisões tomadas (ratificar):** `style-src-elem 'self' 'unsafe-inline'` (Sonner 2.0.8 não aceita nonce; `script-src` segue estrito) e `z.config({ jitless: true })` no cliente para evitar `eval` do Zod (emenda ao ADR-0037); `bypassCSP` só no bloco "espaçamento de texto" de `e2e/publico/reflow.spec.ts`.

**Revisão de segurança (T-31):** aprovado com ressalva; nenhum alto/crítico. SEC-4, 18, 24, 26 e 28 → corrigidos. Novos: SEC-30 (baixa: sem teto de quantidade em recorrências/contas/categorias/metas/convites) e SEC-31 (média: `TRUSTED_PROXY_HOPS` e `LOG_HMAC_KEY` não conferidos em produção). SEC-10 e SEC-27 seguem abertos (precisam de você).

**Pendente para você:** definir `TRUSTED_PROXY_HOPS` e `LOG_HMAC_KEY` (≥32 caracteres) no Render; conferir ambiente de homologação da exclusão de conta com conta descartável; Supabase Auth: Site URL/Redirect URLs, limites de e-mail (SEC-10); SMTP e Google OAuth; ratificar desvios do M4; demais itens do roadmap (U-1..U-11).

## Próximas etapas

_(vazio por ora)_

8.
9.
