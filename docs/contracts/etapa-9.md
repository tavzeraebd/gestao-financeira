# Contrato de execução — Etapa 9 (hardening e entrega)

Versão 1.0 (2026-10-28) · Dono: orchestrator/architect · Alteração só por pedido ao orchestrator (§8).
Referências: spec §6 (segurança), §6.5, §11 Etapa 9, §13, §14; `acceptance-criteria.md` (CA-E9-*); `threat-model.md` §3.13 (AB-120..131) e §4;
`.claude/factory/project-memory/security/achados.md` (SEC-4, SEC-10, SEC-18 resíduo, SEC-24, SEC-26, SEC-27, SEC-28; SEC-29 já corrigido); `roadmap.md` (Etapa 9);
ADRs 0006, 0014, 0015, 0016, 0017, 0018, 0029, 0030, 0031, **0033**, **0034**, **0035**, **0036**, **0037**, **0038**, **0039**;
`policies/security.md` (consultada: a etapa toca autenticação, dados pessoais, cabeçalhos, trust boundary de IP e exclusão irreversível, então toda a etapa é `structural` e vai a security antes de qualquer "pronto").

**Dependência:** as Etapas 7 e 8 estão em produção (2026-10-28). Pendentes delas, **sem bloquear a escrita** desta etapa: pgTAP (010, 100–560), integração, E2E `@docker` e CA-E8-33 (leitor de tela). A Etapa 9 acrescenta pgTAP 600–660, integração e E2E que também aguardam Docker (Docker Desktop local **ou** o workflow `ci-docker.yml`, ADR-0039). O que roda sem Docker está marcado em cada critério.

**Premissas de operação (migrations):** migration já aplicada em produção **nunca** é editada. Toda mudança de banco desta etapa é migration **nova** (`20261028100000` em diante). Aplicação: `supabase db push --linked` (ver `docs/runbooks/migracoes-producao.md`); validação **sem Docker** por `supabase db lint --linked --level warning` (lint remoto) depois do push, mais `supabase migration list --linked`; validação com Docker por pgTAP e testes de integração, estes últimos com `@docker` no título do `describe` para filtro (`vitest -t @docker`). Tipos: sem Docker, o agente database ajusta `src/types/database.ts` à mão apenas no necessário (tabela e RPCs novas) e a conciliação oficial é `supabase gen types typescript --linked` depois do push (diff vazio é critério).

## 0. Regras do contrato

1. Valem as regras do `etapa-3.md` §0 ao `etapa-8.md` §0, em especial: ADR-0015 (nenhum dado de família em cache), ADR-0031 (lista fechada do service worker, **não muda**), ADR-0016 (sessão só no servidor).
2. **Escopo autônomo** (decidido aqui): (a) SEC-4; (b) SEC-24, SEC-28 e resíduo de SEC-18; (c) SEC-26; (d) CSP completa; (e) rate limit de Server Actions; (f) exclusão de conta (LGPD); (g) CI; (h) backup/recuperação e checklist final. Nenhuma depende de credencial ou decisão do usuário para ser **implementada e testada**.
3. **Fora do escopo desta etapa e dependente do usuário** (somente registrados em §9, sem especificação de implementação): provedor SMTP, OAuth Google, SEC-10 no painel do Supabase, URLs de redirect e Site URL, SEC-27, domínio próprio. Não criar rota, tela, variável nem dependência para eles. Consequência: "convite recebido" por e-mail e preferências de notificação (ADR-0029 §5) **continuam fora**.
4. **Dependências novas: nenhuma** em produção; em desenvolvimento, nenhuma prevista (o gate portátil usa só Node). Se o QA precisar de uma, CR (§8) e `npm view` antes.
5. **Sem serviço externo novo** (Redis, KV, observabilidade, CAPTCHA, coletor de CSP). Se uma tarefa parecer exigir um, para e vira CR.
6. **Sem token, fonte ou cor novos** (Design System EBD/Núcleo). A tela de exclusão e o bloco de segurança usam componentes existentes (`AlertDialog`, `Card`, `Alert`, `Button` destrutivo, `PasswordInput`, `Input`).
7. **Mensagens** em pt-BR com próximo passo; nenhum texto de erro revela se uma conta, um integrante ou outra família existe (AB-02, AB-115).
8. **Proibido logar** e-mail, nome, senha, token, cookie, cabeçalho, URL com token, entrada do usuário (ADR-0035 §1). Os três campos novos (`ip`, `emailHmac`, `inviteId`) são os únicos acréscimos.
9. Ações irreversíveis (§3.5) exigem reautenticação **com prova no banco**; o servidor nunca confia só na tela.

## 1. Fases e sequência

