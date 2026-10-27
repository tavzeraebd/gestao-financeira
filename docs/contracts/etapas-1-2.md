# Contrato de execução — Etapas 1 e 2

Versão 1.1 (2026-10-23) · Dono: orchestrator/architect · Alteração só por pedido ao orchestrator (§7).
Referências: `architecture.md`, `data-model.md` §4, `permissions.md`, `threat-model.md`,
`acceptance-criteria.md` (CA-E1-*, CA-E2-*), ADRs 0001–0009 e 0014–0017.

## Emendas da v1.1 (decisões tomadas durante a execução)

As seções 2, 3, 4 e 6 abaixo já estão corrigidas. Onde a v1.0 dizia outra coisa, vale o que está aqui.

| # | Emenda | Registro | Estado no código (2026-10-23) |
|---|---|---|---|
| E1 | `cacheComponents` e `partialPrefetching` desligados (padrão do Next 16.4; não habilitar). Renderização dinâmica; nenhum cache compartilhado de dados de família; só `React.cache` por requisição | [ADR-0015](../adr/0015-renderizacao-dinamica-sem-cache-compartilhado.md) | conforme (`next.config.ts` não habilita) |
| E2 | `ui/form` não existe mais no shadcn: formulários usam `ui/field.tsx` + `Controller` do RHF. Componentes Base UI (`base-nova`) usam `render` em vez de `asChild`. Link com aparência de botão: `<Link className={buttonVariants(...)}>` (ou `<Button render={<Link/>} nativeButton={false}>`) | §3.2; `docs/design-system.md` | conforme |
| E3 | Tokens ajustados para contraste AA: `--ring`/`--sidebar-ring` claro `#4D7C0F`, `--input` claro `#85858E`, `--input` escuro `#7C7C8A`. Badge de estado com fundo sólido (`bg-<estado> text-<estado>-foreground`). Alert não-destructive com `role="status"` | §3.1, §3.2; `docs/design-system.md` | conforme |
| E4 | SEC-3: cookies `sb-*` com `httpOnly`, `sameSite=lax` e `secure` em produção, forçados nos dois `setAll`. Sem cliente Supabase no navegador (`src/lib/supabase/client.ts` removido) | [ADR-0016](../adr/0016-sessao-so-no-servidor.md); `threat-model.md` AB-06 | conforme |
| E5 | O convite sobrevive ao cadastro: `signUpSchema.next` → `safeNextPath(next, "")` → `user_metadata.next_path` → template de confirmação `{{ if .Data.next_path }}&next=…{{ end }}` → `/auth/confirm` revalida com `safeNextPath` | §3.3; ADR-0007 | conforme. **Risco a verificar:** `user_metadata` é controlado pelo usuário (F4: `signUp` direto na API). O template deve codificar o valor (`{{ urlquery .Data.next_path }}`) para impedir injeção de parâmetro ou HTML no e-mail (database + security) |
| E6 | `src/proxy.ts` não redireciona Server Action (header `Next-Action`) nem métodos não-GET/HEAD. `runAction` devolve `UNAUTHENTICATED`, e o formulário leva a `/login?motivo=sessao_expirada&next=<rota>` | [ADR-0017](../adr/0017-envio-de-formularios-e-sessao-expirada.md) | proxy conforme; redirecionamento nos formulários pendente na correção em curso |
| E7 | Supabase local: rate limit `sign_in_sign_ups` e `token_verifications` = 300 (**só local**, para o E2E; produção é revista na Etapa 9); `secure_password_change = true` (SEC-5); `profiles.avatar_url` sem UPDATE para `authenticated` (SEC-7; migration `20261023110000`) | §4.3 | conforme |
| E8 | SEC-1/SEC-11: formulários com `method="post"` e envio só depois da hidratação (`useHydrated`); `logging: { serverFunctions: false }` no `next.config.ts` (o `next dev` do Next 16 imprimia os argumentos de Server Actions, inclusive senha) | ADR-0017 | **pendente**: na leitura de 2026-10-23, `next.config.ts` não tinha `logging`, os formulários não tinham `method` e `src/hooks/use-hydrated.ts` não existia |
| E9 | Donos novos: `src/hooks/use-mobile.ts` → design-system; `src/hooks/use-hydrated.ts` → frontend; `AGENTS.md` e `CLAUDE.md` → orchestrator | §2 | — |
| E10 | Seguem abertas: SEC-4 (IP e HMAC do e-mail no log, auditoria da troca de senha) e SEC-10 (limites de e-mail da config local) → Etapa 9. SMTP real e OAuth Google dependem do usuário (provedor de SMTP; credenciais do Google Cloud). OAuth Google é incremento planejado: o botão só aparece quando o provedor estiver configurado | §6; `roadmap.md` | — |

## 0. Regras do contrato

1. **Um arquivo = um dono** (§2). Ninguém cria, edita, move ou apaga arquivo de outro dono. Precisa de mudança alheia → pedido ao orchestrator (§7).
2. Interfaces da §3 são congeladas nesta versão. Implementação interna é livre; nome, assinatura e comportamento observável não.
3. Fora do escopo nesta rodada: contas, categorias, transações, dashboard com números, gráficos, notificações, troca de papel/remoção de integrante na UI, OAuth Google/Apple, PWA, deploy. Não criar rota, tabela ou componente para eles.
4. Sem dados fictícios na UI. Sem `any`, sem `@ts-ignore`/`eslint-disable` para esconder erro. Sem hex fora de `src/app/globals.css`.
5. O Núcleo **não** é EBD: nada do design system EBD, nada de prefixo `EBD_`.
6. Entrega = arquivos do dono + checagens do §4 passando + handoff listando arquivos, comandos executados e resultado.

