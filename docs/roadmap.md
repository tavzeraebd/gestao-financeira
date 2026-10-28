# Roadmap e backlog — Núcleo

Versão 1.0 (Etapa 0). Etapas da spec §11. Prioridade: P0 = bloqueia a etapa; P1 = necessário para a
saída da etapa; P2 = desejável na etapa. Critérios: `acceptance-criteria.md`. Contratos: `contracts/etapas-1-2.md` v1.1
(Etapas 1–2, com emendas), `contracts/etapa-3.md` (Etapa 3), `contracts/etapa-4.md` (Etapa 4), `contracts/etapa-5.md` (Etapa 5), `contracts/etapa-6.md` (Etapa 6) e `contracts/etapa-7.md` (Etapa 7). Fases do mockup (MVP; Organização e Insights; Planejamento e
Futuro; Experiência e Comunidade) mapeiam para Etapas 1–5, 4–7, 6, 8+ respectivamente; itens da fase 4 do
mockup sem requisito na spec (importação bancária, gamificação, comunidade) **não** estão no backlog.

## Dependências entre etapas

```
E0 ──> E1 ──> E2 ──> E3 ──> E4 ──┬──> E7 ──> E8 ──> E9
                     │           │
                     └──> E5 ──> E6 ─┘
```
E4 depende de E3 (dados); E5 depende de E3 (transações) e alimenta "próximos vencimentos" do E4;
E6 depende de E3/E5; E7 (relatórios) reutiliza os serviços de cálculo do E4.

## Etapa 0 — Descoberta e planejamento (concluída por este conjunto de documentos)

Arquitetura, modelo de dados, permissões, definições financeiras, threat model, ADRs 0001–0014, contrato E1–E2.
Pendente de confirmação do usuário: matriz de permissões das Etapas 3+ (`permissions.md` §2); §15 truncada da spec.

## Etapa 1 — Fundação técnica e design system

| Id | Item | Dono | P | Depende |
|---|---|---|---|---|
| E1-01 | Scaffold Next.js + TS estrito + Tailwind v4 + ESLint/Prettier + scripts | frontend | P0 | — |
| E1-02 | Vitest/RTL e Playwright configurados | frontend | P0 | E1-01 |
| E1-03 | shadcn init + componentes base | design-system | P0 | E1-01 |
| E1-04 | Tokens claro (Lime) / escuro (Rocket) + `@theme` | design-system | P0 | E1-03 |
| E1-05 | ThemeProvider, ThemeToggle, persistência | design-system | P0 | E1-04 |
| E1-06 | Logo, EmptyState, PageHeader, PasswordInput, Button loading | design-system | P1 | E1-03 |
| E1-07 | `docs/design-system.md` com contraste medido | design-system | P1 | E1-04 |
| E1-08 | Env tipado, clientes Supabase, proxy (sessão + request id) | backend | P0 | E1-01 |
| E1-09 | `runAction`, erros, mensagens, logger | backend | P0 | E1-01 |
| E1-10 | Layout do app (sidebar recolhível, header, bottom nav, sheet "Mais") | frontend | P1 | E1-06 |
| E1-11 | Página de login (visual do mockup) | frontend | P1 | E1-06 |
| E1-12 | Headers de segurança | frontend | P1 | E1-01 |
| E1-13 | `supabase init` + `config.toml` | database | P0 | — |

## Etapa 2 — Banco, autenticação e autorização

| Id | Item | Dono | P | Depende |
|---|---|---|---|---|
| E2-01 | Migrations: schema `private`, `profiles` + trigger de cadastro, `families`, `family_members`, `family_invites`, `audit_events`, helpers, policies, grants | database | P0 | E1-13 |
| E2-02 | RPCs `create_family`, `create_family_invite`, `get_invite_preview`, `accept_family_invite`, `revoke_family_invite` | database | P0 | E2-01 |
| E2-03 | pgTAP: privilégios, RLS permitido/negado, auto-promoção, convites | database | P0 | E2-02 |
| E2-04 | Templates de e-mail pt-BR e `/auth/confirm` | database + backend | P0 | E2-01 |
| E2-05 | Actions de auth (cadastro, login, logout, recuperar, redefinir, reenviar) | backend | P0 | E1-09 |
| E2-06 | Actions/queries de família e perfil | backend | P0 | E2-02 |
| E2-07 | Guards `requireUser`/`requireMembership` | backend | P0 | E1-08 |
| E2-08 | Telas: cadastro, recuperar, redefinir, onboarding, convite, início (vazio), família, configurações | frontend | P0 | E2-05, E2-06 |
| E2-09 | Testes de integração das actions | backend | P0 | E2-06 |
| E2-10 | E2E: cadastro→confirmação→onboarding; login/logout; recuperação; convite; tema; mobile | frontend | P0 | E2-08 |
| E2-11 | Integração, security gate, revisão | orchestrator | P0 | todos |