| Fase | Quem | O quê | Pode começar quando |
|---|---|---|---|
| A-db | database | migrations M1, M2, M3 (§3.1) e pgTAP 600, 610, 620, 630, 640; ajuste dos pgTAP 510/520/560 e de `rpc-exposure.test.ts` ao novo retorno de M3; `src/types/database.ts` à mão | agora |
| A-be | backend | `client-ip`, `log-identity`, logger, `rate-limit`, `runAction`, novos `ErrorCode`, `csp.ts` + `proxy`, repositórios tolerantes (§3.2–3.4) | agora |
| A-fe | frontend | spike CSP (layout raiz + `ThemeProvider` + `next.config.ts` do `/offline`), bloco "Atividade de segurança" (depende de M2), `describeAuditEvent` para `member.action_denied` | agora (o bloco de segurança depois de M2) |
| A-qa | qa | `.github/workflows/*`, `scripts/security-checks.ts`, scripts; `e2e/publico/csp.spec.ts` e `rate-limit.spec.ts`; testes unitários que são do QA; esqueletos `@docker` | agora (specs de CSP depois de A-be/A-fe mínimos) |
| B-db | database | M4 (`delete_my_account`, `erase_family`, `account_erasure_log`) e pgTAP 650, 660 | A-db concluída (M2 e M3 aplicáveis) |
| B-be | backend | `deleteAccount`, queries, preview de exclusão, repositórios de M1–M4 | B-db entregue (tipos) |
| B-fe | frontend | `/configuracoes` (Excluir conta, Atividade de segurança), `/login?conta=excluida` | B-be entregue |
| C | orchestrator (+ security, qa, reviewer) | integração (§6), homologação em produção, runbooks verificados, atualização de `architecture.md`, `data-model.md`, `permissions.md` | tudo anterior |

Paralelismo: A-db, A-be, A-fe e A-qa juntas. B espera A-db (M2/M3 precisam existir para a exclusão). C é sequencial.

## 2. Mapa de donos (acréscimos; os mapas anteriores continuam valendo)

| Caminho | Dono |
|---|---|
| `supabase/migrations/20261028*_etapa9_*.sql`, `supabase/tests/database/6[0-9]0_*.test.sql`, ajuste dos pgTAP `510`, `520`, `560`, `src/types/database.ts` | database |
| `src/server/{rate-limit,log-identity,client-ip,action,logger,errors,error-messages}.ts` e testes, `src/lib/{client-ip,csp}.ts` e testes, `src/lib/env/server.ts`, `src/proxy.ts`, `src/lib/supabase/proxy.ts`, `src/modules/auth/**` exceto `components/`, `src/modules/profile/{actions,queries,repository,schemas}.ts` (exclusão e eventos), `src/modules/family/repository.ts`, `tests/integration/{volume-limits,member-denials,account-deletion,security-events}.test.ts` | backend |
| `src/app/layout.tsx` (nonce), `src/components/theme/theme-provider.tsx`, `next.config.ts` (regra de `/offline`), `src/app/(app)/configuracoes/**`, `src/modules/profile/components/**`, `src/app/(public)/login/**` (aviso), `src/modules/activity/domain/describe.ts` (+ teste) | frontend |
| `.github/**`, `scripts/security-checks.ts`, `package.json` (**só** scripts `security:check`), `e2e/publico/{csp,rate-limit}.spec.ts`, `e2e/{csp-telas,conta-excluida}.spec.ts`, `tests/ci/**` | qa |
| `docs/**` (exceto `docs/design-system.md`), `docs/runbooks/**`, `.claude/**` | orchestrator/architect |

Exceções autorizadas por este contrato: `src/proxy.ts` e `src/lib/supabase/proxy.ts` (CSP, `x-client-ip`) passam ao **backend** (o `matcher` ganha `offline`); `src/app/layout.tsx` e `next.config.ts` são **frontend**, restritos ao descrito.

## 3. Interfaces

### 3.1 Banco (database) — migrations novas

Convenções do `data-model.md` §1 (`security definer` com `search_path = ''`, `revoke ... from public, anon`, `grant execute` só a `authenticated`, `-- DOWN (manual)` e efeito em dados existentes no cabeçalho). Nenhuma migration apaga ou reescreve dado existente, exceto M3 (troca assinatura de função) e M4 (função nova que só age quando chamada).