## 1. Fases e sequência

| Fase | Quem | O quê | Pode começar quando |
|---|---|---|---|
| A1 | frontend | Scaffold, dependências, configs, scripts (§4.1) | já |
| A′ | database | `supabase init`, `config.toml`, migrations, pgTAP (§4.3) — só toca `supabase/` | já, em paralelo com A1 (Docker precisa estar no ar para testar) |
| A2 | design-system | `shadcn init` + `shadcn add` dos componentes da §3.2 — **único momento** em que o DS altera `package.json`/`pnpm-lock.yaml` | A1 concluída |
| B | design-system, backend, database, frontend em paralelo | implementação dos arquivos de cada dono | A2 concluída (database: também A′) |
| C | orchestrator (+ QA/reviewer/security) | integração: `pnpm check`, `pnpm build`, `pnpm db:test`, `pnpm test:integration`, `pnpm test:e2e`, security gate; pedidos de mudança aplicados pelos donos | todos de B entregues |

Regras de sequência:
- Em A1 o `.claude/` e `docs/` já existem e `supabase/` pode existir: o `create-next-app` recusa pasta com arquivos conflitantes. Gerar em pasta temporária fora do projeto (ex.: scratchpad) e mover o conteúdo para a raiz (sem `node_modules`), depois `pnpm install` na raiz.
- Em B, `package.json`/`pnpm-lock.yaml` ficam **congelados**. Dependência nova = pedido (§7), aplicada pelo frontend na Fase C.
- Em B, DS e backend publicam **primeiro** os arquivos de interface (exports com as assinaturas da §3, mesmo com implementação provisória), para o frontend compilar contra eles. Build completo do frontend só é exigido na Fase C.
- `src/types/database.ts` é gerado pelo database (`pnpm db:types`) no início da Fase B; até lá o backend tipa pelas tabelas da §3.4.

## 2. Mapa de donos

