# Núcleo

Gestão financeira familiar. Etapas 1 e 2: fundação técnica, autenticação, famílias e convites.

Stack: Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui (Base UI) + Supabase local.
Documentação em `docs/` (arquitetura, contrato, modelo de dados, critérios de aceite).

## Pré-requisitos

- Node.js 24 (`.nvmrc`) e pnpm 10 ou superior
- Docker em execução (Supabase local)

## Primeiros passos

```bash
pnpm install
pnpm exec playwright install chromium   # só para os testes E2E
pnpm db:start                           # sobe o Supabase local (Docker)
pnpm db:status                          # mostra URL e chaves locais
```

Crie `.env.local` a partir de `.env.example`, com os valores de `pnpm db:status`:

```text
NEXT_PUBLIC_SUPABASE_URL=            # API URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= # Publishable key
SUPABASE_SECRET_KEY=                 # Secret key (somente testes de integração/E2E)
APP_URL=http://localhost:3000
LOG_LEVEL=info
```

Nunca versione `.env.local`.

```bash
pnpm dev                                # http://localhost:3000
```

E-mails de confirmação e recuperação de senha chegam ao Mailpit local:
http://127.0.0.1:54324.

## Comandos

| Comando                                   | O que faz                                              |
| ----------------------------------------- | ------------------------------------------------------ |
| `pnpm dev` / `pnpm build` / `pnpm start`  | Next.js                                                |
| `pnpm lint` / `pnpm typecheck`            | ESLint / `tsc --noEmit`                                |
| `pnpm format` / `pnpm format:check`       | Prettier                                               |
| `pnpm test` / `pnpm test:watch`           | Testes unitários e de componentes (Vitest, jsdom)      |
| `pnpm test:integration`                   | Integração com Supabase local (Vitest, node)           |
| `pnpm test:e2e`                           | Playwright (desktop e mobile); sobe `pnpm dev` sozinho |
| `pnpm check`                              | `lint` + `typecheck` + `test`                          |
| `pnpm db:start` / `db:stop` / `db:status` | Supabase local                                         |
| `pnpm db:reset` / `db:test` / `db:lint`   | Recriar o banco, pgTAP e lint do schema                |
| `pnpm db:types`                           | Regenera `src/types/database.ts`                       |

## Testes E2E

Exigem o Supabase local no ar (`pnpm db:start`), `.env.local` e Mailpit. O Auth local limita
30 logins/cadastros a cada 5 minutos por IP: por isso o `global-setup` cria usuários pela Admin API
e reaproveita a sessão (`e2e/.auth`, ignorado pelo git). Se o limite estourar, aguarde 5 minutos.

## Estrutura

```text
src/app/          rotas: (public) login/cadastro/convite, onboarding, (app) início/família/configurações
src/components/   ui (shadcn), shared, layout, theme
src/modules/      auth, family, profile (schemas, actions, queries e components)
src/server/       ações do servidor, erros, logger
e2e/              testes Playwright e helpers (Mailpit, usuários de teste)
supabase/         migrations, templates de e-mail, testes pgTAP
```