**M1 `20261028100000_etapa9_volume_limits.sql`** (ADR-0033)
- `private.volume_limits (kind text primary key, max_active integer not null, max_per_hour integer not null)`, sem grant a `anon`/`authenticated`; seed: `transactions` (100000/500), `goal_contributions_goal` (10000/0), `goal_contributions_family` (50000/500), `settlements` (20000/200), `notifications_user` (500/0). `max_per_hour = 0` = sem teste de frequência para aquele `kind`.
- `private.enforce_volume_limit(p_kind text, p_family_id uuid, p_scope_id uuid, p_created_by uuid, p_count_rate boolean)`: `security definer`; retorna sem erro se `auth.uid()` for nulo **ou** `private.is_family_member(p_family_id)` for falso (sem oráculo entre famílias); (a) volume ativo por contagem limitada → `VOLUME_LIMIT_REACHED`; (b) frequência por `created_by` na última hora, **contando excluídas** → `RATE_LIMITED`; ambos `P0001`.
- Triggers `before insert` novos (nome ordena depois dos existentes só se isso não importar; a função é idempotente e barata): `transactions_volume_bi`, `goal_contributions_volume_bi` (por meta **e** por família), `settlements_volume_bi`. Em `transactions`, `p_count_rate = (new.recurrence_id is null)`.
- Índices `(created_by, created_at)` em `transactions` (parcial `where recurrence_id is null`), `goal_contributions` e `settlements`; o agente anexa o `EXPLAIN` das três consultas ao `docs/log-execucao.md`.
- `private.notification_refresh_state (user_id uuid primary key references public.profiles (id) on delete cascade, last_run_at timestamptz not null)`.
- `refresh_notifications()` recriada com `create or replace` (mesma assinatura, **sem parâmetros**, retorno `integer`): (a) gate atômico de 30 s por `insert ... on conflict (user_id) do update set last_run_at = now() where state.last_run_at <= now() - interval '30 seconds' returning 1` que, sem linha, **pula só a geração**; (b) a limpeza (compromisso resolvido; mais de 90 dias) roda sempre; (c) teto de 500 por usuário: inserções limitadas a `greatest(0, 500 - existentes)` depois da limpeza; (d) o teto de 100 por chamada continua. O corpo é copiado da migration `20261024102000` e só recebe essas três mudanças (diff revisado).
- **Cobertura de teste (pgTAP `600_etapa9_privileges`, `610_volume_limits`, `620_notification_limits`)**: valores baixados em `volume_limits` dentro da transação (3, 2...) para provar cada teto sem inserir 100 mil linhas.

**M2 `20261028100100_etapa9_security_events.sql`** (ADR-0035)
- `public.security_events (id uuid pk, user_id uuid not null references public.profiles (id) on delete restrict, action text not null check (action in ('password.changed')), metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 1024), created_at timestamptz not null default now())`; índice `(user_id, created_at desc)`; RLS ligada; `revoke all from anon, authenticated`; `grant select to authenticated`; policy `security_events_select_own` (`user_id = (select auth.uid())`). Sem policy nem grant de escrita.
- `private.log_password_changed()` `security definer` + trigger `on_auth_user_password_changed` `after update of encrypted_password on auth.users for each row when (new.encrypted_password is not null and old.encrypted_password is distinct from new.encrypted_password)`. Se o usuário não tiver `profiles` (inconsistência), não falha a troca de senha (`insert ... select ... where exists`).
- pgTAP `630_security_events`.

**M3 `20261028100200_etapa9_member_denials.sql`** (ADR-0036)
- `drop function` + `create function` de `change_member_role(uuid, text)`, `transfer_ownership(uuid)` e `remove_family_member(uuid)` com `returns text` (`null` = feito; `'FORBIDDEN' | 'CANNOT_TARGET_SELF' | 'NOT_FOUND'` = negado e **registrado**). Corpo = o da migration `20261024101800` dentro de um bloco interno; o tratador `exception when sqlstate '42501' or sqlstate 'P0001'` reconhece os três códigos, grava `member.action_denied` (`entity_type 'family_member'`; `metadata {operation, reason}`) via `private.log_audit` e retorna o código; relança o resto. Teto de 20 eventos de negação por ator/hora. Chamador sem família ativa: retorna `'FORBIDDEN'` sem gravar. Mesmos `revoke`/`grant` de antes.
- `leave_family()` e `refresh_notifications()` **não** mudam aqui.
- pgTAP `640_member_denials` e ajuste dos `510`, `520`, `560` (as três negações passam a ser afirmadas pelo valor devolvido; sucesso, concorrência e demais erros inalterados).

**M4 `20261028100300_etapa9_account_deletion.sql`** (ADR-0038), só em B-db
- `private.account_erasure_log (id uuid pk default gen_random_uuid(), user_id uuid not null, erased_at timestamptz not null default now(), role text, family_erased boolean not null)`; sem grant.
- `private.require_recent_auth(p_max_age interval) returns void` (`P0001` `REAUTH_REQUIRED`): lê `auth.jwt() -> 'amr'` e exige `method = 'password'` com `timestamp` dentro do prazo. Reutilizável (SEC-27, se o usuário decidir).
- `private.erase_family(p_family_id uuid) returns void` (`security definer`, só chamável por `delete_my_account`): apaga na ordem das FKs; o agente produz o mapa e o registra no cabeçalho da migration.
- `public.delete_my_account() returns jsonb` (`{ "family_erased": boolean }`): `NOT_AUTHENTICATED` → `require_recent_auth('5 minutes')` → trava o vínculo ativo (`for update`) → regra do último owner (`OWNER_MUST_TRANSFER` se há outros ativos) → saída (efeitos de `leave_family`, `member.left` com `"reason":"account_deleted"`) **ou** `erase_family` → anonimização de `profiles` (`display_name = 'Conta excluída'`, `avatar_url = null`), apaga `notifications` e `security_events` do usuário, `invited_email = null` nos convites criados por ele → neutraliza `auth.users` (e-mail inerte único derivado do id, `encrypted_password = null`, metadados vazios, `banned_until = 'infinity'`, `deleted_at = now()`) e apaga `auth.identities`, `auth.sessions`, `auth.mfa_factors` do usuário → grava `account_erasure_log`. Tudo numa transação. Qualquer outra falha aborta sem efeito parcial.
- pgTAP `650_account_deletion` e `660_etapa9_regression` (R1..R20 inalterados depois de saída e de exclusão; completude do mapa de `erase_family` por `pg_constraint`; privilégios).