| Caminho | Dono |
|---|---|
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | frontend (A1, C) · design-system (só A2) |
| `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `postcss.config.mjs`, `.gitignore`, `.nvmrc`, `README.md` | frontend |
| `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`, `e2e/**` | frontend |
| `src/app/**` **exceto** `src/app/globals.css` e `src/app/auth/**` | frontend |
| `src/components/layout/**`, `src/config/**`, `src/modules/*/components/**` | frontend |
| `src/app/globals.css`, `components.json`, `src/components/ui/**`, `src/components/shared/**`, `src/components/theme/**`, `src/styles/**`, `src/lib/utils.ts`, `docs/design-system.md` | design-system |
| `src/proxy.ts`, `src/app/auth/**`, `src/server/**`, `src/lib/supabase/**`, `src/lib/env/**`, `src/lib/safe-redirect.ts` | backend |
| `src/modules/*/` **exceto** `components/` (ou seja `schemas.ts`, `actions.ts`, `queries.ts`, `service.ts`, `repository.ts`, `permissions.ts`, `types.ts`, `*.test.ts`) | backend |
| `vitest.integration.config.ts`, `tests/integration/**`, `.env.example` | backend |
| `supabase/**`, `src/types/database.ts` | database |
| `src/hooks/use-mobile.ts` | design-system (v1.1) |
| `src/hooks/use-hydrated.ts` (e demais `src/hooks/**`) | frontend (v1.1) |
| `docs/**` (exceto `docs/design-system.md`), `.claude/**`, `AGENTS.md`, `CLAUDE.md` | orchestrator/architect |

Testes unitários ficam ao lado do arquivo testado e pertencem ao dono dele.

## 3. Interfaces

### 3.1 Tokens CSS (design-system → todos)

Definidos em `src/app/globals.css` como `--<token>` em `:root` (claro) e `.dark` (escuro), expostos por
`@theme inline { --color-<token>: var(--<token>); }` → classes `bg-<token>`, `text-<token>`, `border-<token>`, `ring-<token>`.
Valores do claro baseados em Lime/Zinc (hex v3); `--primary` claro é **exatamente** `#84CC16`. Valores do escuro
**exclusivamente** da paleta Rocket (`#121214 #202024 #29292E #7C7C8A #C4C4CC #E1E1E6 #00B37E #00F593 #F75A68 #FBA94C`)
ou `color-mix()` entre eles. O DS pode ajustar neutros do claro para cumprir contraste AA; não pode renomear tokens.

| Token | Claro (ref.) | Escuro | Uso |
|---|---|---|---|
| `background` | `#FAFAFA` | `#121214` | fundo da página |
| `foreground` | `#18181B` | `#E1E1E6` | texto principal |
| `card` / `card-foreground` | `#FFFFFF` / `#18181B` | `#202024` / `#E1E1E6` | cartões |
| `popover` / `popover-foreground` | `#FFFFFF` / `#18181B` | `#202024` / `#E1E1E6` | menus, diálogos |
| `surface` / `surface-secondary` | `#FFFFFF` / `#F4F4F5` | `#202024` / `#29292E` | aliases da spec §2.4 |
| `primary` / `primary-foreground` | `#84CC16` / `#1A2E05` | `#00B37E` / `#121214` | ação principal (texto escuro sobre o verde: AA) |
| `primary-hover` | `#65A30D` | `#00F593` | hover/ativo da ação principal |
| `primary-soft` / `primary-soft-strong` | `#F7FEE7` / `#ECFCCB` | `color-mix(in srgb, #00B37E 12%, #202024)` / `... 20% ...` | fundos de destaque |
| `primary-text` | `#4D7C0F` | `#00B37E` | link/texto em verde sobre superfície |
| `secondary` / `secondary-foreground` | `#F4F4F5` / `#18181B` | `#29292E` / `#E1E1E6` | botão secundário |
| `muted` / `muted-foreground` | `#F4F4F5` / `#52525B` | `#29292E` / `#C4C4CC` | texto secundário |
| `subtle-foreground` | `#71717A` | `#7C7C8A` | placeholder, menor hierarquia (nunca texto informativo pequeno no escuro) |
| `accent` / `accent-foreground` | `#F4F4F5` / `#18181B` | `#29292E` / `#E1E1E6` | hover de item (shadcn) |
| `border` / `input` / `ring` | `#E4E4E7` / `#85858E` / `#4D7C0F` (v1.1, AA) | `#29292E` / `#7C7C8A` (v1.1, AA) / `#00F593` | bordas, borda de controle, foco |
| `success` / `success-foreground` / `success-soft` | `#15803D` / `#FFFFFF` / `#DCFCE7` | `#00B37E` / `#121214` / `color-mix(in srgb, #00B37E 15%, #202024)` | positivo |
| `danger` / `danger-foreground` / `danger-soft` | `#DC2626` / `#FFFFFF` / `#FEE2E2` | `#F75A68` / `#121214` / `color-mix(in srgb, #F75A68 15%, #202024)` | erro, exclusão |
| `destructive` / `destructive-foreground` | `var(--danger)` / `var(--danger-foreground)` | idem | alias exigido pelo shadcn |
| `warning` / `warning-foreground` / `warning-soft` | `#B45309` / `#FFFFFF` / `#FEF3C7` | `#FBA94C` / `#121214` / `color-mix(in srgb, #FBA94C 15%, #202024)` | aviso |
| `income` / `expense` | `#15803D` / `#DC2626` | `#00B37E` / `#F75A68` | texto de receita/despesa |
| `chart-income` / `chart-expense` | `#16A34A` / `#DC2626` | `#00B37E` / `#F75A68` | gráficos (Etapa 4) |
| `chart-1` … `chart-6` | `#65A30D #0284C7 #EA580C #7C3AED #DB2777 #71717A` | `#00B37E #00F593 #FBA94C #C4C4CC #7C7C8A #F75A68` | séries categóricas (Etapa 4) |
| `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring` | `#FFFFFF #3F3F46 #84CC16 #1A2E05 #ECFCCB #3F6212 #E4E4E7 #4D7C0F` (ring v1.1) | `#202024 #C4C4CC #00B37E #121214 color-mix(in srgb, #00B37E 15%, #202024) #E1E1E6 #29292E #00F593` | navegação (item ativo = `sidebar-accent`) |
| `--radius` | `0.75rem` | idem | cantos (cartões `rounded-xl`) |

Variante escura: `@custom-variant dark (&:where(.dark, .dark *));`. Fonte: `--font-sans` (Inter, `next/font`).

### 3.2 Componentes (design-system → frontend)

Todos com tokens, foco visível (`ring`), estados disabled/erro e alvo de toque ≥ 40px nos controles principais.

| Arquivo | Exports | Contrato |
|---|---|---|
| `src/components/ui/button.tsx` | `Button`, `buttonVariants` | shadcn `base-nova` (Base UI) + prop `loading?: boolean` (desabilita, `aria-busy="true"`, ícone girando com `motion-safe:animate-spin`, mantém o texto). `variant`: `default\|secondary\|outline\|ghost\|destructive\|link`; `size`: `default\|sm\|lg\|icon` (+ `xs`, `icon-xs`, `icon-sm`, `icon-lg`, nunca como controle principal). **Sem `asChild`** (v1.1): use `render` + `nativeButton={false}`, ou `<Link className={buttonVariants(...)}>` |
| `ui/input.tsx`, `ui/label.tsx` | `Input`, `Label` | shadcn; `aria-invalid` estiliza erro |
| `ui/field.tsx` (v1.1; substitui `ui/form.tsx`, que saiu do registry) | `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldContent`, `FieldTitle`, `FieldSeparator` | com `Controller` do RHF; ligação manual: `data-invalid` no `Field`, `aria-invalid` no controle, `aria-describedby` → `id` de `FieldDescription`/`FieldError` (`role="alert"`) |
| `ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | `rounded-xl border bg-card` |
| `ui/alert.tsx` | `Alert`, `AlertTitle`, `AlertDescription` | `variant`: `default\|destructive\|success\|warning`; `destructive` usa `role="alert"`, os demais `role="status"` (v1.1); texto `foreground` sobre `*-soft` |
| `ui/badge.tsx` | `Badge` | `variant`: `default\|secondary\|outline\|success\|warning\|danger`; estados com fundo sólido + `*-foreground` (v1.1); aceita `render` |
| `ui/avatar.tsx` | `Avatar`, `AvatarImage`, `AvatarFallback` | shadcn |
| `ui/dialog.tsx`, `ui/alert-dialog.tsx`, `ui/sheet.tsx` | exports shadcn padrão | `alert-dialog` para confirmação destrutiva; `sheet` para menu "Mais" no celular |
| `ui/dropdown-menu.tsx`, `ui/separator.tsx`, `ui/skeleton.tsx`, `ui/tabs.tsx`, `ui/tooltip.tsx` | exports shadcn padrão | `Skeleton` com `motion-safe:animate-pulse` |
| `ui/sonner.tsx` | `Toaster` | tematizado; uso: `import { toast } from "sonner"` |
| `ui/sidebar.tsx` | exports shadcn padrão (`SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarTrigger`, `SidebarHeader`, `SidebarFooter`, `useSidebar`...) | recolhível (`collapsible="icon"`); item ativo via `isActive` |
| `src/components/shared/logo.tsx` | `Logo` | `{ variant?: "full" \| "mark"; className?: string }`; folha em SVG inline com `fill="currentColor"`/token; `full` inclui "Núcleo"; `role="img"` + `aria-label="Núcleo"` |
| `shared/theme-toggle.tsx` | `ThemeToggle` | client; menu Claro/Escuro/Sistema; `aria-label="Alterar tema"`; não lê nem escreve dado do app |
| `shared/empty-state.tsx` | `EmptyState` | `{ icon?: LucideIcon; title: string; description?: string; action?: ReactNode }` |
| `shared/page-header.tsx` | `PageHeader` | `{ title: string; description?: string; actions?: ReactNode }`; `title` em `<h1>` |
| `shared/password-input.tsx` | `PasswordInput` | props de `Input`; botão mostrar/ocultar com `aria-label` "Mostrar senha"/"Ocultar senha" e `aria-pressed` |
| `src/components/theme/theme-provider.tsx` | `ThemeProvider` | client; `next-themes` com `attribute="class"`, `defaultTheme="light"`, `enableSystem`, `storageKey="nucleo-theme"`, `disableTransitionOnChange` |
| `src/styles/fonts.ts` | `fontSans` | `Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" })` |
| `src/lib/utils.ts` | `cn` | shadcn |

`docs/design-system.md` (DS): tabela de tokens com razão de contraste medida (texto ≥ 4.5:1; texto grande e componentes ≥ 3:1) nos dois temas, regras de uso do Lime 500, padrões responsivos (breakpoints Tailwind padrão; mobile < `md`, sidebar recolhida entre `md` e `lg`).

### 3.3 Backend → frontend (Server Actions, queries, guards)

Tipos comuns em `src/server/action.ts` (`ActionResult<T>`, `ActionError`, `ErrorCode`, `runAction`) — definição em `architecture.md` §7.
Schemas Zod exportados (o frontend usa no `zodResolver` e infere o tipo com `z.input<typeof schema>`).

`src/modules/auth/schemas.ts`

| Export | Campos (após `trim`) |
|---|---|
| `signUpSchema` | `displayName` 1..80 · `email` `z.email()` ≤ 254, minúsculas · `password` 8..72, ≥ 1 letra e ≥ 1 dígito · `next?` string ≤ 512 (v1.1) |
| `signInSchema` | `email` · `password` 1..72 · `next?` string ≤ 512 |
| `requestPasswordResetSchema` | `email` |
| `resendConfirmationSchema` | `email` |
| `updatePasswordSchema` | `password` (mesma regra do cadastro) · `confirmPassword` (igual a `password`, erro em `confirmPassword`) |

`src/modules/auth/actions.ts` (`"use server"`)

| Função | Retorno | Comportamento |
|---|---|---|
| `signUp(input)` | `Promise<ActionResult<{ email: string }>>` | `auth.signUp` com `options.data.display_name` (+ `next_path = safeNextPath(next, "")` quando não vazio; v1.1) e `emailRedirectTo = APP_URL/auth/confirm`; e-mail já cadastrado responde **igual** ao sucesso; UI mostra "Enviamos um link de confirmação para {email}" |
| `signIn(input)` | `Promise<ActionResult<never>>` | sucesso → `redirect(safeNextPath(next))` (padrão `/inicio`); erros `INVALID_CREDENTIALS`, `EMAIL_NOT_CONFIRMED`, `RATE_LIMITED` |
| `signOut()` | `Promise<void>` | `auth.signOut()` → `redirect("/login")` |
| `requestPasswordReset(input)` | `Promise<ActionResult<null>>` | `resetPasswordForEmail(email, { redirectTo: APP_URL/auth/confirm?next=/redefinir-senha })`; responde sempre `ok` (exceto `VALIDATION_ERROR`/`RATE_LIMITED`) |
| `resendConfirmation(input)` | `Promise<ActionResult<null>>` | `auth.resend({ type: "signup", email })`; sempre `ok` |
| `updatePassword(input)` | `Promise<ActionResult<never>>` | exige sessão; `updateUser({ password })` → `redirect("/inicio")`; `WEAK_PASSWORD`, `SAME_PASSWORD` |

`src/modules/family/schemas.ts`: `createFamilySchema { name 1..80 }` · `createInviteSchema { role: "admin" | "member" (padrão "member"); email?: z.email() ≤ 254 ou string vazia → undefined }` · `revokeInviteSchema { inviteId: z.uuid() }` · `acceptInviteSchema { token: /^[0-9a-f]{64}$/ }`.

`src/modules/family/actions.ts` (`"use server"`; nenhuma recebe `family_id`)

| Função | Retorno | Comportamento |
|---|---|---|
| `createFamily(input)` | `Promise<ActionResult<never>>` | RPC `create_family` → `redirect("/inicio")`; `ALREADY_IN_FAMILY` |
| `createInvite(input)` | `Promise<ActionResult<{ inviteUrl: string; expiresAt: string }>>` | RPC `create_family_invite`; `inviteUrl = APP_URL/convite/<token>`; `FORBIDDEN`, `INVITE_LIMIT_REACHED`; token nunca logado; `revalidatePath("/familia")` |
| `revokeInvite(input)` | `Promise<ActionResult<null>>` | RPC `revoke_family_invite`; `FORBIDDEN`, `INVITE_NOT_FOUND`, `INVITE_ALREADY_USED`; `revalidatePath("/familia")` |
| `acceptInvite(input)` | `Promise<ActionResult<never>>` | RPC `accept_family_invite` → `redirect("/inicio")`; `INVITE_*`, `ALREADY_IN_FAMILY` |

`src/modules/family/queries.ts` (`server-only`)

| Função | Retorno |
|---|---|
| `getFamilyOverview()` | `Promise<{ family: { id: string; name: string }; myRole: FamilyRole; members: MemberView[] }>` — só vínculos ativos; `MemberView = { memberId: string; userId: string; displayName: string; avatarUrl: string \| null; role: FamilyRole; joinedAt: string; isMe: boolean }` |
| `listPendingInvites()` | `Promise<InviteView[]>` — `[]` para `member`; `InviteView = { id: string; role: "admin" \| "member"; invitedEmail: string \| null; expiresAt: string; createdAt: string }` |
| `getInvitePreview(token: string)` | `Promise<{ ok: true; data: InvitePreview } \| { ok: false; code: "INVITE_NOT_FOUND" \| "UNAUTHENTICATED" }>` — `InvitePreview = { familyName: string; role: "admin" \| "member"; expiresAt: string; status: "pending" \| "expired" \| "accepted" \| "revoked"; emailBound: boolean }` |

`src/modules/family/permissions.ts`: `type FamilyRole = "owner" | "admin" | "member"`;
`can(role: FamilyRole, action: "invite.list" | "invite.create_member" | "invite.create_admin" | "invite.revoke_member_invite" | "invite.revoke_any" | "audit.read"): boolean` — só UX, espelha `permissions.md`.

`src/modules/profile/`: `schemas.ts` → `updateProfileSchema { displayName 1..80 }`; `actions.ts` → `updateProfile(input): Promise<ActionResult<null>>` (update direto em `profiles`, RLS; `revalidatePath("/", "layout")`); `queries.ts` → `getMyProfile(): Promise<{ id: string; displayName: string; avatarUrl: string | null; email: string }>`.

`src/server/auth.ts` (`server-only`)

| Função | Retorno | Comportamento |
|---|---|---|
| `getOptionalUser()` | `Promise<{ id: string; email: string } \| null>` | `getUser()` |
| `requireUser()` | `Promise<{ id: string; email: string }>` | sem usuário → `redirect("/login")` |
| `getOptionalMembership()` | `Promise<Membership \| null>` | `Membership = { userId: string; memberId: string; familyId: string; familyName: string; role: FamilyRole }` |
| `requireMembership()` | `Promise<Membership>` | sem usuário → `/login`; sem família → `redirect("/onboarding")` |

`src/lib/safe-redirect.ts`: `safeNextPath(input: string | null | undefined, fallback = "/inicio"): string` (regras em `architecture.md` §5).

`src/app/auth/confirm/route.ts` (backend): `GET ?token_hash&type=email|recovery&next` → `verifyOtp` → `redirect(safeNextPath(next, type === "recovery" ? "/redefinir-senha" : "/inicio"))`; falha → `/login?erro=link_invalido`.

`src/lib/supabase/` (backend, v1.1): só `server.ts` e `proxy.ts`. Os dois `setAll` forçam `httpOnly: true`, `sameSite: "lax"` e `secure` em produção. **Não existe `client.ts`** (ADR-0016).

`src/proxy.ts` (backend): matcher exclui `_next/static`, `_next/image`, `favicon.ico` e arquivos estáticos; define `x-request-id` (sempre gerado no servidor); renova sessão (`updateSession`). Só redireciona navegação (GET/HEAD sem header `Next-Action`; v1.1). Sem sessão em `/inicio|/familia|/configuracoes|/onboarding` → `/login?next=<path>`; sem sessão em `/redefinir-senha` → `/recuperar-senha`; com sessão em `/login|/cadastro|/recuperar-senha` → `/inicio`. Em `/convite/*` não redireciona (a página decide).

Query params que o frontend trata em `/login`: `erro=link_invalido` (Alert destructive "O link é inválido ou expirou. Solicite um novo."), `motivo=sessao_expirada` (Alert warning), `next`.

Formulários (frontend, v1.1, ADR-0017): todo `<form>` com `method="post"` e `noValidate`; botão de envio desabilitado até `useHydrated()` (`src/hooks/use-hydrated.ts`) devolver `true`; `UNAUTHENTICATED` vindo de action → `router.push("/login?motivo=sessao_expirada&next=" + encodeURIComponent(<rota atual>))`. `next.config.ts` (frontend): `logging: { serverFunctions: false }`; não habilitar `cacheComponents`/`partialPrefetching` (ADR-0015).

### 3.4 Database → backend

Tabelas `public.profiles`, `families`, `family_members`, `family_invites`, `audit_events` e RPCs
`create_family(p_name text) → uuid`, `create_family_invite(p_role text default 'member', p_email text default null) → table(invite_id uuid, token text, expires_at timestamptz)`,
`get_invite_preview(p_token text) → table(family_name text, role text, expires_at timestamptz, status text, email_bound boolean)`,
`accept_family_invite(p_token text) → uuid`, `revoke_family_invite(p_invite_id uuid) → void` — exatamente como em `data-model.md` §4.
Erros: `P0001` com mensagem = código (`data-model.md` §4.6); `42501` = `FORBIDDEN`. `family_invites` só é legível pelas colunas do grant (sem `token_hash`): queries listam colunas explicitamente.
Tipos: `src/types/database.ts` (`export type Database`), regenerado a cada migration.

### 3.5 Rotas e telas (frontend)

| Rota | Arquivo | Conteúdo e estados obrigatórios |
|---|---|---|
| `/login` | `src/app/(public)/login/page.tsx` | mockup tela 1: Logo, slogan "Sua família no controle do dinheiro.", e-mail, senha (`PasswordInput`), Entrar, link "Criar conta", link "Esqueci minha senha". Estados: validação, `loading`, `INVALID_CREDENTIALS`, `EMAIL_NOT_CONFIRMED` (com ação "Reenviar confirmação"), `RATE_LIMITED`, `erro=link_invalido`, `motivo=sessao_expirada`. **Sem** botões Google/Apple (OAuth adiado; spec §6.3) |
| `/cadastro` | `(public)/cadastro/page.tsx` | nome, e-mail, senha (regra visível), Criar conta; sucesso = tela "Confirme seu e-mail" com reenviar |
| `/recuperar-senha` | `(public)/recuperar-senha/page.tsx` | e-mail; sucesso neutro "Se houver uma conta para este e-mail, enviaremos um link." |
| `/redefinir-senha` | `(public)/redefinir-senha/page.tsx` | nova senha + confirmação; `WEAK_PASSWORD`, `SAME_PASSWORD` |
| `/convite/[token]` | `(public)/convite/[token]/page.tsx` | sem sessão: "Você foi convidado para uma família no Núcleo" + Entrar / Criar conta (`next=/convite/<token>`); com sessão: prévia (nome da família, papel, validade) + Aceitar convite; estados: inválido, expirado, já usado, revogado, e-mail divergente, já em família |
| `/onboarding` | `src/app/onboarding/page.tsx` (+ `layout.tsx` com `requireUser`, redireciona a `/inicio` se já houver família) | passo 1 de 1 nesta etapa: "Crie sua família" (nome); texto informando que convites recebidos são aceitos pelo link; `ALREADY_IN_FAMILY` → `/inicio` |
| `/inicio` | `src/app/(app)/inicio/page.tsx` | saudação "Olá, {primeiro nome}!" + `EmptyState` orientando o próximo passo ("Em breve você poderá cadastrar contas e lançamentos"); **nenhum número fictício** |
| `/familia` | `(app)/familia/page.tsx` | integrantes (avatar, nome, papel com `Badge`, "(você)"); owner/admin: convites pendentes (validade, revogar com `AlertDialog`) e formulário de convite (papel; `admin` só para owner; e-mail opcional) que mostra o link **uma vez** com botão Copiar |
| `/configuracoes` | `(app)/configuracoes/page.tsx` | perfil (nome de exibição, `updateProfile`), tema (`ThemeToggle` ou grupo de opções), Sair |
| `(app)/layout.tsx` | | `requireMembership()`; desktop: `AppSidebar` (Logo, navegação, recolhível em `md`–`lg`) + `AppHeader` (título, `ThemeToggle`, `UserMenu` com nome, Configurações, Sair); mobile (< `md`): `BottomNav` fixo com safe area (`pb-[env(safe-area-inset-bottom)]`) e `MobileMoreSheet` |
| `error.tsx`, `not-found.tsx`, `global-error.tsx`, `loading.tsx` por grupo | | mensagem segura + `requestId` quando houver; `Skeleton` no carregamento |

`src/config/navigation.ts` (frontend): `navItems: { href: string; label: string; icon: LucideIcon; mobile: "primary" | "more" }[]`
com, nesta rodada, só rotas existentes: Início (`/inicio`, primary), Família (`/familia`, primary), Configurações (`/configuracoes`, more).
As demais (Transações, Contas, Orçamentos, Metas, Planejamento, Relatórios, Notificações) entram quando a rota existir.

### 3.6 Scripts pnpm (frontend define em A1; todos usam)

| Script | Comando |
|---|---|
| `dev` / `build` / `start` | `next dev` / `next build` / `next start` |
| `lint` | `eslint .` |
| `typecheck` | `tsc --noEmit` |
| `format` / `format:check` | `prettier --write .` / `prettier --check .` |
| `test` / `test:watch` | `vitest run` / `vitest` (jsdom; `src/**/*.test.{ts,tsx}`) |
| `test:integration` | `vitest run -c vitest.integration.config.ts` (node; `tests/integration/**/*.test.ts`; sem paralelismo de arquivos) |
| `test:e2e` | `playwright test` |
| `db:start` / `db:stop` / `db:status` | `supabase start` / `supabase stop` / `supabase status` |
| `db:reset` | `supabase db reset` |
| `db:test` | `supabase test db` |
| `db:lint` | `supabase db lint --level warning` |
| `db:types` | `supabase gen types typescript --local > src/types/database.ts` |
| `check` | `pnpm lint && pnpm typecheck && pnpm test` |

### 3.7 Variáveis de ambiente

`.env.example` (backend), sem valores: `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`, `APP_URL=`, `SUPABASE_SECRET_KEY=` (comentário: "somente testes de integração/E2E nesta fase"), `LOG_LEVEL=`. Local: `.env.local` com valores de `pnpm db:status`. Leitura só via `src/lib/env/public.ts` (`publicEnv`) e `src/lib/env/server.ts` (`serverEnv`, `server-only`).

## 4. Entregas e critérios por agente

### 4.1 frontend (`factory-frontend`)

Fase A1 — scaffold:
1. `create-next-app` (TS, ESLint, Tailwind v4, App Router, `src/`, alias `@/*`, pnpm) em pasta temporária, movido para a raiz.
2. `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
3. Dependências: `@supabase/supabase-js`, `@supabase/ssr`, `zod` (v4), `react-hook-form`, `@hookform/resolvers`, `next-themes`, `lucide-react`, `server-only`. Dev: `prettier`, `prettier-plugin-tailwindcss`, `vitest`, `@vitejs/plugin-react`, `vite-tsconfig-paths`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@playwright/test`, `supabase`. Nada de date-fns/Recharts nesta rodada.
4. pnpm ≥ 10 bloqueia scripts de instalação: liberar em `pnpm-workspace.yaml` (`onlyBuiltDependencies`) apenas os necessários (`supabase`, `@tailwindcss/oxide`, `esbuild`, `sharp`, `unrs-resolver` conforme aparecerem) e conferir `pnpm exec supabase --version`.
5. ESLint: config Next + `@typescript-eslint/no-explicit-any: "error"`; Prettier com plugin Tailwind.
6. `next.config.ts` com os headers de `architecture.md` §10 (incluindo `Referrer-Policy: no-referrer` em `/convite/:path*` e `/auth/:path*`).
7. Scripts da §3.6; `vitest.config.ts` + `vitest.setup.ts` (jest-dom); `playwright.config.ts` (baseURL `http://localhost:3000`, `webServer: pnpm dev`, projetos `desktop` Chromium 1280×800 e `mobile` Pixel 7); `pnpm exec playwright install chromium`.
8. `.gitignore` com `.env*` (exceto `.env.example`), `.next`, `node_modules`, `playwright-report`, `test-results`, `supabase/.temp`, `.claude/factory/project-memory/security/.gate-pass.json`.
9. Placeholder mínimo: `src/app/layout.tsx` e `src/app/page.tsx` (redirect `/inicio`). Deixar `src/app/globals.css` do scaffold intacto (o DS reescreve).
Aceite A1: `pnpm install` limpo; `pnpm lint`, `pnpm typecheck`, `pnpm build` passam; `pnpm exec supabase --version` responde.

Fase B — telas: tudo da §3.5, `src/components/layout/*` (`AppSidebar`, `AppHeader`, `BottomNav`, `MobileMoreSheet`, `UserMenu`), `src/modules/{auth,family,profile}/components/*` (formulários RHF + `zodResolver` com os schemas do backend; chamada da action em `startTransition`; `setError` para `fieldErrors`; toast/Alert para erro geral; dados mantidos em falha), root layout (`lang="pt-BR"`, `fontSans.variable`, `ThemeProvider`, `Toaster`, `suppressHydrationWarning`), `README.md` (pré-requisitos, `pnpm db:start`, `.env.local` a partir de `db:status`, `pnpm dev`, Mailpit em `http://127.0.0.1:54324`, comandos de teste).
E2E em `e2e/` (helpers: `e2e/helpers/mailpit.ts` → `getLatestLink(email)`, `e2e/helpers/users.ts` → criar usuário confirmado via Admin API com `SUPABASE_SECRET_KEY`, só no Supabase local): ver `acceptance-criteria.md` CA-E1-06, CA-E1-09..11 e CA-E2-50..60.
Aceite B: `pnpm lint`, `pnpm typecheck`, `pnpm test` (componentes de formulário com RTL: validação, loading, erro do servidor) passam; sem hex em `src/**/*.tsx`; nenhuma importação de `@/lib/supabase/*`, `repository` ou `service` em arquivo `"use client"`.

### 4.2 design-system (`factory-design-system`)

Fase A2: `pnpm dlx shadcn@latest init` (estilo padrão, base neutra; Tailwind v4) e `shadcn add` de: button, input, label, field (v1.1; `form` saiu do registry), card, alert, badge, avatar, dialog, alert-dialog, sheet, dropdown-menu, separator, skeleton, sonner, tabs, tooltip, sidebar. Não adicionar outros.
Fase B: tokens da §3.1 em `globals.css` (claro e escuro); ajustes de componentes da §3.2 (variantes `success`/`warning`/`danger`, `Button.loading`); `shared/*`, `theme/theme-provider.tsx`, `styles/fonts.ts`; `docs/design-system.md`.
Aceite:
- `globals.css` contém `#84CC16` como `--primary` do claro e **todos** os 10 valores Rocket no `.dark`; nenhum outro hex no bloco `.dark` (grep).
- `grep -rEn "#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(" src --include=*.tsx` → vazio.
- RTL: `Button loading` fica `disabled` e `aria-busy`; `PasswordInput` alterna `type` e `aria-pressed`; `ThemeToggle` aplica/remove `dark` em `<html>` e grava `nucleo-theme`; `EmptyState` renderiza título/ação.
- `docs/design-system.md` com contraste medido ≥ 4.5:1 para `foreground`, `muted-foreground`, `primary-foreground` sobre `primary`, `primary-text`, `danger`, `success`, `warning` sobre `card` nos dois temas.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` passam.

### 4.3 database (`factory-database`)

Fase A′: `pnpm dlx supabase init` (ou `npx supabase init`; sem settings de IDE) — se a Fase A1 já tiver instalado o CLI, usar `pnpm exec supabase`. `config.toml`: `[api] schemas = ["public"]`; `[auth] site_url = "http://localhost:3000"`, `additional_redirect_urls = ["http://localhost:3000/auth/confirm"]`, `minimum_password_length = 8`, `password_requirements = "letters_digits"`, `enable_signup = true`; `[auth.email] enable_confirmations = true`; templates `confirmation` e `recovery` em `supabase/templates/` com links `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` e `...&type=recovery&next=/redefinir-senha`, textos em pt-BR com a marca Núcleo; `seed.sql` vazio. v1.1: `[auth.rate_limit] sign_in_sign_ups = 300` e `token_verifications = 300` (**só local**, para o E2E); `[auth.email] secure_password_change = true`; migration que retira o UPDATE de `profiles.avatar_url` de `authenticated`; template de confirmação com `{{ if .Data.next_path }}&next=…{{ end }}` (codificar com `urlquery`, E5).
Migrations e funções exatamente como `data-model.md` §4; pgTAP como `acceptance-criteria.md` §E2-DB (CA-E2-01..22).
Fase B: `pnpm db:types` → `src/types/database.ts` (regenerar a cada mudança e avisar o backend).
Aceite: `pnpm db:reset` do zero sem erro; `pnpm db:test` 100% verde; `pnpm db:lint` sem erro; nenhuma tabela de `public` sem RLS; nenhuma função `security definer` sem `search_path`; `anon` sem privilégio em `public`.

### 4.4 backend (`factory-backend`)

Fase B: `src/lib/env/*`, `src/lib/supabase/{server,proxy}.ts` (v1.1: sem `client.ts`), `src/proxy.ts`, `src/app/auth/confirm/route.ts`, `src/lib/safe-redirect.ts`, `src/server/{action,errors,error-messages,auth,logger,request-id}.ts`, `src/modules/{auth,family,profile}/{schemas,actions,queries,service,repository,permissions}.ts` conforme a §3.3, `.env.example`, `vitest.integration.config.ts`, `tests/integration/**`.
Aceite:
- Unit (`pnpm test`): `safeNextPath` (`//evil.com`, `/\evil`, `https://x`, `javascript:`, `/inicio?x=1` ok, prefixo fora da allowlist → fallback); `toAppError` (cada código mapeado; mensagem do Postgres nunca exposta); `runAction` (VALIDATION_ERROR com `fieldErrors`; UNAUTHENTICATED; redirect relançado; erro inesperado → INTERNAL_ERROR com `requestId`); schemas (limites e normalização); logger rejeita campos fora da allowlist (teste de tipo + runtime) e não serializa `token`/`email`/`password`.
- Integração (`pnpm test:integration`, Supabase local): `createFamily` cria família + owner; segunda chamada → `ALREADY_IN_FAMILY`; `createInvite` por member → `FORBIDDEN`; admin com `role: "admin"` → `FORBIDDEN`; `acceptInvite` válido junta o usuário; repetido → `INVITE_ALREADY_USED`; `getFamilyOverview` de outro usuário não mostra a família alheia; `updateProfile` só altera o próprio.
- `grep -rn "SUPABASE_SECRET_KEY\|service_role" src` → vazio. `grep -rn "getSession(" src` → vazio. Todo arquivo de servidor começa com `import "server-only"`.
- `pnpm lint`, `pnpm typecheck` passam.

## 5. Integração (Fase C, orchestrator)

Ordem: `pnpm install` → `pnpm db:reset` → `pnpm db:types` (sem diff) → `pnpm check` → `pnpm build` → `pnpm db:test` → `pnpm test:integration` → `pnpm test:e2e` → `node ~/.claude/factory/security/gate.mjs "<projeto>"` → revisão (reviewer + security, mudança `structural`).
Etapa 1 concluída = CA-E1-* verdes; Etapa 2 concluída = CA-E2-* verdes (`acceptance-criteria.md`).

## 6. Bloqueadores conhecidos

| Item | Impacto | Afeta |
|---|---|---|
| Docker Desktop precisa estar rodando | sem ele não há `supabase start`, `db:test`, integração nem E2E | Etapa 2 (bloqueante) |
| Sem projeto Supabase em nuvem/credenciais | nenhum ambiente além do local | só Etapa 9 (deploy) |
| Sem SMTP de produção (o usuário precisa escolher o provedor) | confirmação e recuperação só via Mailpit local; convites por link copiado | Etapa 9 (produção) |
| Sem credenciais OAuth Google (o usuário precisa criá-las no Google Cloud) | botão fora da tela de login até o provedor estar configurado; Apple fora do plano | incremento planejado (`roadmap.md`) |
| SEC-4 (IP e HMAC de e-mail no log; troca de senha como evento de auditoria) e SEC-10 (limites de e-mail para produção) | detecção limitada; config local permissiva | Etapa 9 |
| SEC-1/SEC-11 (E8) ainda não aplicados no código em 2026-10-23 | senha pode ir para a URL ou para o log do `next dev` | fecha antes da Etapa 3 (pré-condição de `etapa-3.md`) |
| Spec truncada na §15 (regras de execução 2+) | regras do autor podem estar ausentes | confirmar com o usuário antes da Etapa 3 |
| Repositório sem git | sem histórico/CI; o gate de segredo exige git para parte das checagens | Fase C (orchestrator decide com o usuário; `git init` não faz parte desta rodada) |

## 7. Pedido de mudança

Formato no handoff: `CR-<agente>-<n>: <arquivo/interface> — <mudança> — <motivo> — <impacto em quem>`.
O orchestrator decide; se a interface da §3 muda, este documento sobe de versão (1.1) antes da implementação.
