# Arquitetura — Núcleo

Versão 1.0 (Etapa 0, 2026-10-23). Fonte: `docs/reference/especificacao.md` (spec) e `docs/reference/mockups.png`.
Documentos irmãos: `data-model.md`, `permissions.md`, `financial-definitions.md`, `threat-model.md`,
`contracts/etapas-1-2.md`, `adr/`.

> O Núcleo **não** é aplicação EBD: não usa o design system EBD nem a convenção `EBD_` de tabelas.

## 1. Visão geral

Monólito modular Next.js (App Router) + Supabase (Auth, Postgres, RLS). Um deploy, um banco.
Toda leitura e escrita de dados do usuário passa pelo cliente Supabase **com o JWT do usuário**;
o banco (RLS + RPCs) é a fronteira final de autorização ([ADR-0001](adr/0001-monolito-modular.md),
[ADR-0006](adr/0006-autorizacao-rls-rpc.md)).

```
Navegador ──HTTPS──> Next.js (proxy → RSC / Server Actions / Route Handlers) ──JWT do usuário──> Supabase (PostgREST + Auth) ──> Postgres (RLS)
```

## 2. Stack (Etapas 1–2)

| Item | Escolha | Observação |
|---|---|---|
| Runtime | Node 24, pnpm 11 | verificados no ambiente |
| Framework | Next.js estável atual (App Router, ≥16), React 19, TS `strict` + `noUncheckedIndexedAccess` | Next ≥16: middleware chama-se `proxy` (`src/proxy.ts`); `cookies()`/`headers()` são assíncronos; `next lint` não existe (usar `eslint`). Conferir `node_modules/next/dist/docs/` antes de usar API do framework. |
| Estilo | Tailwind CSS v4 (tokens via CSS `@theme`), shadcn/ui, lucide-react, next-themes | sem `tailwind.config.js` ([ADR-0005](adr/0005-temas-tokens-css.md)) |
| Formulários | React Hook Form + `@hookform/resolvers` + Zod v4 | mesmo schema no cliente e no servidor |
| Dados | `@supabase/supabase-js` + `@supabase/ssr`; Supabase CLI como devDependency (`supabase`) | local-first ([ADR-0002](adr/0002-supabase-local-first.md)) |
| Testes | Vitest + RTL + jsdom; Playwright; pgTAP (`supabase test db`) | [ADR-0009](adr/0009-testes-rls-pgtap.md) |
| Qualidade | ESLint (config Next + `no-explicit-any: error`), Prettier + `prettier-plugin-tailwindcss` | |
| Etapas 3+ (instalar só quando usar) | date-fns + `@date-fns/tz` (Etapa 3), Recharts (Etapa 4), TanStack Table só com necessidade real | spec §3.1 |

Fonte tipográfica: **Inter** via `next/font/google` (`--font-sans`) — a spec não nomeia fonte; Inter é
neutra, legível e tem `tabular-nums` (decisão reversível, só token).

## 3. Camadas

| Camada | Onde | Pode depender de | Não pode |
|---|---|---|---|
| Apresentação | `src/app/**`, `src/components/**`, `src/modules/*/components/**` | aplicação (actions/queries), domínio puro (formatadores), DS | importar repository, cliente Supabase server, `server-only` |
| Aplicação (casos de uso) | `src/modules/*/actions.ts` (Server Actions), `queries.ts` (leituras para RSC), `service.ts` | domínio, infraestrutura, `src/server/*` | conter JSX; conter regra financeira inline |
| Domínio | `src/modules/*/domain/*.ts`, `src/lib/money/*`, `src/lib/dates/*` | nada além de TS puro (e date-fns) | importar Next, Supabase, React |
| Infraestrutura | `src/lib/supabase/*`, `src/modules/*/repository.ts`, `supabase/**` | cliente Supabase, tipos gerados | regra de negócio |
| Autorização | Banco: RLS + funções `private.*` + RPCs `public.*` (fonte de verdade). App: `src/server/auth.ts` (`requireUser`, `requireMembership`) e `src/modules/family/permissions.ts` (só para exibir/ocultar UI) | | decidir acesso só no cliente |