### 3.2 Backend — observabilidade e rate limit (ADR-0034, ADR-0035)

| Arquivo · export | Contrato |
|---|---|
| `src/lib/client-ip.ts` · `resolveClientIp(forwardedFor: string \| null, hops: number): string \| null` | Divide `x-forwarded-for` por vírgula, usa a entrada `length - hops` (hops ≥ 1; `0` = desativado → `null`), valida IPv4/IPv6; qualquer falha → `null`. Nunca lê a entrada mais à esquerda (controlada pelo cliente) |
| `src/lib/env/server.ts` | `TRUSTED_PROXY_HOPS` (inteiro 0..5, padrão **1**), `LOG_HMAC_KEY` (≥ 32 caracteres; opcional), leitura preguiçosa como as demais |
| `src/proxy.ts` / `src/lib/supabase/proxy.ts` | calcula o IP, **remove** `x-client-ip` vindo do cliente e o define (se houver); aplica a CSP (§3.3); `forward()` repete `x-client-ip`, `x-nonce` e `Content-Security-Policy` de requisição em toda recriação do response; `matcher` passa a excluir `offline` |
| `src/server/client-ip.ts` · `getClientIp(): Promise<string \| null>` | lê `x-client-ip` de `headers()`; fora de requisição, `null` |
| `src/server/log-identity.ts` · `emailHmac(email: string): string \| undefined` | normaliza (trim + minúsculas), `HMAC-SHA256(LOG_HMAC_KEY)`, 16 primeiros hex; sem chave → `undefined` e um `warn` único; **nunca** hash sem chave |
| `src/server/logger.ts` | `LogFields` ganha `ip?`, `emailHmac?`, `inviteId?`; `sanitize` valida cada um por padrão estrito e descarta o que não casar |
| `src/server/rate-limit.ts` | `RATE_LIMIT_BUCKETS` (ADR-0034 §2), `hitRateLimit(bucket, key, now?)`, `isRateLimited(bucket, key, now?)`, `resetRateLimits()` (testes), teto de 50000 chaves |
| `src/server/action.ts` · `runAction` | novas opções: `rateLimit?: false`, `identity?: (input) => { email?: string; inviteId?: string }`. Aplica `user_actions`/`anon_actions`; em `fail()` de `warn`/`error` inclui `ip` e, se `identity` devolveu e-mail, `emailHmac`, e `inviteId`. `RATE_LIMITED` sem chamar o handler |
| `src/modules/auth/actions.ts` | `signIn`: `isRateLimited(auth_failure)` antes, `hit(auth_ip)` sempre, `hit(auth_failure)` quando `INVALID_CREDENTIALS`; `signUp`, `requestPasswordReset`, `resendConfirmation`: `hit(auth_email_ip)` e `hit(auth_email_target)` antes do Auth; estourou → **sucesso neutro sem chamar o Auth** + `warn` `RATE_LIMITED`. `updatePassword` não muda (a trilha é o trigger de M2) |
| `ErrorCode` e `error-messages.ts` | `VOLUME_LIMIT_REACHED` ("Sua família atingiu o limite de registros desta lista. Exclua registros que não usa mais."), `REAUTH_REQUIRED` ("Confirme sua senha para continuar."). `errors.ts` já mapeia `P0001` pelo texto, então a lista fechada ganha os dois |
| `src/modules/family/repository.ts` | as três RPCs de integrantes passam a ler o retorno: `string` → `throw new AppError(<código>)`; `null`/`undefined` → ok. Actions e mensagens não mudam (CA-E7-36) |

Comportamento de chave: IP `null` → baldes por IP ignorados (ADR-0034 §6); chave do e-mail do rate limit é `sha256` em memória, nunca a do log.

### 3.3 CSP (backend: `csp.ts`/proxy; frontend: layout, tema, `next.config.ts`) — ADR-0037

| Arquivo · export | Contrato |
|---|---|
| `src/lib/csp.ts` · `buildCsp({ nonce: string; isDev: boolean }): string` | diretivas exatas do ADR-0037 §1; sem `'unsafe-inline'`/`'unsafe-eval'` em `script-src` de produção; testes por diretiva |
| `src/proxy.ts` | gera o nonce (`base64(randomUUID())`), define `Content-Security-Policy` e `x-nonce` na **requisição** repassada e `Content-Security-Policy` na **resposta** (inclusive nos redirects, que já copiam os cabeçalhos) |
| `src/app/layout.tsx` | torna-se `async`, lê `x-nonce` (`headers()`) e passa `nonce` ao `ThemeProvider` |
| `src/components/theme/theme-provider.tsx` | repassa `nonce` ao `NextThemesProvider` |
| `next.config.ts` | regra `{ source: "/offline", headers: [CSP do ADR-0037 §4] }` **depois** da global; a global mantém `frame-ancestors 'none'`; `/sw.js` mantém a sua. Nada mais muda nos cabeçalhos |
| `src/app/offline/page.tsx` | **não muda** (continua `force-static`) |