## Etapa 3 — Contas, categorias e transações

| Id | Item | P | Depende |
|---|---|---|---|
| E3-01 | Confirmar matriz de permissões (usuário). Apresentada; segue como está, salvo objeção | P0 | — |
| E3-02 | `src/lib/money` (parseBRL com `allowNegative`, formatBRL, `toBRLInput`, conversões, allocate) + testes da tabela de `financial-definitions.md` §1 | P0 | — |
| E3-03 | `src/lib/dates` (hoje em America/Sao_Paulo via `Intl`, períodos). `date-fns` entra pelo `shadcn add calendar`; `@date-fns/tz` não é instalado | P0 | — |
| E3-04 | Migrations `accounts`, `categories` (+ seed em `create_family` e backfill), `transactions` com FKs compostas, triggers de invariantes e de estorno, auditoria por trigger (ADR-0018) | P0 | E3-01 |
| E3-05 | `account_balances` (D1/D3), `period_summary` (D4) e pgTAP de regressão R1, R2, R3, R4, R7, R8 (R5 → Etapa 5; R6 → unit de `allocate`) | P0 | E3-04 |
| E3-06 | CRUD de contas (criar, editar, arquivar, saldo inicial); transferência atômica (uma linha) | P0 | E3-04 |
| E3-07 | Categorias: listar, criar, editar, arquivar | P1 | E3-04 |
| E3-08 | Transações: criar/editar/excluir lógico/estornar, `idempotency_key`, filtros, busca, ordenação, paginação, histórico (audit) | P0 | E3-04 |
| E3-09 | Onboarding: passo "primeira conta + saldo inicial" | P0 | E3-06 |
| E3-10 | Cartão de crédito (tipo de conta, limite, fechamento/vencimento) | P1 | E3-06 |

## Etapa 4 — Dashboard (contrato `contracts/etapa-4.md`; ADR-0020, ADR-0021)

| Id | Item | Dono | P | Depende |
|---|---|---|---|---|
| E4-01 | `monthly_cash_flow` e `category_totals` (`security invoker`) + pgTAP R9–R11 | database | P0 | E3 |
| E4-02 | Recharts (última estável) + atualização de dependências atrasadas; `src/components/charts/**` acessíveis (tabela, legenda em texto, carga sob demanda) | design-system | P0 | — |
| E4-03 | `src/modules/reports` (período D20, comparação D3/D4, agrupamento D16, definições dos indicadores), `listRecentTransactions` | backend | P0 | E4-01 |
| E4-04 | `/inicio`: saldo total + variação, faturas em aberto, receitas/despesas/resultado + variação, categorias (rosca), fluxo de 6 meses (barras), últimas transações, filtro de período, estados vazios; blocos Próximos vencimentos e Metas com estado vazio informativo | frontend | P0 | E4-02, E4-03 |
| E4-05 | E2E desktop/mobile (cenários A, B e C da spec), troca de usuário no mesmo navegador (AB-80) | frontend | P0 | E4-04 |

"Atividade recente da família" (spec §7.2) vai para a tela de atividade da Etapa 7 (ADR-0020 §5).

## Etapa 5 — Contas a pagar, recorrências e orçamentos (contrato `contracts/etapa-5.md` v1.1; ADR-0022, ADR-0023, ADR-0024) — **concluída (2026-10-24, E5-01..07)**

Emendas pós-revisão (migration `20261024101100`, ADR-0023 §5–§8): SEC-19..22 corrigidos (`.claude/factory/project-memory/security/achados.md`).
Pendências herdadas (não bloqueiam a etapa):
- `getPendingCommitted` passa a devolver só o "a pagar" (D14: comprometido = despesa pendente); quem somava a receber pendente deve usar `getBillsSummary`.
- `e2e/familia.spec.ts:111` é intermitente sob carga (não relacionado à Etapa 5); estabilizar na Etapa 9.
- TypeScript 7 está bloqueado por `typescript-eslint` (peer). A exceção datada em `.depsignore` depende de decisão do usuário (`policies/dependencies.md`); até lá `pnpm outdated` mostra o pacote.
- O limite de logins do Auth local não é aplicado pelo CLI (`config.toml`); validar o rate limit no projeto hospedado (SEC-4, SEC-10, Etapa 9).

