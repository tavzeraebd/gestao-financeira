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

## Próximas etapas

_(vazio por ora)_

8.
9.