Spike obrigatório antes do resto (primeira tarefa do frontend em A-fe): em `pnpm build`, conferir se (i) o layout dinâmico mantém as rotas públicas e o 404 sem erro de prerender; (ii) o `_not-found` recebe nonce; (iii) o `/offline` segue estático e funcional sob o proxy excluído. Resultados no `docs/log-execucao.md` e, se (ii) falhar, a degradação do ADR-0037 §5 é registrada com a evidência.

### 3.4 Exclusão de conta e eventos na UI (backend e frontend) — ADR-0038, ADR-0035

| Arquivo · export | Contrato |
|---|---|
| `src/modules/profile/schemas.ts` · `deleteAccountSchema` | `{ password: string (1..72), confirmation: "EXCLUIR" }` |
| `src/modules/profile/actions.ts` · `deleteAccount(input): Promise<ActionResult<never>>` | `runAction` `auth: "required"`, bucket `account_deletion`. (1) `signInWithPassword` do e-mail do próprio usuário com a senha informada (`INVALID_CREDENTIALS` se falhar; nunca loga a senha); (2) RPC `delete_my_account`; (3) `signOut` tolerante e limpeza dos cookies; (4) `redirect("/login?conta=excluida")`. `OWNER_MUST_TRANSFER` e `REAUTH_REQUIRED` voltam ao formulário como erro geral. Log `module: "account"`, `operation: "deleteAccount"` com `userId` e sem `familyId` após a exclusão |
| `src/modules/profile/queries.ts` · `getAccountDeletionPreview(): Promise<{ role: "owner" \| "admin" \| "member" \| null; otherActiveMembers: number; willEraseFamily: boolean; canDelete: boolean; hasPassword: boolean }>` | `canDelete = false` para owner com outros ativos ou sem identidade de senha; textos da tela derivam só desses campos |
| `src/modules/profile/queries.ts` · `listSecurityEvents(): Promise<{ id: string; action: "password.changed"; createdAt: string }[]>` | 10 últimos do próprio usuário (RLS) |
| `/configuracoes` | Seção "Atividade de segurança" (lista com data e hora, estado vazio "Nenhum evento registrado"). Seção "Excluir conta" em `Card` com `Alert` destrutivo: o que será apagado e o que será mantido conforme o preview ("Seus lançamentos continuam com a família" / "Como você é o único integrante, a família e todos os dados dela serão apagados"); botão "Excluir minha conta" abre `AlertDialog` com `PasswordInput`, campo "Digite EXCLUIR para confirmar" e ação destrutiva com `loading`; owner com outros: botão desabilitado + texto "Transfira a propriedade antes" com link para `/familia`; sem identidade de senha: texto explicativo, sem formulário |
| `/login?conta=excluida` | `Alert` informativo "Sua conta foi excluída." (valor lido por Zod enum; qualquer outro valor é ignorado) |
| `describeAuditEvent` | `member.action_denied` → título "Ação negada", detalhe pela `operation` (lista fechada: "Tentativa de alterar papel", "Tentativa de transferir propriedade", "Tentativa de remover integrante"); metadata crua nunca é exibida |

### 3.5 CI e gate portátil (qa) — ADR-0039

- `.github/workflows/ci.yml` e `.github/workflows/ci-docker.yml` conforme ADR-0039 §1–2; ações fixadas por SHA completo (o QA resolve os SHAs com `gh api` e comenta a versão ao lado); `permissions: contents: read`; `timeout-minutes`; `concurrency`; sem `pull_request_target`.
- `scripts/security-checks.ts` com as verificações do ADR-0039 §3; saída: lista de violações com arquivo e linha, código de saída 1 se houver; `package.json` ganha **só** `"security:check": "node scripts/security-checks.ts"`.
- `tests/ci/security-checks.test.ts` (Vitest): cada verificação reprova um exemplo ruim em memória e aprova o repositório atual.
- `README.md`: seção "CI" (o que cada job faz, como ligar `ci-docker.yml`, que migrations não rodam no CI).

### 3.6 Runbooks (architect, já entregues com este contrato)

`docs/runbooks/backup-recuperacao.md`, `docs/runbooks/migracoes-producao.md`, `docs/runbooks/checklist-entrega.md`. Os agentes **não** os reescrevem; registram evidência nos campos "Registro" e abrem CR para mudar procedimento.

## 4. Fluxos (resumo)

- **Login com falhas:** `signIn` → `auth_ip`/`auth_failure` → Auth; falha → `warn` com `code: INVALID_CREDENTIALS`, `ip`, `emailHmac` → 6ª falha do par IP+e-mail em 15 min → `RATE_LIMITED` sem chamar o Auth.
- **Troca de senha:** `updatePassword` (ou recuperação) → Auth grava `encrypted_password` → trigger M2 → `security_events` → aparece em `/configuracoes`.
- **Escrita em volume:** cliente (Server Action **ou** API direta) → trigger M1 → `VOLUME_LIMIT_REACHED`/`RATE_LIMITED` → `errors.ts` → mensagem.
- **Integrante negado:** UI (ou API direta) → RPC M3 → bloco interno falha → `member.action_denied` gravado → retorno `'FORBIDDEN'` → repositório lança `AppError('FORBIDDEN')` → mensagem de sempre → owner/admin veem em `/familia/atividade`.
- **Página com CSP:** requisição → proxy gera nonce e CSP → Next injeta nonce em scripts/estilos próprios → `ThemeProvider` recebe o mesmo nonce → navegador executa só o que tem nonce. `/offline` e `/sw.js` seguem seus caminhos próprios.
- **Excluir conta:** formulário (senha + `EXCLUIR`) → `signInWithPassword` (sessão nova, `amr` fresco) → `delete_my_account` → anonimiza/apaga conforme papel → `signOut` → `/login?conta=excluida`.