Regras:
- Regra financeira vive no domínio (TS puro, testado) **ou** no banco (constraint/trigger/RPC); nunca em componente.
- Agregações (saldos, totais, relatórios) são feitas no banco (views `security_invoker` ou funções `security invoker`), nunca carregando todas as transações no app (spec §14).
- Arquivos de servidor (`repository.ts`, `service.ts`, `queries.ts`, `src/server/**`, `src/lib/supabase/server.ts`, `src/lib/env/server.ts`) começam com `import "server-only";`.
- Server Components por padrão; `"use client"` só com interatividade.

## 4. Estrutura de pastas

Criar pasta só quando houver arquivo (spec §4). Estado-alvo das Etapas 1–2 (dono entre colchetes —
ver `contracts/etapas-1-2.md`):

```text
/
├── docs/                                  [architect/orchestrator]
├── supabase/                              [database]
│   ├── config.toml
│   ├── migrations/YYYYMMDDHHMMSS_*.sql
│   ├── templates/{confirmation,recovery}.html
│   ├── tests/database/*.test.sql          (pgTAP)
│   └── seed.sql                           (vazio na Etapa 2)
├── e2e/*.spec.ts, e2e/helpers/*.ts        [frontend]
├── tests/integration/**                   [backend]
├── src/
│   ├── proxy.ts                           [backend]  renova sessão, request id, redireciona rota privada
│   ├── app/
│   │   ├── layout.tsx                     [frontend] <html lang="pt-BR">, fonte, ThemeProvider, Toaster
│   │   ├── globals.css                    [design-system] tokens + @theme
│   │   ├── page.tsx                       [frontend] redireciona p/ /inicio
│   │   ├── not-found.tsx, error.tsx, global-error.tsx   [frontend]
│   │   ├── (public)/layout.tsx, login/, cadastro/, recuperar-senha/, redefinir-senha/, convite/[token]/   [frontend]
│   │   ├── auth/confirm/route.ts          [backend]  verifyOtp (confirmação e recuperação)
│   │   ├── onboarding/layout.tsx, page.tsx [frontend] exige usuário, sem família
│   │   └── (app)/layout.tsx, inicio/, familia/, configuracoes/   [frontend] exige usuário + família
│   ├── components/
│   │   ├── ui/                            [design-system] shadcn + extensões
│   │   ├── shared/                        [design-system] Logo, ThemeToggle, EmptyState, PageHeader, FormMessage
│   │   ├── theme/theme-provider.tsx       [design-system]
│   │   └── layout/                        [frontend] AppSidebar, AppHeader, BottomNav, MobileMoreSheet, UserMenu
│   ├── config/navigation.ts               [frontend]
│   ├── modules/
│   │   ├── auth/   schemas.ts actions.ts queries.ts service.ts                 [backend]
│   │   ├── auth/components/*              [frontend] LoginForm, SignUpForm, ...
│   │   ├── family/ schemas.ts actions.ts queries.ts service.ts repository.ts permissions.ts   [backend]
│   │   ├── family/components/*            [frontend] CreateFamilyForm, MembersList, InviteForm, ...
│   │   └── profile/ schemas.ts actions.ts queries.ts repository.ts  [backend]; profile/components/* [frontend]
│   ├── server/   action.ts errors.ts error-messages.ts auth.ts logger.ts request-id.ts   [backend]
│   ├── lib/
│   │   ├── supabase/ client.ts server.ts proxy.ts   [backend]
│   │   ├── env/ public.ts server.ts       [backend]
│   │   ├── safe-redirect.ts               [backend]
│   │   └── utils.ts                       [design-system] cn()
│   ├── styles/fonts.ts                    [design-system]
│   └── types/database.ts                  [database] gerado por `pnpm db:types`, nunca editado à mão
└── (raiz) package.json, pnpm-lock.yaml, tsconfig.json, next.config.ts, eslint.config.mjs, .prettierrc,
    postcss.config.mjs, vitest.config.ts, vitest.setup.ts, playwright.config.ts, .gitignore, README.md  [frontend]
    components.json [design-system]; vitest.integration.config.ts, .env.example [backend]
```