| Id | Item | Dono | P | Depende |
|---|---|---|---|---|
| E5-01 | Colunas de recorrência em `transactions`, redefinição do trigger (transições, `due_date`), RPCs `pay_`/`cancel_pending_transaction`, `pending_summary` | database | P0 | E3 |
| E5-02 | `recurrences` + agenda D12 + `materialize_recurrences` (idempotente, limitada, isolada por série) + propagação de série; pgTAP R5, R13 | database | P0 | E5-01 |
| E5-03 | `budgets` + `budget_progress`; pgTAP R14 | database | P0 | E3 |
| E5-04 | `switch`/`progress` (shadcn), `ProgressMeter`, `SubNav` | design-system | P1 | — |
| E5-05 | Módulos `bills`, `recurrences`, `budgets`; `ensureRecurrencesMaterialized`; `/transacoes` só efetivados; `upcomingBills` no dashboard | backend | P0 | E5-01..03 |
| E5-06 | `/compromissos` (lista, novo com "Repetir", detalhe, editar, pagar, cancelar), `/recorrencias` (lista, editar série, pausar, reativar, encerrar), `/orcamentos` (mês, progresso, meses anteriores, novo, editar, arquivar); Próximos vencimentos no `/inicio` | frontend | P0 | E5-04, E5-05 |
| E5-07 | E2E desktop/mobile; regressão R12–R14 pelos services | frontend / backend | P0 | E5-06 |

Lembretes e alertas de limite (spec §7.6/§7.8) geram notificação só na Etapa 7. Na Etapa 5 o estado aparece na UI.

## Etapa 6 — Metas, divisão de contas e planejamento (contrato `contracts/etapa-6.md` v1.1; ADR-0025, ADR-0026, ADR-0027) — **concluída no código (2026-10-27)**; pendência: **E2E final aguardando Docker**

Começa depois da Etapa 5 integrada (A-db pode adiantar). Dependências novas: nenhuma (`checkbox` do shadcn sobre Base UI).

Estado: migrations `20261024101200`..`101700`, módulos `goals`/`splits`/`planning`, telas `/metas`, `/divisao`, `/planejamento` e card Metas no `/inicio` entregues. Emendas pós-revisão (migration `20261024101700`; ADR-0026 e ADR-0027, "Emendas"): `SPLIT_AMOUNT_TOO_SMALL`, SEC-23 e SEC-25 corrigidos; SEC-24 (limite de volume por família, baixa) aberta e adiada para a Etapa 9 (`.claude/factory/project-memory/security/achados.md`).
Pendências (não mudam o código entregue):
- **E2E final** (`metas`, `divisao`, `planejamento`, `inicio`; desktop e mobile) e `db:reset` + `db:test` do zero com a `101700`: aguardam o Docker Desktop. A etapa só vira "concluída" definitivamente depois deles e do gate.
- `listSettlements.canDelete` não inclui as partes do acerto, que o banco já autoriza (SEC-25); ajuste pequeno de UI, a decidir.
- `docs/permissions.md` §2 ainda não tem a linha "excluir acerto" (partes, owner/admin e autor).

| Id | Item | Dono | P | Depende |
|---|---|---|---|---|
| E6-01 | `goals`, `goal_contributions` (reserva, sem `transaction_id`; lock e acumulado ≥ 0), `goal_summary`; pgTAP R15 | database | P0 | E5 |
| E6-02 | `expense_splits` (sem grant de escrita), `set_transaction_splits`, `allocate_cents`, reescala no `amount`, constraint diferida; `settlements`; `member_balances`; pgTAP R6, R16–R18 | database | P0 | E5 |
| E6-03 | `projected_cash_flow` (pendentes + ocorrências virtuais) | database | P1 | E5 |
| E6-04 | `checkbox`, `GoalIcon`, `ValueSourceBadge` | design-system | P1 | — |
| E6-05 | Módulos `goals`, `splits`, `planning` (domínio D9, D13, D15 em TS puro); metas no dashboard; `memberDisplayName` | backend | P0 | E6-01..03 |
| E6-06 | `/metas` (lista, nova, detalhe com estimativa e histórico, editar, status), `/divisao` (lista, dividir, acertos), `/planejamento` (6 cenários), card Metas no `/inicio`, navegação | frontend | P0 | E6-04, E6-05 |
| E6-07 | E2E desktop/mobile; regressão R15–R19 pelos services | frontend / backend | P0 | E6-06 |

## Etapa 7 — Relatórios, notificações e família (contrato `contracts/etapa-7.md`; ADR-0028, ADR-0029, ADR-0030)