## 5. Entregas, ordem e dependências por agente

Formato: `T-<n> · agente · tarefa · depende de · aceite`. Fase A pode paralelizar tudo sem dependência.

### 5.1 database
- **T-01** · A-db · M1 (volume + `refresh_notifications` + índices + `EXPLAIN`) + pgTAP 600/610/620 · — · CA-E9-01..08.
- **T-02** · A-db · M2 (`security_events` + trigger) + pgTAP 630 · — · CA-E9-09..11.
- **T-03** · A-db · M3 (três RPCs com trilha) + pgTAP 640 + ajuste de 510/520/560 e `rpc-exposure.test.ts` · — · CA-E9-12..16.
- **T-04** · A-db · `src/types/database.ts` à mão (`security_events`, retorno `text` das três RPCs, `delete_my_account`) · T-01..T-03, T-09 · `pnpm typecheck` verde.
- **T-09** · B-db · M4 + pgTAP 650/660 (inclui completude por `pg_constraint`) · T-02, T-03 · CA-E9-17..24.
- **T-05** · A-db · `pnpm db:lint` (ou lint remoto depois do push) sem aviso; migrations em ordem; nenhuma antiga alterada (`git diff` só adiciona arquivos) · T-01..T-03, T-09.

### 5.2 backend
- **T-10** · A-be · `client-ip` (lib + server), env, `log-identity`, logger, testes · — · CA-E9-30..33.
- **T-11** · A-be · `rate-limit.ts` + `runAction` (`rateLimit`, `identity`, `ip`/`emailHmac` no `fail`) + `auth/actions.ts` + `ErrorCode`/mensagens + testes · T-10 · CA-E9-34..38.
- **T-12** · A-be · `csp.ts` + `proxy.ts`/`supabase/proxy.ts` (nonce, `x-client-ip`, `matcher`) + testes · T-10; sincronizado com T-20 (spike) · CA-E9-50..52, 56.
- **T-13** · A-be · `family/repository.ts` tolerante (string/null) + testes unitários · — (funciona com RPC antiga e nova) · CA-E9-16, 39.
- **T-14** · B-be · `profile`: `deleteAccountSchema`, `deleteAccount`, `getAccountDeletionPreview`, `listSecurityEvents`, repositório; testes unitários e de integração (`@docker`) · T-09, T-04, T-11 · CA-E9-40..45.

### 5.3 frontend
- **T-20** · A-fe · **spike CSP/nonce** (§3.3) + layout raiz + `ThemeProvider` + regra de `/offline` em `next.config.ts` · T-12 (em par) · CA-E9-50..55.
- **T-21** · A-fe · `describeAuditEvent` para `member.action_denied` + teste do catálogo · — · CA-E9-16.
- **T-22** · B-fe · `/configuracoes`: "Atividade de segurança" e "Excluir conta"; aviso em `/login` · T-14 · CA-E9-46..48.
- **T-23** · B-fe · E2E `conta-excluida` (`@docker`: member, admin, owner com outros, owner sozinho) escrito e compilando · T-22 (QA executa) · CA-E9-24, 47.

### 5.4 security
- **T-30** · A · Revisar ADR-0033..0038 e este contrato antes de B (consulta a `policies/security.md`); decidir `style-src-elem` com a medição de T-20 · — · parecer no log.
- **T-31** · C · Revisão `structural` do conjunto: M1–M4 (definer, `search_path`, oráculos, `auth.users`), CSP no navegador, topologia de IP em produção (valor de `TRUSTED_PROXY_HOPS` conferido com requisição real), rate limit (chave de IP nula não trava), exclusão (AB-128), CI (permissões/SHAs); atualizar `achados.md` (SEC-4, SEC-18, SEC-24, SEC-26, SEC-28 → `corrigido`; SEC-10 e SEC-27 permanecem `aberto` até o usuário) · todos · gate `PASSA`.