Etapas 3+ acrescentam `modules/{accounts,categories,transactions,recurrences,budgets,goals,splits,planning,reports,notifications}`,
`lib/money`, `lib/dates`, `components/charts` e as rotas `(app)/{transacoes,contas,categorias,orcamentos,metas,planejamento,relatorios,notificacoes}`.

Divergência da spec §4: `server/services` e `server/repositories` ficam **dentro de cada módulo**
(`modules/<m>/service.ts`, `repository.ts`) para coesão por domínio; `src/server/` fica só com
infraestrutura transversal (ação, erros, log, auth).

## 5. Rotas

| Rota | Acesso | Comportamento |
|---|---|---|
| `/login`, `/cadastro`, `/recuperar-senha` | pública | usuário autenticado é redirecionado a `/inicio` |
| `/redefinir-senha` | exige sessão de recuperação (criada por `/auth/confirm?type=recovery`) | sem sessão → `/recuperar-senha` |
| `/auth/confirm` (Route Handler GET) | pública | `verifyOtp({ type, token_hash })` → redireciona a `next` seguro; falha → `/login?erro=link_invalido` |
| `/convite/[token]` | pública (prévia exige login) | sem sessão: mostra CTA Entrar/Criar conta com `next=/convite/<token>`; com sessão: prévia + Aceitar |
| `/onboarding` | autenticado **sem** família ativa | com família → `/inicio` |
| `/inicio`, `/familia`, `/configuracoes` | autenticado **com** família ativa | sem família → `/onboarding` |
| `/` | — | redireciona a `/inicio` (o guard decide o resto) |

Defesa em camadas: (1) `src/proxy.ts` redireciona rota privada sem sessão para `/login?next=<path>`;
(2) `(app)/layout.tsx` e `onboarding/layout.tsx` chamam `requireUser()` / `requireMembership()`;
(3) RLS. O proxy **não** é fronteira de autorização.

