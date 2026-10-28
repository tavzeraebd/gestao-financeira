# Checklist final de entrega — Núcleo

Versão 1.0 (2026-10-28, Etapa 9) · Dono: architect · Preenchido por: orchestrator + usuário · Referências: `contracts/etapa-9.md` §6 e §9, CA-E9-70..74.

Marcar `[x]` só com evidência anotada ao lado (comando, data, link ou log). `[ ]` = não verificado. Item que depende do usuário está marcado **(usuário)**.

## 1. Qualidade e segurança no código (sem Docker)

- [ ] `pnpm install --frozen-lockfile`, `pnpm check` (lint, typecheck, testes), `pnpm format:check`
- [ ] `pnpm security:check` sem violação
- [ ] `pnpm build` sem erro; nenhuma rota de página prerenderizada além de `/offline` (CA-E9-56)
- [ ] `pnpm test:e2e:publico` verde (inclui CSP, rate limit, PWA)
- [ ] Lighthouse nas públicas: acessibilidade 100 e boas práticas 100 com a CSP ligada (CA-E9-57)
- [ ] `pnpm outdated` (só a exceção datada de `.depsignore`, se mantida) e `pnpm audit` sem vulnerabilidade
- [ ] Security gate global: `node ~/.claude/factory/security/gate.mjs "<projeto>"` = PASSA
- [ ] Revisão (reviewer + security, `structural`) concluída; `achados.md` atualizado (CA-E9-74)

## 2. Verificação com Docker (local ou `ci-docker.yml`)

- [ ] `pnpm db:reset && pnpm db:test` (010, 100–660) verde
- [ ] `pnpm db:lint` sem aviso; `pnpm db:types` sem diff
- [ ] `pnpm test:integration` verde (inclui `@docker` da Etapa 9)
- [ ] `pnpm test:e2e` verde (Etapas 6–9, incluindo `csp-telas` e `conta-excluida`)
- [ ] Specs `@docker` da Etapa 8 (`a11y-telas`, `responsivo-telas`, `pwa-autenticado`) executados

## 3. Banco em produção

- [ ] Backup recente confirmado antes do push (`backup-recuperacao.md` §3–4)
- [ ] `supabase db push --linked --dry-run` mostra só as migrations da Etapa 9
- [ ] `supabase db push --linked` aplicado; `supabase db lint --linked --level warning` limpo; `supabase migration list --linked` coerente
- [ ] Teste de privilégio de `auth.users` (ADR-0038): conta descartável criada e **excluída** pela tela; o e-mail antigo cadastra de novo; nada parcial
- [ ] Tetos de `private.volume_limits` conferidos (valores iniciais do ADR-0033)

## 4. Aplicação em produção (Render)

- [ ] Variáveis: `APP_URL`, `LOG_LEVEL`, `NEXT_PUBLIC_*` corretas; `TRUSTED_PROXY_HOPS` **(usuário)** e `LOG_HMAC_KEY` **(usuário)** definidas; **nenhuma** chave `service_role`/secret no Render
- [ ] Uma única instância do serviço (premissa do rate limit em memória, ADR-0034)
- [ ] Serviço antigo `-39z4` removido **(usuário)**; chaves antigas revogadas **(usuário)**
- [ ] Navegador real: login, `/inicio`, `/relatorios`, `/familia`, `/configuracoes` com o console aberto: **zero** violação de CSP (CA-E9-72); tema claro/escuro; instalar o PWA; offline mostra `/offline`
- [ ] Cabeçalhos em produção (ex.: `curl -sI`): `Content-Security-Policy` com nonce, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; `/sw.js` com sua CSP
- [ ] Log do Render: linhas `warn` com `ip` plausível (varia entre clientes; não é o IP do proxy) e `emailHmac` (se `LOG_HMAC_KEY` definida); nenhuma linha com e-mail, senha ou token
- [ ] Tentar login errado 6 vezes seguidas com o mesmo e-mail → mensagem de limite; sem travar outro usuário

## 5. Supabase Auth e e-mail **(usuário)**

- [ ] Site URL e Redirect URLs de produção (U-4)
- [ ] Provedor SMTP (U-1) e limites de e-mail/`max_frequency` do painel (U-3)
- [ ] OAuth Google, se desejado (U-2)
- [ ] Confirmação e recuperação de senha testadas ponta a ponta em produção

## 6. Backup e continuidade

- [ ] Plano, frequência, retenção e PITR anotados (`backup-recuperacao.md` §7) **(usuário)**
- [ ] **Ensaio de restauração** registrado com as validações da §5 do runbook **(usuário)** — sem ele, "backup verificado" não é declarado
- [ ] Retenção dos logs (Render e Supabase) anotada e coerente com o prazo declarado do IP

## 7. CI e repositório **(usuário)**

- [ ] Actions habilitadas; `ci.yml` verde na `main` (primeira execução registrada)
- [ ] Proteção da `main` exigindo o `ci.yml`; Render com deploy após CI
- [ ] `CI_DOCKER=true` ou execução manual de `ci-docker.yml` (para quitar o atraso das Etapas 6–9)

## 8. Documentação e decisões

- [ ] `architecture.md`, `data-model.md`, `permissions.md`, `threat-model.md`, `README.md` atualizados (CA-E9-73)
- [ ] Roadmap: Etapa 9 com o estado real e pendências por nome
- [ ] Decisões a ratificar (U-10): exclusão imediata, limites de M1, Redis/KV só com mais de uma instância
- [ ] SEC-10 e SEC-27 continuam `aberto` ou foram resolvidos/aceitos pelo usuário com data

## Registro da homologação

| Data | Ambiente | Responsável | Resultado | Pendências remanescentes |
|---|---|---|---|---|
| — | | | | |