### 5.5 qa
- **T-40** · A-qa · `scripts/security-checks.ts` + `tests/ci/**` + script `security:check` · — · CA-E9-60, 61.
- **T-41** · A-qa · `ci.yml` e `ci-docker.yml` (SHAs por `gh api`) validados por `security:check`; seção CI do README · T-40 · CA-E9-62..65.
- **T-42** · A-qa · `e2e/publico/csp.spec.ts` (nonce igual em todo `<script>`, zero `securitypolicyviolation`, hidratação, tema, `/offline` e SW sob CSP) e `rate-limit.spec.ts` (31ª tentativa de login → `RATE_LIMITED`, com `x-forwarded-for` por teste) · T-12, T-20, T-11 · CA-E9-51..55, 35.
- **T-43** · A-qa · `e2e/csp-telas.spec.ts` (`@docker`: inventário de rotas do `etapa-8.md` §3.3 sem violação de CSP, com diálogos, menus, gráficos e toasts abertos) · T-20 · CA-E9-55.
- **T-44** · B-qa · executar `pnpm check`, `pnpm build`, `pnpm test:e2e:publico`, `pnpm outdated`/`audit`, `security:check`; `ci-docker.yml` quando houver Docker; reportar o que ficou não verificado · todos · §6.

### 5.6 orchestrator/architect (C)
- **T-50** · integração (§6); homologação com os runbooks; atualizar `architecture.md` §10 (CSP, IP, rate limit), `data-model.md` (§4.6 catálogo: `member.action_denied`; tabelas novas), `permissions.md` (linha "Excluir a própria conta"), `README.md` (variáveis `TRUSTED_PROXY_HOPS`, `LOG_HMAC_KEY`); marcar o roadmap · todos.

## 6. Integração (Fase C)

Ordem sem Docker: `pnpm install` → `pnpm check` → `pnpm security:check` → `pnpm build` → `pnpm test:e2e:publico` → Lighthouse nas públicas (CSP não pode regredir acessibilidade 100) → `pnpm outdated`/`audit` → `node ~/.claude/factory/security/gate.mjs "<projeto>"` → revisão (reviewer + **security**, `structural`).
Ordem com Docker (local ou `ci-docker.yml`): `pnpm db:reset` → `pnpm db:test` (010, 100–660) → `pnpm db:lint` → `pnpm db:types` sem diff → `pnpm test:integration` → `pnpm test:e2e` (inclui `csp-telas`, `conta-excluida` e o atraso das Etapas 6–8).
Produção (usuário ou agente autorizado, runbook): `supabase db push --linked --dry-run` → `supabase db push --linked` → `supabase db lint --linked --level warning` → `supabase migration list --linked` → deploy do app (Render) → conferência pós-deploy do `checklist-entrega.md` (CSP no navegador real, IP no log, conta descartável criada e excluída, ensaio de restauração).
**Ordem entre banco e app:** M1, M2 e M4 são aditivas e o app antigo as ignora; M3 troca o retorno das três RPCs, e o repositório novo tolera retorno antigo e novo, então não importa quem sobe primeiro; a tela de exclusão só aparece com o app novo e exige M4 aplicada, então M4 sobe **antes** do app.
**Etapa 9 "concluída no código"** = critérios `U`, `G`, `E-pub`, `L` e de inspeção verdes + gate `PASSA` + revisão. **"Concluída" definitivamente** = o mesmo + critérios `DB`, `I` e `E-docker` executados (pgTAP 600–660 e o atraso 010/100–560, integração, E2E) + homologação em produção do `checklist-entrega.md` + ensaio de restauração registrado. Itens de §9 **não** bloqueiam "concluída no código", mas aparecem por nome no roadmap e impedem declarar o projeto "entregue".

## 7. Bloqueadores e riscos

| Item | Impacto | Mitigação |
|---|---|---|
| CSP quebra hidratação ou o service worker em produção | app inteiro sem interatividade | spike primeiro (T-20); E-pub com hidratação, tema e SW sob CSP; `worker-src 'self'` explícito; `@docker` cobre autenticadas; rollback = reverter o commit (CSP não persiste estado) |
| Rotas autenticadas com `<style>` injetado sem nonce (Sonner/Base UI) | violação silenciosa | `style-src-elem` decidido por medição (ADR-0037 §3); nunca afrouxar `script-src` |
| `x-forwarded-for` com topologia diferente da suposta | rate limit e log com IP errado; todos sob um IP | `null` ignora baldes por IP (não trava ninguém); conferência em produção com requisição real; `TRUSTED_PROXY_HOPS` ajustável sem deploy de código |
| Rate limit em memória com mais de uma instância | limite N vezes mais frouxo | premissa "uma instância" no checklist; decisão pendente registrada no ADR-0034 §7 |
| `delete_my_account` sem poder gravar em `auth.users` no hospedado | exclusão parcial ou impossível | teste com conta descartável na homologação; a RPC é transacional (nada parcial); Plano B no ADR-0038 (decisão do usuário sobre credencial) |
| Exclusão apaga família de um integrante só (irreversível) | perda de dados por engano | reautenticação com prova no banco, `EXCLUIR`, preview, limite 3/h; carência é alternativa a ratificar (§9) |
| Mapa de `erase_family` incompleto | linha órfã ou falha de FK | teste de completude por `pg_constraint` reprova tabela nova sem entrada |
| M3 troca o retorno de RPC de integrantes | pgTAP 510/520/560 desatualizados | ajuste na mesma tarefa; repositório tolera os dois retornos |
| Notificação demora até 30 s para refletir dado novo | E2E flaky | E2E criam o dado antes do primeiro carregamento autenticado (ADR-0033) |
| `ci.yml` nunca executado antes do push | primeira execução pode falhar por ambiente | validação estática por `security:check`; correção no primeiro push; `ci-docker.yml` desligado por padrão |
| Atraso de pgTAP/integração/E2E (Etapas 6–8) acumulado | defeitos antigos aparecem juntos | um ciclo único de quitação em `ci-docker.yml` ou Docker local, antes de declarar "definitivamente" |
| Limites de M1 mal calibrados | bloqueio de uso legítimo | valores em tabela, ajustáveis por SQL sem deploy (runbook); mensagens com próximo passo |
| Contas, categorias, metas e orçamentos sem limite de quantidade | mesma classe de SEC-24 | não há achado; security (T-31) decide se pede; registrado como observação, não escopo |
| `PRIVATE_PREFIXES` do `proxy` não lista `/compromissos`, `/recorrencias`, `/orcamentos` | redirecionamento fica a cargo de `requireMembership` (o proxy não é fronteira, ADR-0016) | observação fora do escopo; sem consequência demonstrável; o backend pode incluir na T-12 se o diff for trivial |
| Spec truncada na §15 | — | segue aberto |