`next` é sempre validado por `safeNextPath()` (`src/lib/safe-redirect.ts`): aceita só caminho relativo
que começa com `/`, não começa com `//` nem `/\`, sem esquema, e com prefixo em
`["/inicio","/familia","/configuracoes","/onboarding","/convite/","/redefinir-senha"]`; senão `/inicio`.

## 6. Clientes Supabase

| Arquivo | Função exportada | Usa | Onde pode ser importado |
|---|---|---|---|
| `src/lib/supabase/client.ts` | `createClient(): SupabaseClient<Database>` (`createBrowserClient`) | URL + publishable key | Client Components (uso mínimo; nas Etapas 1–2 nenhum fluxo precisa dele) |
| `src/lib/supabase/server.ts` | `createClient(): Promise<SupabaseClient<Database>>` (`createServerClient` com `cookies()` `getAll`/`setAll`) | URL + publishable key + cookies do usuário | RSC, Server Actions, Route Handlers |
| `src/lib/supabase/proxy.ts` | `updateSession(request: NextRequest): Promise<{ response: NextResponse; userId: string \| null }>` | idem, cookies do request/response | só `src/proxy.ts` |

Regras:
- Verificação de identidade no servidor: `supabase.auth.getUser()` em `requireUser()` (valida no Auth server);
  no proxy, `supabase.auth.getClaims()` (padrão `@supabase/ssr`). **Nunca** `getSession()` para decidir acesso no servidor.
- No proxy, não executar código entre `createServerClient` e `getClaims()`; devolver o `response` com os cookies atualizados.
- **Secret key (service role)**: não existe cliente admin em `src/` nas Etapas 1–2. Uso permitido apenas em
  `tests/integration/**` e `e2e/helpers/**` (criar usuários confirmados no Supabase local). Uso futuro
  em código de app (ex.: jobs da Etapa 5) exige ADR própria, arquivo `src/lib/supabase/admin.ts` com
  `import "server-only"` e nunca no fluxo de requisição do usuário.
- Variáveis (`src/lib/env/*`, validadas com Zod na carga; ausência = erro de inicialização):

| Variável | Escopo | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | público | clientes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | público | clientes (no local: "Publishable key" de `supabase status`; aceita a anon key legada) |
| `APP_URL` | servidor | `emailRedirectTo`, link de convite (ex.: `http://localhost:3000`) |
| `SUPABASE_SECRET_KEY` | servidor, **só testes** nas Etapas 1–2 | `tests/integration`, `e2e/helpers` |
| `LOG_LEVEL` | servidor, opcional | `debug\|info\|warn\|error` (padrão `info`) |

`.env.example` lista as chaves sem valores. `.env*.local` no `.gitignore`.

## 7. Server Actions

Contrato único (`src/server/action.ts`):

```ts
export type ErrorCode =
  | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED"
  | "INVALID_CREDENTIALS" | "EMAIL_NOT_CONFIRMED" | "WEAK_PASSWORD" | "SAME_PASSWORD"
  | "ALREADY_IN_FAMILY" | "NO_FAMILY"
  | "INVITE_NOT_FOUND" | "INVITE_EXPIRED" | "INVITE_ALREADY_USED" | "INVITE_REVOKED" | "INVITE_EMAIL_MISMATCH" | "INVITE_LIMIT_REACHED"
  | "INTERNAL_ERROR";

export type ActionError = {
  code: ErrorCode;
  message: string;                                   // pt-BR, seguro para o usuário (error-messages.ts)
  fieldErrors?: Partial<Record<string, string[]>>;   // só em VALIDATION_ERROR
  requestId: string;
};
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: ActionError };

export function runAction<S extends z.ZodType, O>(opts: {
  module: string; operation: string;
  schema: S; input: unknown;
  auth: "required" | "none";
  handler: (input: z.output<S>, ctx: { supabase: SupabaseClient<Database>; userId: string | null; requestId: string }) => Promise<O>;
}): Promise<ActionResult<O>>;
```

Fluxo de toda action: `"use server"` → `runAction` → (1) `schema.safeParse(input)` → `VALIDATION_ERROR`
com `fieldErrors` (`z.flattenError`); (2) se `auth: "required"`, `getUser()` → `UNAUTHENTICATED`;
(3) `handler` (service → repository/RPC); (4) erro → `toAppError()` → log → `ActionResult` de falha;
(5) `redirect()`/`notFound()` lançados pelo handler são relançados (`unstable_rethrow`), nunca engolidos.
Regras: o handler **nunca** recebe `family_id` do cliente nas Etapas 1–2 (a família vem de
`requireMembership()`); identificadores recebidos são `z.uuid()`; strings com `trim` e limite de tamanho;
o cliente chama a action dentro de `startTransition`, com botão em `loading` e desabilitado (sem duplo envio).

Formulários: RHF + `zodResolver(schema)` do **mesmo** arquivo `modules/<m>/schemas.ts`; erros de campo do
servidor são aplicados com `setError`; erro geral em `<FormMessage>`/toast. Dados digitados não são
limpos em falha (spec §7.3).

## 8. Erros e observabilidade

- `src/server/errors.ts`: `class AppError extends Error { code: ErrorCode; cause?: unknown }` e
  `toAppError(e: unknown): AppError`, que mapeia:
  - `AuthError.code` do Supabase: `invalid_credentials`→`INVALID_CREDENTIALS`, `email_not_confirmed`→`EMAIL_NOT_CONFIRMED`,
    `weak_password`→`WEAK_PASSWORD`, `same_password`→`SAME_PASSWORD`, `over_request_rate_limit`/`over_email_send_rate_limit`→`RATE_LIMITED`;
  - `PostgrestError`: `code = "P0001"` → `message` é um `ErrorCode` da lista fechada do banco (`data-model.md` §4.6);
    `42501` → `FORBIDDEN`; `23505` → `CONFLICT`; `PGRST116` → `NOT_FOUND`; resto → `INTERNAL_ERROR`.
- `src/server/error-messages.ts`: `Record<ErrorCode, string>` em pt-BR com próximo passo
  (ex.: `INVITE_EXPIRED`: "Este convite expirou. Peça um novo convite a quem administra a família.").
  Nunca repassar `error.message` do Supabase/Postgres ao usuário.
- `src/server/request-id.ts`: o proxy define `x-request-id` (`crypto.randomUUID()`) no request repassado;
  `getRequestId()` lê de `headers()`; o id volta em `ActionError.requestId` e no rodapé da tela de erro.
- `src/server/logger.ts`: JSON em stdout, uma linha por evento:
  `{ ts, level, requestId, module, operation, code, durationMs, userId?, familyId? }`.
  **Allowlist** de campos: nada fora dela é aceito pela tipagem. Proibido logar: e-mail, nome, senha, token
  (de sessão ou convite), cookies, headers, URL com token (`/convite/*`, `/auth/confirm?*`), corpo/entrada
  do usuário, valores monetários, descrições. `userId`/`familyId` são UUIDs pseudônimos permitidos.
- Telas: `error.tsx` por grupo com mensagem genérica + `requestId` + ação "Tentar novamente";
  sem stack trace no cliente em produção.

## 9. Temas

([ADR-0005](adr/0005-temas-tokens-css.md))
- Tokens semânticos como variáveis CSS em `:root` (claro) e `.dark` (escuro) em `src/app/globals.css`,
  expostos ao Tailwind via `@theme inline` (`--color-<token>: var(--<token>)`); variante
  `@custom-variant dark (&:where(.dark, .dark *));`. Lista de tokens e valores: `contracts/etapas-1-2.md` §3.1.
- Claro usa a referência da spec `#84CC16` (Lime 500 do Tailwind v3) — a escala `lime` do Tailwind v4
  (oklch) é ligeiramente diferente; o token fixa o hex da spec. Escuro usa a paleta Rocket **com os
  valores exatos** da spec; tons suaves são `color-mix()` desses mesmos valores.
- Alternância por `next-themes` (`attribute="class"`, `defaultTheme="light"`, `enableSystem`,
  `storageKey="nucleo-theme"`, `disableTransitionOnChange`). Preferência (claro/escuro/sistema) persiste
  no `localStorage` do dispositivo — é preferência de UI, não dado financeiro (spec §3.5 não se aplica).
- Componentes usam só classes de token (`bg-primary`, `text-muted-foreground`...). Hex/`rgb()`/`bg-[#...]`
  fora de `globals.css` é proibido (verificado por grep no aceite).
- `prefers-reduced-motion`: animações de transição desligadas via `motion-safe:`/`motion-reduce:`.

## 10. Segurança transversal (resumo; detalhe em `threat-model.md`)

- RLS em todas as tabelas do schema `public`; `anon` sem privilégio em tabela e função de `public`;
  escrita sensível (família, vínculos, convites, auditoria) só por RPC `security definer`.
- Headers em `next.config.ts`: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
  (e `no-referrer` em `/convite/:path*` e `/auth/:path*`), `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  CSP completa fica para a Etapa 9.
- Server Actions: proteção de origem nativa do Next (não desligar; sem `allowedOrigins` amplo).

## 11. Desempenho e operação (direção para Etapas 3+)

Índices por `family_id` + data; paginação por cursor/offset limitada (máx. 100); agregação no banco; sem
cache compartilhado entre famílias; backup/ambientes documentados na Etapa 9 (não afirmar backup sem verificar).