Começa depois da Etapa 6 integrada (A-db pode adiantar). Dependências novas: nenhuma.

| Id | Item | Dono | P | Depende |
|---|---|---|---|---|
| E7-01 | `change_member_role`, `transfer_ownership`, `remove_family_member`, `leave_family` (revogam convites de quem sai), auditoria do nome da família | database | P0 | E6 |
| E7-02 | `notifications` + `refresh_notifications()` (sob demanda, idempotente, sem parâmetros) | database | P0 | E6 |
| E7-03 | `account_flows`, `member_expense_totals`; pgTAP R20 | database | P0 | E6 |
| E7-04 | `HorizontalBarChart` | design-system | P1 | — |
| E7-05 | `reports` (período D21, seis relatórios com os serviços do E4), `notifications`, `activity`, ações de família; "Ex-integrante" em todos os módulos | backend | P0 | E7-01..03 |
| E7-06 | `/relatorios/**`, `/notificacoes`, sino no cabeçalho, `/familia` (papéis, transferência, remoção, saída, renomear), `/familia/atividade`, "Agora não" no convite | frontend | P0 | E7-04, E7-05 |
| E7-07 | E2E desktop/mobile; troca de usuário no mesmo navegador em `/relatorios` | frontend | P0 | E7-06 |

Fora das Etapas 6–7 (registrado): aporte ligado a transferência (ADR-0025), notificação "convite recebido", e-mail e push (ADR-0029; Etapa 9 com SMTP),
exportação de relatório, evolução do patrimônio mês a mês, excluir família.

## Etapa 8 — PWA, acessibilidade e responsividade

Manifest + service worker sem cache de dados financeiros entre sessões/famílias; auditoria a11y (teclado,
leitores de tela, alternativas textuais de gráficos, reduced motion); revisão mobile de todas as telas.

## Incremento planejado — OAuth Google

Login e cadastro com Google (Supabase Auth, provedor `google`; PKCE pelo servidor, sem cliente no navegador, ADR-0016).
O botão "Continuar com Google" do mockup **só aparece quando o provedor estiver configurado** (variável de ambiente
de servidor; sem ela a tela de login continua sem OAuth). Depende de o usuário criar as credenciais no Google Cloud
(client id/secret e URIs de redirect). Apple fica fora do plano. Entra na primeira etapa depois de as credenciais existirem.

## Etapa 9 — Hardening, homologação e entrega

Projeto Supabase em nuvem, SMTP real (provedor a escolher pelo usuário), URLs de redirect, OAuth Google (incremento acima),
SEC-4 (IP e HMAC de e-mail no log; troca de senha como evento de auditoria), SEC-10 (limites de e-mail e `max_frequency` de produção; os limites de 300 do `config.toml` são só locais), CSP completa, rate limit de
actions, revisão de dependências, backup/recuperação documentados e verificados, CI (GitHub Actions se houver
repositório), deploy, exclusão de conta (LGPD), checklist final.

## Pendências registradas

| # | Pendência | Quando decidir |
|---|---|---|
| 1 | Spec truncada na §15 ("Regras de execução", item 2+) | aberta; confirmar com o usuário |
| 2 | Aprovação da matriz de permissões das Etapas 3+ | **resolvida** (2026-10-24): a matriz das Etapas 4–7 foi aprovada como está (o usuário pediu execução autônoma) |
| 3 | OAuth Google (incremento planejado acima; Apple fora) | quando o usuário fornecer as credenciais do Google Cloud |
| 7 | Provedor de SMTP de produção | usuário; Etapa 9 |
| 8 | SEC-4 e SEC-10 | Etapa 9 |
| 4 | Imagem de capa de metas (mockup) — ícone no MVP; upload exige Storage + ADR | **resolvida** (ADR-0025 §6): ícone de lista fechada; upload fora |
| 10 | "Convite recebido" (spec §7.14) sem e-mail não tem destinatário na família | Etapa 9, com SMTP (ADR-0029 §5) |
| 11 | Acerto entre integrantes declarado por uma parte, sem aceite da outra | risco aceito (auditoria + notificação); reavaliar com uso real |
| 5 | Exclusão de conta / anonimização (LGPD) | Etapa 9 |
| 6 | `member` vê atividade recente da família? | **resolvida** (ADR-0020 §5): não; a atividade é tela da Etapa 7, e a auditoria segue só para owner/admin, como na matriz |
| 9 | `data-model.md` §2 e §5.1–5.5 ainda descrevem a Etapa 0 (cores antigas, RPCs `create_transfer`/`reverse_transaction`) | architect, na Fase C da Etapa 4 (até lá prevalecem os contratos) |