## 8. Pedido de mudança

Formato no handoff: `CR-<agente>-<n>: <arquivo/interface> — <mudança> — <motivo> — <impacto em quem>`.
O orchestrator decide. Se uma interface da §3 muda, este documento sobe de versão (1.1) antes da implementação.

## 9. Pendências do usuário (não bloqueiam a especificação nem a implementação autônoma; sem especificação de implementação aqui)

| # | Item | Origem | O que depende dele | Efeito de não resolver |
|---|---|---|---|---|
| U-1 | **Provedor SMTP** de produção (escolha, domínio de envio, credenciais no painel do Supabase) | roadmap #7; ADR-0029 §5 | e-mail confiável de confirmação/recuperação; "convite recebido" por e-mail; aviso de troca de senha por e-mail | o Auth usa o SMTP padrão do Supabase (limitado e não indicado para produção); sem avisos por e-mail |
| U-2 | **OAuth Google**: credenciais do Google Cloud (client id/secret) e URIs de redirect | roadmap, "Incremento planejado" | botão "Continuar com Google" | incremento segue planejado; a exclusão de conta (ADR-0038) bloqueia contas sem senha até o incremento |
| U-3 | **SEC-10**: limites de e-mail e `max_frequency` do projeto hospedado (painel Auth → Rate Limits/SMTP; ou `supabase config push`, que aplicaria também o `config.toml` local de 1 s) | `achados.md` SEC-10 | proteção do lado do Auth contra e-mail em massa a terceiros | SEC-10 permanece `aberto`; o app limita só o próprio disparo (ADR-0034) |
| U-4 | **URLs de redirect e Site URL** do Supabase Auth (README, pendência 1) | README; roadmap | links de e-mail e callbacks corretos em produção | confirmação/recuperação podem apontar para o destino errado |
| U-5 | **SEC-27**: reautenticar em transferir propriedade e remover administrador, e avisar o afetado (decisão de produto) | `achados.md` SEC-27 | UX e regra de negócio | SEC-27 permanece `aberto` (baixa); `private.require_recent_auth` (M4) existirá se a decisão for sim |
| U-6 | **Domínio próprio** | roadmap | `APP_URL`, Site URL, cookies, HSTS, e-mail do remetente | continua em `*.onrender.com`; nenhum código desta etapa depende dele |
| U-7 | **Variáveis no Render**: `TRUSTED_PROXY_HOPS` (conferir com requisição real) e `LOG_HMAC_KEY` (≥ 32 caracteres aleatórios; segredo) | ADR-0034, ADR-0035 | log com `emailHmac`; IP correto | sem `LOG_HMAC_KEY` o campo é omitido (o app funciona); `TRUSTED_PROXY_HOPS` padrão 1 |
| U-8 | **Plano do Supabase e backups**: confirmar no painel o que o plano oferece (backups diários, PITR) e executar o **ensaio de restauração** do runbook | runbook | RPO/RTO reais | "backup verificado" **não** pode ser declarado sem o ensaio registrado |
| U-9 | **Repositório GitHub**: habilitar Actions, proteção da `main` exigindo o `ci.yml`, opcionalmente a variável `CI_DOCKER=true`; Render com "deploy após CI" | ADR-0039 | CI efetivo | o CI existe como arquivo, mas não bloqueia nada |
| U-10 | **Ratificar**: (a) exclusão imediata de conta sem carência (ADR-0038 §8); (b) limites iniciais de M1; (c) Redis/KV só se houver mais de uma instância (ADR-0034 §7) | ADRs | produto | vale o descrito nos ADRs |
| U-11 | **Pendências anteriores**: apagar no Render o serviço `-39z4`; gerar novas chaves `service_role`/`secret` (as antigas apareceram na conversa); decisão sobre a exceção do TypeScript 7 em `.depsignore`; CAPTCHA no login (opcional, exige conta de provedor); Docker Desktop para quitar o atraso local | README; roadmap | segurança e verificação | permanecem abertas |
