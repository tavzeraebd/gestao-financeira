# Critérios de aceite — Núcleo

Versão 1.0 (Etapa 0). Cada critério é verificável por comando, teste automatizado ou inspeção objetiva.
Ids: `CA-E<etapa>-<nn>`. `AB-nn` = caso de abuso de `threat-model.md`. `Dn`/`Rn` = `financial-definitions.md`.
Verificação: **U** unit (Vitest) · **I** integração (Vitest + Supabase local) · **T** pgTAP · **E** Playwright · **G** grep/comando.

## Etapa 1 — Fundação técnica e design system

| Id | Critério | Verificação | Dono |
|---|---|---|---|
| CA-E1-01 | `pnpm install` em clone limpo sem erro; `pnpm lint`, `pnpm typecheck`, `pnpm build` passam | G | frontend |
| CA-E1-02 | `tsconfig` com `strict` e `noUncheckedIndexedAccess`; `grep -rn ": any\|as any\|@ts-ignore\|@ts-nocheck" src` vazio | G | todos |
| CA-E1-03 | Sem `tailwind.config.*`; tokens via `@theme` em `globals.css` | G | design-system |
| CA-E1-04 | Tema claro: `--primary: #84CC16`; tema escuro: os 10 valores Rocket presentes e nenhum hex alheio à paleta no bloco `.dark` | G | design-system |
| CA-E1-05 | Nenhum hex/`rgb(`/`hsl(`/`bg-[#` em `src/**/*.tsx` | G | todos |
| CA-E1-06 | Trocar tema aplica/remove `.dark` no `<html>`, grava `nucleo-theme`, sobrevive a reload; opção "Sistema" segue `prefers-color-scheme` | U + E | design-system / frontend |
| CA-E1-07 | Contraste medido ≥ 4.5:1 para os pares de texto listados no contrato §4.2, nos dois temas, documentado em `docs/design-system.md` | inspeção | design-system |
| CA-E1-08 | `Button` com `loading` fica desabilitado e `aria-busy="true"`; foco visível em todos os controles | U | design-system |
| CA-E1-09 | Layout: ≥ `lg` sidebar expandida; `md`–`lg` recolhida a ícones com `SidebarTrigger`; < `md` bottom nav + sheet "Mais"; sem rolagem horizontal em 360px | E (desktop + mobile) | frontend |
| CA-E1-10 | Login renderiza conforme mockup tela 1 (logo, slogan, e-mail, senha com mostrar/ocultar, Entrar, Criar conta), sem botões OAuth | E + inspeção | frontend |
| CA-E1-11 | Headers `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy` (e `no-referrer` em `/convite/*`) presentes | E (inspeção de resposta) | frontend |
| CA-E1-12 | `src/lib/env/*` falha na inicialização com variável ausente; nenhuma variável sem `NEXT_PUBLIC_` é lida em código cliente | U + G | backend |
| CA-E1-13 | `.env.example` existe sem valores; `.env*.local` ignorado pelo git | G | backend / frontend |
| CA-E1-14 | `prefers-reduced-motion`: sem animação de transição de sidebar/skeleton/spinner (classes `motion-safe:`) | inspeção | design-system |
| CA-E1-15 | `pnpm exec supabase --version` responde; `supabase/config.toml` versionado | G | frontend / database |

## Etapa 2 — Banco, autenticação e autorização

### E2-DB — pgTAP (`pnpm db:reset && pnpm db:test`)

| Id | Critério | AB |
|---|---|---|
| CA-E2-01 | Toda tabela de `public` com RLS habilitado (consulta a `pg_class.relrowsecurity`) | AB-16 |
| CA-E2-02 | `anon` sem nenhum privilégio em tabelas de `public` e sem EXECUTE em funções de `public`/`private` | AB-15 |
| CA-E2-03 | Toda função `security definer` em `public`/`private` tem `search_path` configurado vazio (`proconfig`) | AB-17 |
| CA-E2-04 | Inserir em `auth.users` cria `profiles` com `display_name` do metadata (cortado em 80; fallback parte local do e-mail) | — |
| CA-E2-05 | `create_family` cria família + vínculo `owner` + `audit_events(family.created)`; segunda chamada → `ALREADY_IN_FAMILY` e nada novo persiste | AB-20, AB-52 |
| CA-E2-06 | `create_family` como `authenticated` sem `sub` nas claims → `NOT_AUTHENTICATED`; como `anon` → 42501; nome vazio/81 chars → `INVALID_INPUT` | AB-15 |
| CA-E2-07 | Usuário B (outra família) e usuário C (sem família) leem 0 linhas de `families`, `family_members`, `family_invites`, `audit_events` de A e 0 `profiles` dos integrantes de A | AB-10, AB-11, AB-19 |
| CA-E2-08 | Integrante lê a própria família, todos os vínculos dela e os perfis dos co-integrantes | — |
| CA-E2-09 | Vínculo com `status='removed'` (alterado como postgres) perde leitura imediatamente | AB-12 |
| CA-E2-10 | `authenticated` não consegue `insert`/`update`/`delete` em `family_members` (42501); papel continua igual | AB-21, AB-22 |
| CA-E2-11 | Member não renomeia a família; owner renomeia; admin não renomeia; ninguém apaga família | — |
| CA-E2-12 | Segundo owner ativo na mesma família viola índice único | AB-27 |
| CA-E2-13 | Owner cria convite `admin` e `member`; admin cria `member`; admin com `admin` → `FORBIDDEN`; member → `FORBIDDEN` | AB-23, AB-24 |
| CA-E2-14 | Convite armazena `token_hash` = sha256 do token devolvido; `select token_hash` por authenticated → 42501; token não aparece em nenhuma coluna | AB-31 |
| CA-E2-15 | 21º convite pendente → `INVITE_LIMIT_REACHED` | AB-36 |
| CA-E2-16 | `get_invite_preview`: token válido → nome da família, papel, validade, `pending`; token aleatório → `INVITE_NOT_FOUND`; `authenticated` sem `sub` → `NOT_AUTHENTICATED`; `anon` → 42501 | AB-30, AB-38 |
| CA-E2-17 | `accept_family_invite` válido: cria vínculo com o papel do convite, marca `accepted_*`, audita `member.joined` | — |
| CA-E2-18 | Aceite repetido → `INVITE_ALREADY_USED`; expirado (ajustar `expires_at` como postgres) → `INVITE_EXPIRED`; revogado → `INVITE_REVOKED`; e-mail diferente do vinculado → `INVITE_EMAIL_MISMATCH`; usuário já em família → `ALREADY_IN_FAMILY`; em todos, nada persiste | AB-32..34, AB-37, AB-20 |
| CA-E2-19 | `revoke_family_invite`: owner revoga qualquer; admin revoga `member` e recebe `FORBIDDEN` em convite `admin`; member → `FORBIDDEN`; convite de outra família → `INVITE_NOT_FOUND`; revogar duas vezes é idempotente | AB-25 |
| CA-E2-20 | `audit_events`: owner/admin leem; member lê 0; ninguém insere/atualiza/apaga via API; metadata dos eventos da Etapa 2 sem chaves `email`, `token`, `name`, `display_name` | AB-60..62 |
| CA-E2-21 | Usuário só atualiza o próprio `profiles.display_name`/`avatar_url`; não altera `id`; não altera perfil alheio | — |
| CA-E2-22 | Funções `private.*` não acessíveis pela API REST (`/rest/v1/rpc/is_family_member` → 404) | AB-18 (I) |

### E2-BE — servidor (U/I)

| Id | Critério | Verificação |
|---|---|---|
| CA-E2-30 | `safeNextPath` rejeita `//x`, `/\x`, `https://x`, `javascript:x`, caminhos fora da allowlist; aceita `/familia`, `/convite/<hex>` | U (AB-04) |
| CA-E2-31 | `runAction`: entrada inválida → `VALIDATION_ERROR` + `fieldErrors`; sem sessão → `UNAUTHENTICATED`; `redirect()` relançado; exceção → `INTERNAL_ERROR` com `requestId`, sem texto do Postgres | U (AB-50, AB-53) |
| CA-E2-32 | Mapeamento de todos os códigos `P0001`/`42501`/`23505`/AuthError para `ErrorCode`, com mensagem pt-BR de `error-messages.ts` | U |
| CA-E2-33 | Logger: só campos da allowlist; `token`, `email`, `password`, `authorization`, `cookie` nunca serializados | U (AB-42) |
| CA-E2-34 | `signUp` com e-mail já existente responde igual a e-mail novo; `requestPasswordReset` idem | I (AB-02) |
| CA-E2-35 | `signIn` antes de confirmar → `EMAIL_NOT_CONFIRMED`; senha errada → `INVALID_CREDENTIALS` | I (AB-03, AB-01) |
| CA-E2-36 | Actions de família reproduzem CA-E2-05/13/17/18 pela camada do app (usuários criados via Admin API no setup) | I |
| CA-E2-37 | `getFamilyOverview` retorna só a família do chamador; nenhuma action aceita `family_id` (schema não tem o campo) | I + G (AB-26) |
| CA-E2-38 | `grep -rn "SUPABASE_SECRET_KEY\|service_role\|getSession(" src` vazio; arquivos de servidor com `import "server-only"`; `.next/static` sem a secret key após build | G (AB-40, AB-43) |

### E2-E2E — Playwright (Supabase local + Mailpit; desktop e mobile)

| Id | Critério | Cenário |
|---|---|---|
| CA-E2-50 | Cadastro → tela "Confirme seu e-mail" → link do Mailpit → `/auth/confirm` → `/onboarding` → cria família → `/inicio` com "Olá, {nome}!" e estado vazio sem números | A (parcial) |
| CA-E2-51 | Login com senha errada mostra erro genérico, mantém e-mail digitado; botão em loading impede duplo envio | AB-01, AB-52 |
| CA-E2-52 | Acesso direto a `/inicio` sem sessão → `/login?next=%2Finicio`; após login volta a `/inicio` | AB-07 |
| CA-E2-53 | Logout → rota privada redireciona ao login; voltar no navegador não mostra dados | AB-06 |
| CA-E2-54 | Recuperação: pedido → link do Mailpit → `/redefinir-senha` → nova senha → login com a nova; abrir `/redefinir-senha` sem sessão → `/recuperar-senha`; link usado de novo → `/login?erro=link_invalido` | AB-05, AB-08 |
| CA-E2-55 | Owner gera convite em `/familia`, link exibido uma vez; usuário novo abre o link deslogado → cria conta/entra → aceita → vê a família e os integrantes; owner vê o novo integrante | E (permitido) |
| CA-E2-56 | Usuário de outra família não vê a família alheia em nenhuma tela; convite já usado mostra "já utilizado"; convite revogado mostra "revogado" | E (negado), AB-32/33 |
| CA-E2-57 | Member em `/familia` não vê formulário de convite nem lista de convites | UX (autorização real em CA-E2-13) |
| CA-E2-58 | Tema escuro escolhido em `/configuracoes` persiste após reload e logout/login no mesmo navegador; dados exibidos iguais nos dois temas | G |
| CA-E2-59 | Em viewport 390×844: login, cadastro, onboarding, início, família e configurações sem rolagem horizontal (`scrollWidth <= clientWidth`), bottom nav visível, controles ≥ 40px | F (parcial) |
| CA-E2-60 | Resposta de `/convite/<token>` com `Referrer-Policy: no-referrer` | AB-35 |

## Etapa 3 — Contas, categorias e transações (contrato `contracts/etapa-3.md`)

### E3-DB — pgTAP (`pnpm db:reset && pnpm db:test`)

| Id | Critério | AB |
|---|---|---|
| CA-E3-01 | `accounts`, `categories` e `transactions` com RLS; `anon` sem privilégio; os grants de `authenticated` são exatamente os da §3.1 (por coluna); `account_balances` e `period_summary` são `security invoker`; nenhum `delete` em accounts/transactions | AB-15, AB-16 |
| CA-E3-02 | Usuário B (outra família) e C (sem família) leem 0 linhas de contas, categorias e lançamentos de A; `account_balances()` e `period_summary()` de B não incluem nada de A | AB-10, AB-11 |
| CA-E3-03 | Inserir um lançamento na própria família com `account_id`, `category_id` ou `assigned_member_id` de A → `23503`; inserir com `family_id` de A → `42501` | AB-13, AB-14 |
| CA-E3-04 | Member não cria nem altera contas e categorias (`42501` ou 0 linhas); owner e admin conseguem; ninguém altera `type` de conta ou categoria | — |
| CA-E3-05 | Member cria lançamento; `created_by` é sempre o chamador (não está no grant: `42501` ao enviar) | AB-70 |
| CA-E3-06 | Member edita e exclui (logicamente) os próprios lançamentos; nos de outros → 0 linhas; owner/admin em qualquer um; `delete` físico → `42501` para todos | AB-71 |
| CA-E3-07 | Invariantes: categoria de tipo diferente → `CATEGORY_TYPE_MISMATCH`; transferência com categoria, sem destino ou com destino = origem → `23514`; conta ou categoria arquivada → `ACCOUNT_ARCHIVED`/`CATEGORY_ARCHIVED`; data anterior ao saldo inicial → `DATE_BEFORE_OPENING_BALANCE`; `paid` com data futura em São Paulo → `FUTURE_DATE_NOT_ALLOWED`; `amount <= 0` → `23514` | AB-72 |
| CA-E3-08 | Exclusão lógica: o trigger fixa `deleted_at` e `deleted_by = auth.uid()`; uma linha excluída não é atualizável (0 linhas), não volta a valer e continua legível | AB-74 |
| CA-E3-09 | Estorno: mesmo tipo, conta e categoria exigidos; Σ estornos ≤ original (dois estornos concorrentes que somados passam do valor: o segundo falha com `REVERSAL_EXCEEDS_REMAINING`); estorno de transferência, de estorno, de excluído ou de pendente → `INVALID_REVERSAL`; member estornando lançamento alheio → `42501` | AB-73 |
| CA-E3-10 | Original com estorno ativo: `amount`, `transaction_date`, `account_id` e `category_id` travados, e a exclusão é bloqueada (`TRANSACTION_HAS_REVERSALS`); os campos financeiros do estorno também ficam travados | — |
| CA-E3-11 | `unique (family_id, idempotency_key)`: o segundo insert com a mesma chave → `23505` e nada muda | AB-52 |
| CA-E3-12 | `create_family` semeia as 10 categorias de despesa e as 6 de receita (`is_default`, cores `chart-*`, ícones da allowlist); as famílias existentes recebem o backfill uma vez (reaplicar não duplica) | — |
| CA-E3-13 | Categorias: só 1 nível, pai do mesmo tipo (`INVALID_CATEGORY_PARENT`); nome único entre as ativas por (tipo, pai), sem diferenciar maiúsculas; excluir com lançamento (inclusive excluído) → `23503`; arquivar pai com filha ativa → `CATEGORY_HAS_CHILDREN` | — |
| CA-E3-14 | Contas: cartão exige dias de fechamento e vencimento e `opening_balance <= 0`; `credit_limit` só em cartão; nome único entre as ativas; mover `opening_balance_date` para depois de um lançamento → `OPENING_DATE_AFTER_TRANSACTIONS` | — |
| CA-E3-15 | Auditoria: `transaction.updated` (`changed`/`old`/`new` só de campos financeiros), `transaction.deleted`, `transaction.reversed`, `account.opening_balance_changed`, `account.archived`, `account.reactivated`, `category.archived`; metadata sem `description`, `notes`, `email`, `name`; member lê 0 eventos | AB-60..62, AB-75 |
| CA-E3-16 | Regressão no banco (`account_balances`/`period_summary`): R1, R2, R3, R4, R7 e R8 de `financial-definitions.md` §3 com os valores exatos; todos os montantes devolvidos como `text` | — |

### E3-BE — servidor (U/I)

| Id | Critério | Verificação |
|---|---|---|
| CA-E3-30 | `lib/money`: toda a tabela de `financial-definitions.md` §1; `allowNegative`; `toBRLInput`; `fromDbNumeric`/`toDbNumeric` (ida e volta); limite de faixa; `allocate` com soma exata (R6: 100,00/3 → 33,34 + 33,33 + 33,33; teste de propriedade); `percentOf(_, 0) = null` | U |
| CA-E3-31 | `lib/dates`: `today(new Date("2026-10-24T02:30:00Z"))` → `2026-10-23`; `parseISODate("2026-02-30")` → `null`; `formatDateBR`; `startOfMonth`/`endOfMonth` em fevereiro bissexto | U |
| CA-E3-32 | Schemas: valor `0`, vazio, `-5`, `1,234.56` e `10,999` rejeitados com mensagem no campo `amount`; transferência com origem = destino → erro em `destinationAccountId`; cartão sem dia de fechamento → erro no campo; `transactionFiltersSchema` ignora valores inválidos sem lançar; nenhum schema tem `familyId`/`family_id` | U + G |
| CA-E3-33 | `toAppError` mapeia os 11 códigos `P0001` novos, `23514` → `VALIDATION_ERROR`; o service converte `23503` (categoria) → `CATEGORY_IN_USE` e `23505` (nome) → `NAME_TAKEN` com `fieldErrors.name`; repetir `idempotencyKey` devolve `ok` com o mesmo `id` | U + I |
| CA-E3-34 | Actions pela camada do app: owner/admin/member conforme a matriz; member editando lançamento alheio → `FORBIDDEN`; lançamento de outra família → `NOT_FOUND`; outsider sem família → `/onboarding` ou `UNAUTHENTICATED` | I |
| CA-E3-35 | **R1 (spec §13 "regressão financeira")** pelos services: saldo inicial 1.000,00 + receita 500,00 − despesa 200,00 + transferência 100,00 corrente→poupança → `consolidatedBalance` 1.300,00, corrente 1.200,00, poupança 100,00, `getPeriodSummary` receitas 500,00, despesas 200,00, resultado 300,00 (a transferência não altera receitas, despesas nem consolidado); depois R2, R7 e R8 pelas actions | I |
| CA-E3-36 | `listTransactions`: `total`/`pageCount` corretos com 45 lançamentos e 20 por página; ordem padrão data desc com desempate estável; cada filtro (período, tipo, conta inclusive como destino, categoria inclusive filhas, responsável e `nenhum`, `q` com `%`/`_` literais); excluídos fora, estornos dentro | I |
| CA-E3-37 | `grep -rnE "parseFloat\|toFixed\("` em `src/lib/money` e nos módulos financeiros vazio; repositories leem montantes só com `::text` ou funções `text` | G |
| CA-E3-38 | `proxy` redireciona `/transacoes`, `/contas` e `/categorias` sem sessão; `safeNextPath` aceita essas rotas | U |
| CA-E3-39 | Arquivos de servidor novos com `import "server-only"`; nenhum import de `service`/`repository`/`@/lib/supabase/*` em arquivo `"use client"` | G |

### E3-E2E — Playwright (desktop e mobile)

| Id | Critério | Cenário |
|---|---|---|
| CA-E3-50 | Usuário novo → família → `/inicio` "Cadastre sua primeira conta" → conta corrente com saldo inicial 1.000,00 → `/contas` mostra R$ 1.000,00 e "Saldo total" R$ 1.000,00 | A (sem o dashboard, que é da Etapa 4) |
| CA-E3-51 | Em `/transacoes/nova`, os valores `0`, vazio, `-5` e `1,234.56` mostram erro no campo Valor e não salvam; uma despesa de 200,00 salva aparece em 1º na lista; a conta passa a R$ 800,00 | B |
| CA-E3-52 | Receita 500,00 e transferência 100,00 corrente→poupança (saldo inicial 0): corrente R$ 1.200,00, poupança R$ 100,00, Saldo total R$ 1.300,00 (R1 na tela) | C |
| CA-E3-53 | Editar a despesa de 200,00 para 250,00 atualiza o saldo; o histórico do owner mostra "R$ 200,00 → R$ 250,00"; um estorno de 50,00 devolve 50,00; excluir o estorno e depois a despesa (com confirmação) restaura o saldo e tira a despesa da lista | D |
| CA-E3-54 | Filtros, busca, ordem e página ficam na URL e sobrevivem ao reload e ao "voltar"; com 25 lançamentos há 2 páginas | — |
| CA-E3-55 | Duplo clique em "Salvar despesa" cria um único lançamento | AB-52 |
| CA-E3-56 | Member: cria lançamento; não vê Editar/Excluir/Estornar nos lançamentos de outros; `/transacoes/<id-alheio>/editar` → página não encontrada; não vê "Nova conta" nem ações de categoria | E (UX; a autorização real está em CA-E3-04/06) |
| CA-E3-57 | Outsider (outra família) abrindo `/transacoes/<id de A>` → página não encontrada | E (negado) |
| CA-E3-58 | Em 390×844: `/transacoes` em cartões; formulário completo por toque (controle segmentado, selects, data); `/contas` e `/categorias` sem rolagem horizontal; bottom nav com Transações e Contas; controles ≥ 40px | F |
| CA-E3-59 | Falha de rede no envio (rota da action abortada) mostra erro e mantém os valores digitados | spec §7.3 |
| CA-E3-60 | Sessão expirada (cookies limpos) e envio → `/login?motivo=sessao_expirada&next=%2Ftransacoes%2Fnova` | ADR-0017 |
| CA-E3-61 | Cartão com limite 2.000,00: compra de 300,00 → dívida R$ 300,00 e limite disponível R$ 1.700,00, Saldo total inalterado; pagamento da fatura (transferência corrente→cartão, 300,00) → dívida 0 e Saldo total −300,00 | R4, D8 |
| CA-E3-62 | Categorias: criar "Pets" (despesa) com ícone e cor; ela aparece no formulário; arquivada some do formulário e continua nos lançamentos antigos; excluir uma categoria com lançamento mostra a orientação de arquivar | — |

### E3-DS — design-system

| Id | Critério | Verificação |
|---|---|---|
| CA-E3-70 | `shadcn add` não sobrescreveu `button.tsx`/`input.tsx` (o RTL de `Button loading` continua verde); `package.json` ganhou só `react-day-picker` e `date-fns`; sem o pacote `cn` | G + U |
| CA-E3-71 | RTL: `MoneyInput` reformata `1234,5` para `1.234,50` no blur, mantém texto inválido e tem `inputMode="decimal"`; `DatePicker` mostra "Hoje", respeita `max` e funciona por teclado; `SegmentedControl` tem semântica de radio e responde às setas; `ResponsiveList` renderiza tabela e cartões; `PaginationNav` marca `aria-current`; `Money` mostra o sinal em texto | U |
| CA-E3-72 | Nenhum hex, `rgb(` ou `hsl(` em `src/**/*.tsx`; nenhum token novo; cores de categoria só `chart-1..6` | G |
| CA-E3-73 | `docs/design-system.md` documenta os 9 componentes, o padrão de lista responsiva e o contraste de `chart-1..6` sobre `card` nos dois temas | inspeção |

## Etapa 4 — Dashboard e experiência financeira básica (contrato `contracts/etapa-4.md`)

### E4-DB — pgTAP

| Id | Critério | AB |
|---|---|---|
| CA-E4-01 | `monthly_cash_flow` e `category_totals` com `prosecdef = false`, `provolatile = 's'`, `proconfig` com `search_path=""`; `anon` sem EXECUTE (42501); `authenticated` com EXECUTE; nenhuma tem parâmetro de família | AB-81, AB-15 |
| CA-E4-02 | B (outra família) e C (sem família) recebem 0 linhas de `category_totals` e só zeros de `monthly_cash_flow` para um intervalo que cobre todos os lançamentos de A | AB-81, AB-10, AB-11 |
| CA-E4-03 | `INVALID_INPUT` (`P0001`): datas nulas, `p_from > p_to`, `monthly_cash_flow` com 25 meses, `category_totals` com `p_type` `transfer` ou `x` | AB-82 |
| CA-E4-04 | R9: subcategoria somada à pai; estorno abate no mês do estorno (categoria negativa devolvida); transferência, pendente, cancelado e excluído fora; total 0 omitido; categoria arquivada incluída | — |
| CA-E4-05 | R11: todos os meses da janela presentes e em ordem, com `0.00` nos meses sem movimento; Σ dos meses = `period_summary` do intervalo (receitas, despesas e resultado) | — |
| CA-E4-06 | Montantes devolvidos como `text`; dois lançamentos de 99.999.999,99 no mesmo mês somados exatos (`199999999.98`) | AB-84 |
| CA-E4-07 | `010_security_baseline` e os testes 100–170 continuam verdes | AB-16, AB-17 |

### E4-BE — servidor (U/I)

| Id | Critério | Verificação |
|---|---|---|
| CA-E4-30 | `dashboardFiltersSchema` nunca lança: `periodo` inválido → `mes_atual`; `personalizado` sem `de`/`ate`, com `de > ate`, com mais de 366 dias, `de < 2000-01-01` ou `ate` depois do fim do mês atual → `mes_atual` | U (AB-82) |
| CA-E4-31 | D20/D4 com `today = 2026-10-24`: `mes_atual` = 01/10–31/10, anterior = 01/09–30/09; `mes_anterior` = setembro, anterior = agosto; janeiro → dezembro do ano anterior; personalizado 10/10–19/10 → anterior 30/09–09/10; personalizado 01/02–28/02 → anterior = janeiro inteiro; `cashFlowWindow(2026-10-31)` = 01/05–31/10 | U |
| CA-E4-32 | `compare`: anterior 0 → `percent null`; anterior negativo usa o módulo (R10: −200,00 → +250,00 = +225,0%); `delta` exato em centavos | U |
| CA-E4-33 | `buildCategoryBreakdown`: 6 positivas → 6 fatias sem "Outras"; 7 → 5 + "Outras" com a soma exata; negativas fora das fatias e dentro de `rows`; Σ percentuais das fatias = 100 (±0,1 de arredondamento de exibição); categoria desconhecida → "Categoria removida" | U |
| CA-E4-34 | `getDashboard` (R1 no mês atual, mês anterior vazio): consolidado 1.300,00 com anterior 1.000,00 (saldo inicial, D3) → +300,00 e +30,0%; receitas 500,00 (anterior 0 → `null`); despesas 200,00; resultado 300,00; transferência fora; `cashFlow` com 6 meses; `recentTransactions` com 3 itens (inclui a transferência) | I |
| CA-E4-35 | Isolamento pela camada do app: o dashboard de B não contém valor nem lançamento de A; outsider → `/onboarding`; member vê os mesmos números que o owner | I (AB-81) |
| CA-E4-36 | Agregado acima do inteiro seguro → `AppError("INTERNAL_ERROR")` (o `RangeError` não vaza e nenhum número é exibido) | U (AB-84) |
| CA-E4-37 | `grep -rnE "sumCents\|addCents\|subCents\|negCents\|percentOf"` em `src/modules/reports/components`, `src/components/charts` e `src/app/(app)/inicio` vazio; `grep -rnE "parseFloat\|toFixed\("` em `src/modules/reports` vazio | G (AB-84) |
| CA-E4-38 | `grep -rnE "use cache\|unstable_cache\|revalidateTag\|localStorage\|sessionStorage\|useSWR\|react-query\|audit_events"` em `src/modules/reports`, `src/components/charts` e `src/app/(app)/inicio` vazio; `next.config.ts` sem `cacheComponents` | G (AB-80, AB-85) |
| CA-E4-39 | `getDashboard` faz um conjunto fixo de consultas em paralelo (sem laço por conta ou por categoria), e nenhuma traz mais que 5 lançamentos; `listRecentTransactions` limita a 1..20 | inspeção + I |

### E4-E2E — Playwright (desktop e mobile)

| Id | Critério | Cenário |
|---|---|---|
| CA-E4-50 | Usuário novo → família → `/inicio` "Cadastre sua primeira conta" (sem números) → conta corrente com saldo inicial 1.000,00 → `/inicio` mostra Saldo total R$ 1.000,00, o banner "Registre seu primeiro lançamento" e os gráficos em estado vazio (nenhum gráfico desenhado) | A (completo) |
| CA-E4-51 | Receita 500,00, despesa 200,00 em Alimentação e transferência 100,00 → `/inicio`: Saldo total R$ 1.300,00, Receitas R$ 500,00, Despesas R$ 200,00, Resultado R$ 300,00; legenda "Alimentação 100,0%"; "Ver tabela" do fluxo mostra o mês atual com R$ 500,00 / R$ 200,00; a transferência aparece em Últimas transações e não muda receitas nem despesas | B, C |
| CA-E4-52 | "Mês anterior" atualiza a URL (`?periodo=mes_anterior`) e os blocos; personalizado com De/Até pelo `DatePicker` aplica e sobrevive ao reload e ao "voltar"; URL inválida (`?periodo=x&de=2026-13-01`) cai em "Este mês" sem erro | C |
| CA-E4-53 | Variação em texto com sinal ("+30,0% em relação a 30/09/2026"); período anterior zerado → "Sem base de comparação"; nenhuma variação comunicada só por cor ou seta | C |
| CA-E4-54 | Cada gráfico tem título e período visíveis, legenda com nome e valor em texto e "Ver tabela" (teclado, `aria-expanded`), que mostra uma tabela com os mesmos valores; o contêiner do gráfico tem `role="img"` e `aria-label` com o resumo | spec §7.11, §9 |
| CA-E4-55 | Em 390×844: ordem da tela 10 (Saldo total, Receitas e Despesas lado a lado, Resultado, Metas, Próximos vencimentos, Categorias, Fluxo, Últimas); sem rolagem horizontal; os gráficos cabem na largura; filtro de período utilizável por toque | F |
| CA-E4-56 | Trocar o tema não altera nenhum número; no tema escuro os gráficos usam os valores Rocket dos tokens (fill computado igual a `--chart-*`) | G |
| CA-E4-57 | A vê o dashboard, sai; B entra no mesmo navegador → nenhum valor, nome de categoria ou descrição de A no DOM de `/inicio`, nem depois de "voltar" | AB-80 |
| CA-E4-58 | Member vê o dashboard completo, com os mesmos números do owner | E |
| CA-E4-59 | Últimas transações: até 5, do período, cada uma abrindo `/transacoes/[id]`; "Ver todas" leva a `/transacoes?de=…&ate=…` com os filtros aplicados | — |
| CA-E4-60 | Cada indicador tem "Como calculamos" (botão com nome acessível) que abre o texto de `INDICATOR_DEFINITIONS`, coerente com D3/D4/D8/D16/D17/D18 | spec §7.2 |
| CA-E4-61 | Durante a carga, `Skeleton` no lugar dos gráficos (`loading.tsx` e `loading` do `dynamic`); falha de RPC (rota abortada) mostra o `error.tsx` do grupo com `requestId`, sem número parcial | spec §9 |
| CA-E4-62 | "Próximos vencimentos" e "Metas" aparecem como estado vazio informativo, sem número e sem ação que leve a rota inexistente | ADR-0020 §6 |

### E4-DS — design-system

| Id | Critério | Verificação |
|---|---|---|
| CA-E4-70 | `package.json` ganhou só `recharts` (e `react-is` só se o pnpm exigir como peer), além das atualizações de dependências atrasadas; sem `src/components/ui/chart.tsx`; `grep -rn dangerouslySetInnerHTML src` vazio; `pnpm audit` limpo | G (AB-83) |
| CA-E4-71 | RTL: `DonutChart` e `CashFlowBarChart` montam com dados e com lista vazia; `ChartCard` alterna gráfico e tabela por teclado, com `aria-expanded`; os valores da tabela saem em `formatBRL`; nome de categoria com HTML aparece como texto | U (AB-83) |
| CA-E4-72 | `grep -rn "from \"recharts\"" src` só em `src/components/charts/*.tsx` com `"use client"`; as telas importam só `@/components/charts/lazy`; nenhum hex, `rgb(` ou `hsl(` nos gráficos; cor só por `chartColorVar` | G |
| CA-E4-73 | `docs/design-system.md` documenta os gráficos (componentes, acessibilidade, carga sob demanda) e o contraste de `chart-income`, `chart-expense` e `chart-1..6` sobre `card` como componente gráfico (3:1) nos dois temas, com as exceções e a mitigação | inspeção |
| CA-E4-74 | Com `prefers-reduced-motion: reduce`, os gráficos renderizam sem animação | U |

## Etapa 5 — Contas a pagar e receber, recorrências e orçamentos (contrato `contracts/etapa-5.md`)

### E5-DB — pgTAP

| Id | Critério | AB |
|---|---|---|
| CA-E5-01 | `recurrences` e `budgets` com RLS; grants exatamente os do contrato §3.1 (por coluna); `transactions` com os grants da Etapa 3 inalterados; `pay_pending_transaction`, `cancel_pending_transaction` e `materialize_recurrences` são `security definer` com `search_path=""`; `pending_summary` e `budget_progress` são `security invoker`; `anon` sem privilégio em nada novo | AB-15, AB-16, AB-17 |
| CA-E5-02 | B e C leem 0 linhas de `recurrences`/`budgets` de A; `pending_summary`/`budget_progress` de B não contam nada de A; B chamando `pay_`/`cancel_pending_transaction` com id de A → `NOT_FOUND`, e a linha de A fica inalterada; `materialize_recurrences` de B não cria nada para A | AB-90, AB-92 |
| CA-E5-03 | Série ou orçamento com `account_id`/`category_id`/`assigned_member_id` de A na família B → `23503`; `family_id` de A → `42501`; pagar com `p_account_id` de A → `23503` | AB-13, AB-14 |
| CA-E5-04 | Member cria série; edita, pausa e encerra a própria; na alheia, 0 linhas; owner/admin em qualquer uma. Member não cria nem altera orçamento (42501/0 linhas); owner/admin sim. `type`, `frequency`, `interval_count` e `start_date` da série e `category_id`/`start_month` do orçamento não são atualizáveis (42501) | AB-97, AB-98 |
| CA-E5-05 | Pagar: owner, admin, autor e responsável conseguem; outro member → `42501`; pago ou cancelado → `INVALID_STATUS_TRANSITION`; dois pagamentos concorrentes → o segundo falha; data futura → `FUTURE_DATE_NOT_ALLOWED`; antes do saldo inicial → `DATE_BEFORE_OPENING_BALANCE`; conta arquivada → `ACCOUNT_ARCHIVED`; `p_amount` 0 ou nulo → `INVALID_INPUT`; a mesma linha muda (contagem igual), `due_date` preservado; `transaction.paid` auditado (sem `transaction.updated`) | AB-92, AB-93, AB-95 |
| CA-E5-06 | Cancelar: owner, admin e autor conseguem; responsável que não é autor → `42501`; cancelado sai de `account_balances`, `period_summary`, `pending_summary`, `category_totals`, `monthly_cash_flow` e `budget_progress`; qualquer update numa linha cancelada → `INVALID_STATUS_TRANSITION`; `transaction.canceled` auditado | AB-92, AB-94 |
| CA-E5-07 | `update ... set status` por `authenticated` → 42501; insert com `due_date`, `recurrence_id` ou `occurrence_date` → 42501; `pending` de transferência → `23514`; `due_date` = `transaction_date` no insert pendente, nulo no insert pago, acompanha a edição da data enquanto pendente | AB-91, AB-94 |
| CA-E5-08 | R5 por `recurrence_occurrence`: mensal a partir de 31/01/2027 → 31/01, 28/02, 31/03, 30/04/2027; a partir de 31/01/2028 → 29/02/2028; anual a partir de 29/02/2028 → 28/02/2029, 28/02/2030, 29/02/2032; semanal com intervalo 2 → +14 dias; `recurrence_next_on_or_after` correto antes, no dia e depois de uma ocorrência | — |
| CA-E5-09 | Materialização: cria `pending` até o último dia do mês seguinte; a segunda chamada devolve 0 e as contagens não mudam; duas chamadas concorrentes não duplicam; catch-up (`next_occurrence_date` recuado, como postgres) cria os atrasados; `created_by` = autor da série mesmo quando outro integrante chama; respeita `end_date`, o teto de 60 por série e o de 500 por chamada; `anon` → 42501 | AB-90 |
| CA-E5-10 | Série com conta arquivada: falha isolada (`last_failure_code = 'ACCOUNT_ARCHIVED'`), e as outras séries são materializadas; depois de trocar a conta da série, a próxima chamada materializa e limpa a falha; o mesmo com responsável inativo (`INVALID_INPUT`) e com autor sem vínculo (`RECURRENCE_AUTHOR_INACTIVE`) | AB-99 |
| CA-E5-11 | Ocorrência editada (valor, data) ou cancelada não é recriada nem alterada pela materialização seguinte; `occurrence_date` não muda quando a data da ocorrência é editada | — |
| CA-E5-12 | Editar o valor da série atualiza só as intocadas (as passadas, pagas, canceladas, excluídas e editadas ficam iguais); pausar remove as intocadas com data ≥ hoje; reativar recria a partir de hoje, sem atrasados do período pausado; `end_date` remove as intocadas depois do término; 101ª série ativa → `RECURRENCE_LIMIT_REACHED`; `start_date` antes do saldo inicial → `DATE_BEFORE_OPENING_BALANCE`; categoria de outro tipo → `CATEGORY_TYPE_MISMATCH`; auditoria `recurrence.series_updated`/`paused`/`resumed` sem descrição | AB-98 |
| CA-E5-13 | Orçamento: categoria de receita → `CATEGORY_TYPE_MISMATCH`; categoria arquivada na criação ou no desarquivamento → `CATEGORY_ARCHIVED`; dois ativos para a mesma categoria (inclusive "todas", `null`) → `23505`; `start_month` fora do dia 1 → `23514`; limite 0, NaN ou acima do teto → `23514`; arquivar a categoria depois mantém o cálculo; excluir categoria com orçamento → `23503` | AB-96 |
| CA-E5-14 | R14 por `budget_progress` com os valores exatos; mais de 12 meses → `INVALID_INPUT`; mês fora da vigência não aparece | — |
| CA-E5-15 | `pending_summary`: R3 → a pagar 80,00; vencidos contados por `transaction_date < today`; excluídos e cancelados fora | — |
| CA-E5-16 | Metadata de `transaction.paid`, `transaction.canceled` e `recurrence.*` sem `description`, `notes`, `email`, `name`; member lê 0 eventos | AB-60..62 |
| CA-E5-17 | Regressão: R1–R4, R7, R8 (Etapa 3) e R9–R11 (Etapa 4) continuam exatos com pendentes e cancelados no banco; R12 e R13 com os valores exatos | AB-93 |

### E5-BE — servidor (U/I)

| Id | Critério | Verificação |
|---|---|---|
| CA-E5-30 | Schemas: vencimento futuro aceito em `billFormSchema` e data de pagamento futura rejeitada em `payBillSchema`; `repeat: true` exige `frequency` e aceita `intervalCount` 1..12 (0 e 13 rejeitados no campo); `endDate < dueDate` → erro no campo; `startMonth` `2026-13` rejeitado; filtros tolerantes nunca lançam; nenhum schema tem `familyId` | U + G |
| CA-E5-31 | `budgetProgress`: 79,99% `ok`, 80% `attention`, 100% `attention`, 100,01% `exceeded`; realizado negativo → `ok` com disponível maior que o limite; `billStatusOf`: ontem `overdue` com `days = −1`, hoje `due_today`, amanhã `pending`; `frequencyLabel` para os 5 exemplos do contrato | U |
| CA-E5-32 | `toAppError` mapeia `INVALID_STATUS_TRANSITION`, `RECURRENCE_LIMIT_REACHED` e `NOT_FOUND` (`P0001`); `23505` do orçamento → `BUDGET_ALREADY_EXISTS` com `fieldErrors.categoryId`; repetir a `idempotencyKey` de `createBill` (com e sem repetição) devolve `ok` com o mesmo `id` | U + I |
| CA-E5-33 | Pela camada do app: responsável (member) paga; outro member → `FORBIDDEN`; segundo `payBill` → `INVALID_STATUS_TRANSITION`; R12 pelos services (saldo, `getPeriodSummary`, `getBillsSummary`); `createBill` com repetição → as ocorrências aparecem em `listBills` | I (AB-92, AB-93) |
| CA-E5-34 | `listTransactions` devolve só `paid` (pendentes e cancelados fora); `listBills` filtra situação, tipo, vencimento e série, pagina com `total` correto e ordena por vencimento; "Pagos" usa `due_date` e a data do pagamento | I |
| CA-E5-35 | `ensureRecurrencesMaterialized` com a RPC falhando: registra no logger e não lança; `getDashboard` e `listBills` respondem normalmente; chamado uma vez por requisição | U |
| CA-E5-36 | `listUpcomingBills`: vencidos primeiro, depois até hoje + 30 dias, no máximo 5, sem pagos nem cancelados; `getDashboard().upcomingBills` igual | I |
| CA-E5-37 | `getBudgetsOverview`: R14 pelo service (realizado, comprometido, disponível, percentual, estado); `history` com até 3 meses anteriores dentro da vigência; categoria arquivada com `archived: true` | I |
| CA-E5-38 | `proxy` redireciona `/compromissos`, `/recorrencias` e `/orcamentos` sem sessão; `safeNextPath` aceita essas rotas | U |
| CA-E5-39 | Nenhum update de `status` em repository (só as RPCs); `server-only` nos arquivos de servidor; nenhum import de servidor em `"use client"`; `grep -rnE "parseFloat\|toFixed\("` nos módulos novos vazio | G |

### E5-E2E — Playwright (desktop e mobile)

| Id | Critério | Cenário |
|---|---|---|
| CA-E5-50 | Criar "Aluguel" a pagar de 1.200,00 com vencimento daqui a 5 dias → aparece em `/compromissos` (Em aberto, "vence em 5 dias") e em Próximos vencimentos do `/inicio`; Saldo total e despesas inalterados | D6 |
| CA-E5-51 | "Marcar como pago" com os padrões (hoje, 1.200,00, conta prevista) → o saldo da conta cai 1.200,00; o lançamento aparece em `/transacoes` com "Vencimento: …"; `/compromissos` mostra "Pago" na aba Pagos; despesas do dashboard +1.200,00; existe uma única linha | AB-93 |
| CA-E5-52 | Compromisso com vencimento ontem mostra "Vencido" (ícone + texto, "venceu há 1 dia") e continua pendente: nada foi pago automaticamente | spec §7.6 |
| CA-E5-53 | Cancelar com confirmação → "Cancelado"; sai do resumo, dos Próximos vencimentos e dos totais; continua listado em Cancelados | — |
| CA-E5-54 | "Repetir" mensal: as ocorrências até o fim do mês seguinte aparecem; editar o valor de uma ocorrência só muda ela; editar a série muda as outras próximas; pausar tira as próximas não alteradas e reativar as traz de volta; encerrar mostra "Encerrada"; série com conta arquivada mostra "Precisa de atenção" com o próximo passo | AB-98, AB-99 |
| CA-E5-55 | Duplo clique em "Confirmar pagamento", em "Salvar conta a pagar" e em "Salvar recorrência" gera um pagamento, um compromisso e uma série | AB-52, AB-93 |
| CA-E5-56 | Orçamentos: owner cria Alimentação com 500,00; com 400,00 gastos o cartão mostra "R$ 400,00 de R$ 500,00", "Disponível R$ 100,00", 80% e "Atenção" (ícone + texto); acima de 500,00 mostra "Limite estourado" e "Acima do limite em …"; "Meses anteriores" lista até 3 meses; arquivar a categoria mostra o selo "Categoria arquivada" | R14, AB-96 |
| CA-E5-57 | Member: vê orçamentos sem "Novo orçamento" nem ações; `/orcamentos/novo` → página não encontrada; paga o compromisso do qual é responsável; não vê "Marcar como pago" nos compromissos alheios em que não é responsável | E |
| CA-E5-58 | Em 390×844: `/compromissos`, `/recorrencias` e `/orcamentos` em cartões; `Dialog` de pagamento dentro da área útil; formulário de compromisso (com "Repetir") completo por toque; `SubNav` rola dentro do trilho; sem rolagem horizontal da página | F |
| CA-E5-59 | Falha de rede no envio mantém os valores digitados; sessão expirada → `/login?motivo=sessao_expirada&next=…` (formulários novos e `Dialog` de pagamento) | ADR-0017 |
| CA-E5-60 | Outsider abrindo `/compromissos/<id de A>`, `/recorrencias/<id de A>/editar` ou `/orcamentos/<id de A>/editar` → página não encontrada | AB-92 |
| CA-E5-61 | `SubNav` marca Lançamentos, Compromissos ou Recorrências conforme a rota; o item Transações da navegação fica ativo nas três; o item Orçamentos aparece (no celular, em "Mais"); `/transacoes/<id pendente>` redireciona a `/compromissos/<id>` | spec §9 |
| CA-E5-62 | `/transacoes` mostra o selo "Recorrente" nas ocorrências pagas, e o detalhe tem o link para a série | spec §7.3 |

### E5-DS — design-system

| Id | Critério | Verificação |
|---|---|---|
| CA-E5-70 | `shadcn add switch progress` sem sobrescrever arquivos existentes (diff de `button.tsx`, `input.tsx` etc. vazio) e sem pacote novo no `package.json` | G |
| CA-E5-71 | RTL: `ProgressMeter` limita `aria-valuenow` a 0..100 e anuncia o valor real em `aria-valuetext` ("112% do limite"), com os três tons; `SubNav` marca `aria-current="page"` inclusive em subrota; `Switch` com rótulo associado e alvo ≥ 40px | U |
| CA-E5-72 | Nenhum hex em `.tsx`; nenhum token novo; `docs/design-system.md` documenta `ProgressMeter`, `SubNav`, `Switch`, `Progress` e o padrão de status de compromisso | G + inspeção |

## Etapa 6 — Metas, divisão de contas e planejamento (contrato `contracts/etapa-6.md`)

### E6-DB — pgTAP

| Id | Critério | AB |
|---|---|---|
| CA-E6-01 | `goals`, `goal_contributions`, `expense_splits` e `settlements` com RLS; grants exatamente os do contrato §3.1 (por coluna); **nenhum** insert/update/delete em `expense_splits` para `authenticated`; `set_transaction_splits`, `private.current_member_id` e `private.rescale_splits` `security definer` com `search_path=""`; `goal_summary`, `member_balances` e `projected_cash_flow` `security invoker`; `anon` sem privilégio em nada novo | AB-15, AB-16, AB-17 |
| CA-E6-02 | B (outra família) e C (sem família) leem 0 linhas das quatro tabelas de A; `goal_summary`, `member_balances` e `projected_cash_flow` de B não contam nada de A; B chamando `set_transaction_splits` com o id de uma despesa de A → `NOT_FOUND`, e as parcelas de A ficam iguais | AB-100, AB-106 |
| CA-E6-03 | Na família B: aporte com `goal_id` ou `member_id` de A → `23503`; com `family_id` de A → `42501`; acerto com integrante de A → `23503`; divisão com integrante de A → `INVALID_INPUT` (mesmo erro de um id inexistente) | AB-100, AB-104 |
| CA-E6-04 | Metas: member não cria nem altera (42501/0 linhas); owner e admin sim; transições válidas e inválidas da ADR-0025 (`INVALID_STATUS_TRANSITION`); meta concluída ou cancelada não aceita update nenhum; `completed_at` preenchido só em `completed`; ícone fora da lista, alvo 0, NaN ou acima do teto → `23514` | — |
| CA-E6-05 | Aportes: member registra no próprio nome; member com `member_id` de outro integrante → `42501`; owner/admin para qualquer integrante ativo; integrante inativo → `INVALID_INPUT`; meta pausada, concluída ou cancelada → `GOAL_NOT_ACTIVE`; data futura → `FUTURE_DATE_NOT_ALLOWED`; retirada maior que o acumulado → `GOAL_NEGATIVE_PROGRESS`; duas retiradas concorrentes (duas sessões) que somadas passam do acumulado → a segunda falha; `created_by` no insert → `42501` | AB-101, AB-102 |
| CA-E6-06 | Exclusão lógica de aporte: autor, owner e admin; outro member → 0 linhas; excluir um aporte que deixaria o acumulado negativo → `GOAL_NEGATIVE_PROGRESS`; linha excluída não volta (0 linhas); update de qualquer coluna além de `deleted_at` → `42501`; `goal_contribution.deleted` auditado | AB-102, AB-108 |
| CA-E6-07 | `set_transaction_splits`: owner, admin e autor conseguem; outro member e o responsável que não é autor → `42501`; receita, transferência, cancelada ou estorno → `SPLIT_NOT_ALLOWED`; excluída → `NOT_FOUND`; sem família → `42501`; `anon` → 42501; insert, update e delete diretos em `expense_splits` → `42501` | AB-105, AB-106 |
| CA-E6-08 | Divisão: `equal` com 100,00/3 → 33,34 · 33,33 · 33,33 (R6); 200,00/3 → 66,67 · 66,67 · 66,66 na ordem `joined_at`; 1,00/7 → 0,15 · 0,15 · 0,14 × 5; 1 ou 21 integrantes, integrante repetido ou valor `10.999`, `-1`, `0` → `INVALID_INPUT`; integrante novo inativo → `MEMBER_INACTIVE`; ex-integrante que já estava na divisão é aceito; `amounts` com Σ diferente → `SPLIT_SUM_MISMATCH` e nada muda; `none` remove; `transaction.splits_changed` auditado | AB-104, AB-105 |
| CA-E6-09 | Reescala: R17 por `pay_pending_transaction` com 101,00; editar o valor de um compromisso dividido reescala; pagar com o mesmo valor não muda as parcelas; Σ parcelas ≠ valor forçado (como postgres, sem a RPC) falha no commit (`SPLIT_SUM_MISMATCH`); o estorno de despesa dividida não ganha linhas em `expense_splits` | AB-105 |
| CA-E6-10 | Acertos: member registra sendo `from` ou `to`; member que não é parte → `42501`; owner/admin entre quaisquer; `from = to` → `23514`; data futura → `FUTURE_DATE_NOT_ALLOWED`; com ex-integrante, aceito; exclusão por autor, owner e admin (outro member → 0 linhas); `settlement.created`/`deleted` auditados | AB-107, AB-108 |
| CA-E6-11 | `member_balances`: R18 e os saldos de R16 com os valores exatos; pendentes, cancelados, excluídos e acertos excluídos fora; uma linha por par, só positiva | — |
| CA-E6-12 | `goal_summary`: `saved` de todas as datas, `deposits`/`withdrawals` só do intervalo, excluídas fora; datas nulas, `p_from > p_to` ou 367 dias → `INVALID_INPUT` | — |
| CA-E6-13 | `projected_cash_flow(12)`: 12 meses, todos presentes; pendentes no mês da data (vencidos no 1º mês); ocorrências virtuais a partir de `next_occurrence_date`, sem repetir as materializadas (série de R13: materializadas até o fim do mês seguinte, virtuais depois); `end_date` respeitado; série pausada fora; `p_months` 0 ou 13 → `INVALID_INPUT` | — |
| CA-E6-14 | R15 com os valores exatos: acumulado, percentual e as funções de saldo e totais (`account_balances`, `period_summary`, `monthly_cash_flow`, `category_totals`, `budget_progress`) iguais às de R1 | AB-103 |
| CA-E6-15 | Metadata de `goal.*`, `goal_contribution.deleted`, `transaction.splits_changed` e `settlement.*` sem `name`, `description`, `notes`, `email` nem ids de pessoas; member lê 0 eventos | AB-60..62 |
| CA-E6-16 | Regressão: R1–R14 continuam exatos com metas, parcelas e acertos no banco; R16 (consolidado 1.350,00); `010` e os testes 100–370 continuam verdes | AB-103 |

### E6-BE — servidor (U/I)

| Id | Critério | Verificação |
|---|---|---|
| CA-E6-30 | Schemas: data-alvo passada rejeitada na criação e aceita na edição; data de aporte futura rejeitada no campo; `setSplitSchema` com 1 ou 21 integrantes ou repetidos rejeitado; acerto com De = Para → erro no campo `toMemberId`; filtros tolerantes nunca lançam; nenhum schema tem `familyId` | U + G |
| CA-E6-31 | Domínio: `goalProgress`; `estimateGoal` em R15 (ritmo 100,00, 47 meses, premissa com "R$ 100,00 por mês"); ritmo ≤ 0 → sem estimativa; aporte necessário com arredondamento para cima (1.000,00 em 3 meses → 333,34); data-alvo passada; `previewEqualSplit` com a mesma tabela de CA-E6-08 (paridade com o SQL); `amountSplitDifference` | U |
| CA-E6-32 | `toAppError` mapeia `GOAL_NOT_ACTIVE`, `GOAL_NEGATIVE_PROGRESS` (`fieldErrors.amount`), `SPLIT_NOT_ALLOWED`, `SPLIT_SUM_MISMATCH` e `MEMBER_INACTIVE`; repetir a `idempotencyKey` de `createGoal`, `addContribution` e `createSettlement` devolve `ok` com o mesmo `id` | U + I |
| CA-E6-33 | Planejamento: R19 exato nas três taxas; `i = 0` → total das parcelas = valor financiado; objetivo (meses e aporte com arredondamento para cima); redução limitada à média; saldo futuro com base fixa; `n = 481`, `i = 20,01%`, entrada ≥ valor e valores acima do teto → `OUT_OF_RANGE`; teste de propriedade: nenhuma saída `NaN`/`Infinity` dentro dos limites; todo resultado tem premissas e origem em cada linha | U (AB-109) |
| CA-E6-34 | Pela camada do app: member registra aporte no próprio nome; para outro → `FORBIDDEN`; owner para outro integrante; member excluindo aporte alheio → `FORBIDDEN`; meta de outra família → `NOT_FOUND` | I (AB-101) |
| CA-E6-35 | Divisão pela camada do app: autor member divide a própria despesa; outro member → `FORBIDDEN`; R16 pelas actions; `payBill` com 101,00 → `getTransactionSplit` com as parcelas de R17; `listSharedExpenses` filtra situação e pagina com `total` correto; `getMemberBalances` em R18 | I (AB-105, AB-106) |
| CA-E6-36 | R15 pelos services: depois dos aportes, `consolidatedBalance`, `getPeriodSummary`, `getDashboard` (consolidado, receitas, despesas, resultado) e `getBudgetsOverview` iguais aos de R1; `Dashboard.goals` traz a meta com 6,0% | I (AB-103) |
| CA-E6-37 | `getPlanningBaseline` com `today = 2026-10-24`: médias de julho, agosto e setembro (3 meses completos); `projection` com 12 meses; chama `ensureRecurrencesMaterialized` antes; outsider → `/onboarding` | I |
| CA-E6-38 | `grep -rnE "parseFloat\|toFixed\("` em `src/modules/{goals,splits}` vazio; `grep -rnE "localStorage\|sessionStorage\|router\.(push\|replace)\|useSearchParams"` em `src/modules/planning/components` e `src/app/(app)/planejamento` vazio; nenhum import de action em `planning/components`; `expense_splits` só em `select` | G (AB-109) |
| CA-E6-39 | `proxy` redireciona `/metas`, `/planejamento` e `/divisao` sem sessão; `safeNextPath` as aceita; `server-only` nos arquivos de servidor; `planning/domain` sem `server-only` e sem import de `@/lib/supabase` | U + G |

### E6-E2E — Playwright (desktop e mobile)

| Id | Critério | Cenário |
|---|---|---|
| CA-E6-50 | Owner cria "Viagem" com 5.000,00 → aparece em Ativas com 0% e "Sem estimativa"; aporte de 400,00 e retirada de 100,00 → "R$ 300,00 / R$ 5.000,00", 6%, estimativa com a premissa visível; Saldo total e Despesas do `/inicio` inalterados (R15 na tela) | spec §7.9, §8 |
| CA-E6-51 | Retirada maior que o guardado mostra o erro no campo Valor e mantém os dados; excluir o aporte que deixaria a meta negativa mostra a mensagem com o próximo passo | AB-102 |
| CA-E6-52 | Pausar → "Pausada" e sem "Registrar aporte"; reativar; concluir com confirmação → aba Concluídas; meta cancelada sem ações de edição | — |
| CA-E6-53 | Member: vê as metas sem "Nova meta" nem ações de status; registra aporte com o integrante fixo nele; `/metas/nova` → página não encontrada; não vê "Excluir" em aporte alheio | E (UX; autorização real em CA-E6-04/05) |
| CA-E6-54 | Despesa de 200,00 com responsável A → "Dividir despesa" → Igualmente entre A, B e C → prévia 66,67 · 66,67 · 66,66 → salvar → `/divisao` mostra "Dividida entre 3" e "Sua parte"; "Quem deve a quem": B deve R$ 66,67 e C deve R$ 66,66 a A; Saldo total e despesas inalterados | spec §7.10 |
| CA-E6-55 | Por valores: "Faltam R$ X"/"Passou R$ X" ao digitar; "Salvar divisão" desabilitado até fechar; salvar; "Remover divisão" com confirmação | AB-105 |
| CA-E6-56 | `/planejamento`: os 6 cenários mostram resultado com "Conhecido", "Informado" e "Estimado" (ícone + texto) e o aviso sempre visível; financiamento com 1,5% mostra R$ 2.169,14 e R$ 78.089,17; recarregar limpa as entradas, e a URL não contém valores digitados | spec §7.12, AB-109 |
| CA-E6-57 | Compromisso dividido pago com valor diferente → a divisão mostra os valores reescalados (R17) | AB-105 |
| CA-E6-58 | Em 390×844: `/metas` em cartões; `Dialog` de aporte dentro da área útil; `/divisao` em cartões; formulário de divisão por toque; `/planejamento` em uma coluna; barra inferior com Metas (mockup 10) sem rolagem horizontal; controles ≥ 40px | F |
| CA-E6-59 | Acerto: B registra "B → A, 20,00" → "Quem deve a quem" atualiza; C não consegue montar um acerto entre A e B (o formulário trava um dos lados nele) | AB-107 |
| CA-E6-60 | Outsider abrindo `/metas/<id de A>` ou `/divisao/<id de despesa de A>` → página não encontrada | AB-100, AB-106 |
| CA-E6-61 | `/inicio`: card Metas com até 3 metas, % e link; sem metas, estado vazio com ação (owner) ou orientação (member) | spec §7.2 |
| CA-E6-62 | Falha de rede mantém os valores digitados; sessão expirada → `/login?motivo=sessao_expirada&next=…` (formulário de meta, `Dialog` de aporte, divisão, acerto) | ADR-0017 |

### E6-DS — design-system

| Id | Critério | Verificação |
|---|---|---|
| CA-E6-70 | `shadcn add checkbox` sem sobrescrever arquivos existentes e sem pacote novo no `package.json` | G |
| CA-E6-71 | RTL: `GoalIcon` renderiza as 12 chaves e é `aria-hidden` sem `label`; `ValueSourceBadge` mostra ícone + texto nas três origens; `Checkbox` com rótulo associado e alvo ≥ 40px | U |
| CA-E6-72 | Nenhum hex em `.tsx`; nenhum token novo; `docs/design-system.md` documenta `Checkbox`, `GoalIcon`, `ValueSourceBadge` e o padrão de status de meta | G + inspeção |

## Etapa 7 — Relatórios, notificações, família e auditoria (contrato `contracts/etapa-7.md`)

### E7-DB — pgTAP

| Id | Critério | AB |
|---|---|---|
| CA-E7-01 | `notifications` com RLS; grants exatamente `select` + `update (read_at)`; sem insert/delete; `change_member_role`, `transfer_ownership`, `remove_family_member`, `leave_family` e `refresh_notifications` `security definer` com `search_path=""`; `account_flows` e `member_expense_totals` `security invoker`; `family_members` continua sem grant de escrita; `anon` sem privilégio em nada novo | AB-15..17, AB-21 |
| CA-E7-02 | `change_member_role`: owner muda admin ↔ member; papel igual não gera evento; owner no próprio vínculo → `CANNOT_TARGET_SELF`; admin e member chamando (inclusive no próprio vínculo) → `42501`; `p_role` `owner` ou `x` → `INVALID_INPUT`; alvo inexistente, de outra família ou encerrado → `NOT_FOUND`; `member.role_changed` auditado | AB-110 |
| CA-E7-03 | `transfer_ownership`: depois, exatamente um owner ativo (o alvo) e o anterior é admin; não-owner → `42501`; alvo = chamador → `CANNOT_TARGET_SELF`; alvo de outra família, encerrado ou inexistente → `NOT_FOUND`; o novo owner renomeia a família e o anterior não; `family.ownership_transferred` auditado | AB-111, AB-112 |
| CA-E7-04 | `leave_family`: admin e member → `status='left'` e `ended_at`; owner → `OWNER_MUST_TRANSFER`; depois de sair, o usuário lê 0 linhas da família e pode criar outra família; `member.left` auditado | AB-111 |
| CA-E7-05 | `remove_family_member`: owner remove admin e member; admin remove member; admin removendo admin ou owner → `42501`; member → `42501`; alvo = chamador → `CANNOT_TARGET_SELF`; segunda remoção → `NOT_FOUND`; transferência e remoção concorrentes do mesmo alvo (duas sessões) → uma falha e nunca há 0 ou 2 owners | AB-111, AB-112, AB-119 |
| CA-E7-06 | Efeitos da saída e da remoção: convites pendentes criados pelo alvo revogados (`invite.revoked` com `reason`); convites de outros, aceitos e expirados intactos; contagens de lançamentos, compromissos, séries, metas, aportes, parcelas e acertos iguais e legíveis pelos que ficam; R1 inalterado; o ex-integrante lê 0 linhas e o convite revogado devolve `INVITE_REVOKED`; série do ex-integrante falha com `RECURRENCE_AUTHOR_INACTIVE` na materialização seguinte | AB-113 |
| CA-E7-07 | `refresh_notifications`: cada tipo gerado para os destinatários certos, com `dedupe_key` e `data` do contrato (compromisso só para quem pode pagar); segunda chamada devolve 0; limites (79% × 80%; vence em 3 × 4 dias; venceu há 30 × 31 dias); `member_joined` não aparece para quem entrou depois; `financial_event` para o responsável e para a parte de um acerto, nunca para o autor; ocorrências de série não geram `financial_event`; nada para a família B; a função não tem parâmetros; teto de 100; limpeza do compromisso pago e das notificações com mais de 90 dias | AB-115 |
| CA-E7-08 | RLS de notificações: cada usuário lê só as próprias; outro integrante da mesma família lê 0 das minhas; update no id alheio → 0 linhas; update de coluna além de `read_at` → `42501`; insert e delete → `42501`; `read_at` não volta a nulo e é fixado em `now()`; integrante removido lê 0 das próprias | AB-114, AB-116 |
| CA-E7-09 | Renomear a família (owner) grava `family.updated { "fields": ["name"] }`; mesmo nome não grava; admin → 0 linhas | — |
| CA-E7-10 | `account_flows`: R20 com os valores exatos; contas arquivadas incluídas; transferências contadas nas duas contas; datas nulas, invertidas ou 367 dias → `INVALID_INPUT` | — |
| CA-E7-11 | B e C não recebem nada de A em `account_flows` e `member_expense_totals` (intervalo que cobre tudo de A); ambas com `prosecdef = false` e sem parâmetro de família | AB-117 |
| CA-E7-12 | `member_expense_totals`: R16 (A, B e C com 50,00) e R20 (A 200,00; nulo 90,00); Σ = despesas de `period_summary`; pendentes, cancelados e excluídos fora; mesmas validações de data | — |
| CA-E7-13 | `unique (user_id, dedupe_key)`; `data` acima de 2048 bytes ou `dedupe_key` fora do formato → `23514` | — |
| CA-E7-14 | Regressão: R1–R19 continuam exatos depois de uma saída e com notificações no banco; R20 | — |
| CA-E7-15 | Metadata de `member.*`, `family.*` e `invite.revoked` sem `email`, `name`, `display_name`, `description`; owner e admin leem; member lê 0 | AB-60..62, AB-118 |
| CA-E7-16 | `010_security_baseline` e os testes 100–470 continuam verdes | AB-16, AB-17 |

### E7-BE — servidor (U/I)

| Id | Critério | Verificação |
|---|---|---|
| CA-E7-30 | `resolveReportPeriod` com `today = 2026-10-24`: `7_dias` 18/10–24/10 (anterior 11/10–17/10); `30_dias` 25/09–24/10 (anterior 26/08–24/09); `3_meses` 01/08–24/10 (anterior 01/05–24/07); `12_meses` 01/11/2025–24/10/2026 (anterior 01/11/2024–24/10/2025); personalizado inválido → `30_dias`; `months` corretos; `reportFiltersSchema` nunca lança | U |
| CA-E7-31 | Relatórios pela camada do app: `getReportOverview` dá os mesmos receitas, despesas e resultado que `getDashboard` para o mesmo intervalo (mesmos serviços); `getCategoryReport` com R9; `getAccountReport` em R20 com `assetNet = consolidated.delta`; `getMemberReport` em R20 com Σ = `total`; `getBudgetReport` em R14; `getGoalReport` em R15 | I |
| CA-E7-32 | Isolamento pela camada do app: os relatórios de B não contêm valor nem nome de A; member vê os mesmos relatórios que o owner; outsider → `/onboarding` | I (AB-117) |
| CA-E7-33 | `renderNotification`: texto pt-BR de cada tipo com `formatBRL`/`formatDateBR`; `href` só da lista fechada; uuid inválido ou tipo de entidade desconhecido → `href = null`; descrição com HTML sai como texto; nenhuma URL externa possível | U (AB-116) |
| CA-E7-34 | `ensureNotificationsRefreshed` com a RPC falhando: registra e não lança; `listNotifications` e `getUnreadNotificationCount` respondem; chamado uma vez por requisição | U |
| CA-E7-35 | `openNotification`: a própria → lida e `href`; id alheio ou aleatório → `NOT_FOUND` com a mesma mensagem; `markAllNotificationsRead` devolve a contagem | I (AB-114, AB-115) |
| CA-E7-36 | Actions de família mapeiam `OWNER_MUST_TRANSFER`, `CANNOT_TARGET_SELF`, `NOT_FOUND` e `FORBIDDEN`; `renameFamily` por admin → `FORBIDDEN`; depois da remoção, a próxima chamada do removido a `requireMembership` redireciona a `/onboarding`; `getFamilyOverview` devolve as flags certas para cada papel | I (AB-110..113) |
| CA-E7-37 | `listActivity`: member → `null`; owner vê os eventos com o nome de quem fez; ator ex-integrante → "Ex-integrante"; `describeAuditEvent` cobre **todas** as ações do catálogo do `data-model.md` §4.6 (o teste percorre a lista) e ação desconhecida → "Alteração registrada"; filtros por grupo e período; paginação | U + I (AB-118) |
| CA-E7-38 | Responsável ou autor removido aparece como "Ex-integrante" em `listTransactions`, `listBills` e `listRecurrences` | I |
| CA-E7-39 | `grep -rnE "parseFloat\|toFixed\("` em `src/modules/{reports,notifications,activity}` vazio; nenhum insert em `notifications` nem update em `family_members` em `src/`; `audit_events` só em `src/modules/activity`; o grep de CA-E4-38 estendido a `src/app/(app)/relatorios` vazio | G |
| CA-E7-40 | `proxy` redireciona `/relatorios`, `/notificacoes` e `/familia/atividade` sem sessão; `safeNextPath` as aceita; `server-only` nos arquivos de servidor; nenhum import de servidor em `"use client"` | U + G |

### E7-E2E — Playwright (desktop e mobile)

| Id | Critério | Cenário |
|---|---|---|
| CA-E7-50 | `/relatorios` (30 dias por padrão) com R1: Receitas R$ 500,00, Despesas R$ 200,00, Resultado R$ 300,00; "Por categoria" com legenda "Alimentação 100,0%"; trocar o preset atualiza a URL e sobrevive ao reload e ao "voltar"; personalizado inválido cai em 30 dias | B (relatório por categoria), C |
| CA-E7-51 | Cada gráfico dos relatórios tem título, período, legenda em texto e "Ver tabela" com os mesmos valores; contêiner com `role="img"` e `aria-label` | spec §7.11 |
| CA-E7-52 | `/relatorios/contas` com os valores de R20 e a nota sobre transferências; `/relatorios/integrantes` com Total = despesas do período e a linha "Família (sem responsável)" | R20 |
| CA-E7-53 | `/relatorios/orcamentos` e `/relatorios/metas` com `ProgressMeter` e estado em `Badge` (ícone + texto); estados vazios com ação ou orientação | — |
| CA-E7-54 | Compromisso que vence em 2 dias → ao abrir o app, o sino mostra 1; `/notificacoes` lista "Conta a vencer"; clicar leva a `/compromissos/<id>` e marca como lida; "Marcar todas como lidas" zera o contador; depois de pagar, a notificação some na próxima carga | spec §7.14 |
| CA-E7-55 | Owner torna um integrante administrador e volta; transfere a propriedade com confirmação → papéis trocados e o antigo owner não vê mais "Transferir propriedade"; renomear a família atualiza o nome na tela | spec §7.13 |
| CA-E7-56 | Member em `/familia` vê só "Sair da família", sem menu de ações nos outros; `/familia/atividade` → página não encontrada; admin vê a atividade com "Papel alterado" e "Lançamento editado" | AB-118 |
| CA-E7-57 | Owner remove B; na navegação seguinte de B (outro contexto) → `/onboarding`; os lançamentos de B continuam em `/transacoes` para o owner, com "Ex-integrante"; um admin removido tem o convite que criou exibido como "revogado" | AB-113 |
| CA-E7-58 | A vê `/relatorios`, sai; B entra no mesmo navegador → nenhum valor, categoria ou nome de A no DOM, nem depois de "voltar" | AB-117 |
| CA-E7-59 | Admin sai com confirmação → `/onboarding`; owner vê "Para sair, transfira a propriedade antes." | — |
| CA-E7-60 | Em 390×844: `/relatorios` (`SubNav` rola dentro do trilho, gráficos cabem), `/notificacoes`, `/familia` (menu de ações por toque) e `/familia/atividade` em cartões; sino visível no cabeçalho; sem rolagem horizontal | F |
| CA-E7-61 | `/convite/<token>`: "Agora não" volta sem aceitar, e o link continua válido depois (até expirar) | spec §7.13 |
| CA-E7-62 | Novo integrante aceita um convite → o owner vê "Novo integrante" em `/notificacoes`, com link para `/familia` | spec §7.14 |
| CA-E7-63 | Falha de rede e sessão expirada nas ações de família e em `openNotification`: mensagem com o próximo passo, sem estado parcial | ADR-0017 |

### E7-DS — design-system

| Id | Critério | Verificação |
|---|---|---|
| CA-E7-70 | `package.json` só com atualizações de dependências atrasadas; `pnpm outdated` vazio; `pnpm audit` limpo | G |
| CA-E7-71 | RTL: `HorizontalBarChart` monta com dados, com negativos e com lista vazia; sem animação com `prefers-reduced-motion`; disponível só por `LazyHorizontalBarChart` | U |
| CA-E7-72 | Nenhum hex; `recharts` só em `src/components/charts/`; `docs/design-system.md` documenta o `HorizontalBarChart` e o padrão de notificação não lida | G + inspeção |

## Etapa 8 — PWA, acessibilidade e responsividade (contrato `contracts/etapa-8.md`; ADR-0031, ADR-0032)

Verificação adicional: **E-pub** = Playwright sem banco (`playwright.publico.config.ts`, `e2e/publico/**`) · **E-docker** = Playwright com Supabase local (tag `@docker`; escrito na etapa e executado quando houver Docker) · **L** = Lighthouse (`pnpm dlx lighthouse`). Nenhum critério de banco: pgTAP e integração não mudam. Inventário de rotas: `contracts/etapa-8.md` §3.3.

### E8-PWA — manifest, ícones, service worker, offline

| Id | Critério | Verificação |
|---|---|---|
| CA-E8-01 | `GET /manifest.webmanifest` sem cookie → 200, JSON com `name` "Núcleo", `short_name`, `id` `/`, `start_url` `/inicio`, `scope` `/`, `display` `standalone`, `lang` `pt-BR`, **sem** `orientation`; ícones 192 e 512 (`any`) e 512 (`maskable`); cada `src` responde 200 `image/png` com a dimensão declarada; `apple-icon.png` 180x180 | U + E-pub |
| CA-E8-02 | `theme_color`/`background_color` do manifest e o `themeColor` por esquema (claro/escuro) do `viewport` iguais a `--primary`/`--background` (claro) e `--background` (escuro) lidos de `src/app/globals.css`; nenhum hex em `*.tsx` novo (hex só em `manifest.ts`/`viewport`, com o teste de igualdade) | U + G |
| CA-E8-03 | `<head>` de `/login`: `link rel="manifest"`, duas `meta theme-color` com `media`, `meta viewport` com `viewport-fit=cover` e **sem** `maximum-scale` nem `user-scalable=no`, `link rel="apple-touch-icon"` | E-pub |
| CA-E8-04 | `buildServiceWorkerSource` executado em sandbox: `GET /_next/static/a.js`, `/icons/icon-192.png` e `/favicon.ico` → cache-first e guardados; `GET navigate /inicio` online → passa, **nada guardado**; navegação com falha de rede → `/offline` do cache; `POST`, `Next-Action`, `?_rsc=`, cabeçalho `RSC`, `/_next/image`, `/_next/data`, `/auth/confirm`, `/sw.js`, `/manifest.webmanifest`, `Range` e outra origem → o worker **não chama** `respondWith` | U |
| CA-E8-05 | Invariante (teste de propriedade): para qualquer URL do inventário de rotas e URLs aleatórias, `cache.put`/`add`/`addAll` só recebe URL da lista fechada ou `/offline`; resposta que não seja 200 `basic`, ou com `Cache-Control` `no-store`/`private`, nunca é guardada; resposta HTTP 401/302/500 de navegação passa intacta (não vira `/offline`) | U |
| CA-E8-06 | `GET /sw.js` → 200, `Content-Type` `application/javascript; charset=utf-8`, `Cache-Control: no-cache, no-store, must-revalidate`, CSP `default-src 'self'; script-src 'self'; frame-ancestors 'none'`, e o corpo contém a versão do build; versões diferentes geram textos diferentes | U + E-pub |
| CA-E8-07 | Registro: com `NODE_ENV=production` chama `register("/sw.js", { scope: "/", updateViaCache: "none" })` depois de `load`; em desenvolvimento e em navegador sem `serviceWorker` não registra; exceção no registro não quebra a página nem aparece ao usuário; `registration.update()` ao voltar ao primeiro plano, no máximo 1 por hora | U (RTL) |
| CA-E8-08 | Offline (Chromium, `serviceWorkers: "allow"`): visitar `/login` online → worker ativo; `context.setOffline(true)` → navegar a `/login` e a `/inicio` mostra `/offline` ("Você está sem conexão", sem dado nenhum, nunca conteúdo anterior); com a rede de volta, "Tentar novamente" recarrega a URL | E-pub |
| CA-E8-09 | Invariante de cache real: depois de navegar por `/login`, `/cadastro` e `/offline`, `caches.keys()` = apenas `nucleo-static-<versão>` e toda requisição guardada casa com a lista fechada ou é `/offline`. **Com sessão** (E-docker): depois de `/inicio`, `/transacoes`, `/relatorios`, `/familia`, logout e login de outro usuário no mesmo navegador, a mesma afirmação vale e nenhuma URL de `(app)` foi guardada (AB-117) | E-pub + E-docker |
| CA-E8-10 | Atualização: `activate` da nova versão apaga todo `nucleo-static-*` diferente do atual e chama `clients.claim()`; `install` chama `skipWaiting()`; falha ao buscar `/offline` na instalação rejeita a instalação; falha de um ativo referenciado não rejeita | U |
| CA-E8-11 | `/offline`: estática (sem `cookies()`/`headers()`, sem Supabase), 1 `main`, 1 `h1`, `noindex`, fora de `PRIVATE_PREFIXES`, igual com e sem sessão; `src/proxy.ts` não executa em `/manifest.webmanifest` (extensão no `matcher`) | U + E-pub |
| CA-E8-12 | Instalabilidade: `Page.getInstallabilityErrors` (CDP, Chromium, `localhost`) devolve lista vazia em `/login` com o worker ativo; sem erro de manifest no DevTools/Lighthouse | E-pub + L |
| CA-E8-13 | `package.json` sem `workbox`, `serwist`, `next-pwa` nem outra biblioteca de PWA; nenhum `.js`/`.mjs` de aplicação novo (o texto do worker é gerado); `grep -rn "use cache\|unstable_cache" src` continua vazio (ADR-0015); `next.config.ts` mantém os cabeçalhos de segurança existentes | G |

### E8-A11Y — acessibilidade (WCAG 2.2 AA)

| Id | Critério | Verificação |
|---|---|---|
| CA-E8-20 | Pular para o conteúdo (2.4.1): primeiro `Tab` em toda tela com `main` foca "Pular para o conteúdo", visível só com foco; `Enter` leva o foco a `main#conteudo` (`tabindex="-1"`); vale nos layouts `(app)`, `(public)`, `onboarding` e em `/offline` | U (RTL) + E-pub + E-docker |
| CA-E8-21 | axe (ADR-0032 §4) sem violação `serious`/`critical` nem de nome/rótulo/papel/landmark em `/login`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha`, `/offline` e 404, em 360 e 1280, tema claro e escuro; Lighthouse acessibilidade = 100 nas mesmas URLs (auditoria reprovada → log com decisão) | E-pub + L |
| CA-E8-22 | axe em todas as rotas do inventário, claro e escuro, estado vazio e com dados (`e2e/helpers/cenario.ts`), com as mesmas regras; inclui um diálogo/menu/sheet aberto por tela que o tenha | E-docker |
| CA-E8-23 | Componentes: Vitest + Testing Library + axe-core (sem `color-contrast`) em todo componente de `src/components/{shared,layout,charts}` e nos diálogos, menus e abas de `src/modules/*/components`, nos estados padrão e vazio/erro | U |
| CA-E8-24 | Teclado (2.1.1, 2.1.2, 2.4.3): sem armadilha; ordem de foco = ordem visual; `Esc` fecha `Dialog`, `AlertDialog`, `Sheet`, `DropdownMenu` e calendário e devolve o foco ao gatilho; fluxos só com teclado: login, cadastro, nova transação, pagar compromisso, aporte em meta, filtros, menu de ações de integrante, troca de tema, menu "Mais", abas de relatório e de notificação | E-pub (auth) + E-docker |
| CA-E8-25 | Foco visível e não obscurecido (2.4.7, 2.4.11): percorrendo com `Tab` em 360 e 1280, o anel do elemento focado tem contraste ≥ 3:1 e o ponto central dele (`elementFromPoint`) pertence a ele — nunca coberto por cabeçalho, `BottomNav` ou `Toaster`; `html` tem `scroll-padding-top` e `scroll-padding-bottom` que cobrem cabeçalho e `BottomNav` com a safe area | E-pub + E-docker |
| CA-E8-26 | Alvo (2.5.8): todo controle interativo de `main`, cabeçalho, sidebar e `BottomNav` mede ≥ 24x24px ou tem espaçamento equivalente; controles principais continuam ≥ 40px (CA-E2-59, estendido a todas as rotas); `Button` `xs`/`icon-xs`/`icon-sm` não é a única ação de uma tela | E-pub + E-docker + G |
| CA-E8-27 | Contraste (1.4.3, 1.4.11): `docs/design-system.md` mede, nos dois temas, todo par novo ou alterado nesta etapa (skip link, foco, página offline) e resolve ou justifica cada linha "Reprovado" existente (`chart-1`/`chart-3`, ícone sobre fundo tingido, claro; ícone de categoria é decorativo e o nome vem ao lado, ADR-0019); nenhum texto informativo abaixo de 4,5:1 e nenhum limite de controle abaixo de 3:1 | G + inspeção |
| CA-E8-28 | `prefers-reduced-motion: reduce` (CA-E1-14, CA-E4-74): sem transição nem animação de entrada/saída (`tw-animate-css` em `Dialog`, `Sheet`, `Dropdown`, `Popover`, `Sonner`), sem `scroll-behavior: smooth`, sem `animate-pulse`; o `animate-spin` de carregamento permanece, sempre com texto (`Button.loading`); regra global em `globals.css`, não por componente | E-pub (`emulateMedia`) + U |
| CA-E8-29 | Dados e gráficos: todo gráfico com `role="img"` + `aria-label`, título, período, legenda em texto e "Ver tabela" (CA-E7-51); tooltip nunca é o único meio de ler um valor (1.4.13, 2.5.1); tabelas com `caption` (`sr-only`) e `th scope`; `ResponsiveList` esconde a versão não usada com `hidden`; região com rolagem interna é focável e nomeada | U + E-docker |
| CA-E8-30 | Formulários (1.3.5, 3.3.1, 3.3.3, 3.3.7, 3.3.8, 4.1.3): todo campo com `label` e `autocomplete` correto (`email`, `current-password`, `new-password`, `name`); colar permitido em e-mail e senha; erro ligado por `aria-describedby`/`aria-invalid` e foco no primeiro erro; resultado de ação assíncrona (sucesso, falha, "Marcar todas como lidas", toast) anunciado em região `status`/`alert`; dado já informado não é pedido de novo no mesmo fluxo | E-pub (auth) + E-docker + U |
| CA-E8-31 | Estrutura: `lang="pt-BR"`, `title` único por rota (`%s · Núcleo`; toda `page.tsx` exceto `/` tem `metadata`), 1 `main`, 1 `h1`, títulos sem salto, `nav`/`aside` com nome, `aria-current="page"` na navegação, sino anunciado ("Notificações, 3 não lidas") | E-pub + E-docker + U |
| CA-E8-32 | Reflow e zoom: a 320px de largura (1.4.10) e a 200% de zoom não há rolagem horizontal da página (exceto região de dados nomeada) nem perda de conteúdo; com o espaçamento de texto de 1.4.12 (`line-height` 1,5; `letter-spacing` .12em; `word-spacing` .16em; parágrafo 2em) nada é cortado ou sobreposto nas rotas públicas e em `/inicio` | E-pub + E-docker |
| CA-E8-33 | Inspeção manual declarada (não substitui o automático): NVDA ou VoiceOver nas jornadas login, nova transação, pagar compromisso e notificações, com leitor e versão em `docs/log-execucao.md`. Sem leitor disponível, o item fica **"não verificado"** e não é declarado verde | inspeção |

### E8-RESP — responsividade (360, 390, 768, 1280; reflow 320)

| Id | Critério | Verificação |
|---|---|---|
| CA-E8-40 | Rotas públicas e `/offline` em 360x780, 390x844, 768x1024 e 1280x800: sem rolagem horizontal da página (`scrollWidth <= clientWidth`), `h1` visível, nada cortado ou sobreposto | E-pub |
| CA-E8-41 | O mesmo para todas as rotas autenticadas do inventário com dados, claro e escuro; lista/tabela em cartões abaixo de `md`; em 768 (sidebar recolhida) tabelas sem estourar a página | E-docker |
| CA-E8-42 | Navegação: < `md` `BottomNav` + "Mais"; `md`–`lg` sidebar em ícones com `SidebarTrigger`; ≥ `lg` expandida; sino sempre visível; nenhuma função essencial só em hover ou só no desktop | E-pub (públicas) + E-docker |
| CA-E8-43 | `Dialog`, `Sheet`, `Popover` e calendário ficam dentro da área útil (altura `dvh`, rolagem interna, ação principal alcançável) em 360x640 e com altura de 360x400 (teclado virtual simulado) | E-docker + U |
| CA-E8-44 | Campos de texto, número e seleção com `font-size` computado ≥ 16px abaixo de `md` (iOS não dá zoom ao focar); `MoneyInput` com `inputMode="decimal"` | E-pub + E-docker |
| CA-E8-45 | Safe areas (viewport `cover`): cabeçalho, `BottomNav`, sheets e rodapés de formulário usam `env(safe-area-inset-*)` (topo, base, laterais) | U + inspeção |
| CA-E8-46 | Modo instalado (`display: standalone`, sem botão do navegador): toda rota que não é raiz de módulo tem caminho de volta na própria tela (breadcrumb, "Voltar" ou "Cancelar"); o logo leva a `/inicio` | inspeção + E-docker |
| CA-E8-47 | Gráficos legíveis em 360 (rótulos do eixo sem sobreposição, legenda quebra linha); `SubNav` rola dentro do trilho com foco visível e sem rolagem da página | E-docker |

### E8-QA — verificação sem banco

| Id | Critério | Verificação |
|---|---|---|
| CA-E8-60 | `pnpm test:e2e:publico` (novo): build de produção com variáveis públicas fictícias, `playwright.publico.config.ts` sem `globalSetup`, projetos `v360`, `v390`, `v768`, `v1280`, `serviceWorkers: "block"` por padrão e liberado só em `pwa.spec.ts`; passa sem Docker | E-pub |
| CA-E8-61 | `playwright.config.ts` ignora `e2e/publico/**` e usa `serviceWorkers: "block"` (os E2E existentes não passam a depender do worker); `e2e/{a11y-telas,responsivo-telas,pwa-autenticado}.spec.ts` (`@docker`) existem, compilam e cobrem todo o inventário; ficam como **pendentes de Docker** no roadmap até rodarem | G + E-docker |
| CA-E8-62 | Lighthouse (acessibilidade e boas práticas), móvel e desktop, em `/login`, `/cadastro`, `/recuperar-senha` e `/offline`: acessibilidade 100; pontuação e auditorias reprovadas gravadas em `docs/log-execucao.md`. Não substitui axe nem os testes de teclado | L |
| CA-E8-63 | Só `@axe-core/playwright` e `axe-core` entram em `devDependencies`, na última estável; `pnpm outdated` vazio, `pnpm audit` limpo | G |

### E8-DS — design-system

| Id | Critério | Verificação |
|---|---|---|
| CA-E8-70 | `SkipLink` (`src/components/shared/skip-link.tsx`): tokens, sem hex, foco `ring`, visível só com foco, alvo ≥ 40px; teste RTL; documentado em `docs/design-system.md` | U + inspeção |
| CA-E8-71 | `globals.css`: `scroll-padding` (topo e base) e regra global de `prefers-reduced-motion`; **nenhum token, fonte ou cor novos** | G + inspeção |
| CA-E8-72 | `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` e `src/app/apple-icon.png`: marca do `Logo` em `--primary-foreground` sobre `--primary`; maskable com a marca dentro da zona segura (círculo central de 80% do lado); procedência registrada em `docs/design-system.md` | inspeção |
| CA-E8-73 | Correções de componente que a auditoria apontar (rótulo, alvo, foco, movimento) feitas em `ui/` e `shared/` sem mudar contrato público, cada uma com teste de regressão | U |

## Cenários ponta a ponta da spec §12 (por etapa de conclusão)

| Cenário | Critérios verificáveis | Etapa |
|---|---|---|
| **A — Primeiro acesso** | cria conta e confirma (CA-E2-50); cria família (CA-E2-50); cadastra conta com saldo inicial 1.000,00 no onboarding; dashboard mostra saldo consolidado 1.000,00 (D3; CA-E4-50) | E2 (auth+família), E3 (conta), E4 (dashboard) |
| **B — Despesa** | valor `0`, vazio, `-5`, `1,234.56` rejeitados com mensagem no campo; despesa de 200,00 persiste; saldo da conta cai 200,00 (D1); aparece na listagem (1ª página, ordenação por data desc); dashboard e donut por categoria refletem 200,00 na categoria (CA-E4-51); relatório por categoria (CA-E7-50) | E3 + E4 + E7 |
| **C — Receitas e despesas** | regressão R1: receitas 500,00, despesas 200,00, resultado 300,00, consolidado 1.300,00; transferência de 100,00 não altera receitas/despesas/consolidado; comparação mês atual × anterior conforme D4 (anterior 0 → "sem base de comparação"; CA-E4-34/51/52/53) | E3 (serviço) + E4 (tela) |
| **D — Edição e exclusão** | R7: editar 200,00→250,00 muda despesas e saldo para o novo valor e registra `transaction.updated` com old/new; R8: exclusão lógica zera o efeito e mantém a linha com `deleted_at`; estorno R2 | E3 |
| **E — Colaboração** | integrante consulta dados da família (CA-E2-08/55); sem vínculo não acessa (CA-E2-07/56); verificado no banco (pgTAP) **e** no servidor (I); Etapa 3 repete para `accounts`/`categories`/`transactions` incluindo FK composta (AB-13/14); Etapa 7: membros, papéis e saída (CA-E7-02..06, CA-E7-55..59) | E2 + E3 + E7 |
| **F — Responsividade** | login, dashboard, formulário de transação por toque, listagem como cartões, metas (CA-E6-58) e relatórios (CA-E7-60) em 390px sem rolagem horizontal; bottom nav; modais dentro da área útil; sem dependência de hover | E2 (parcial CA-E2-59), E6/E7 (parcial), completo E8 (CA-E8-40..47) |
| **G — Temas** | claro com `#84CC16`; escuro com Rocket exato; troca não altera dados; persiste após reload; contraste documentado | E1 (CA-E1-04/06/07) + E2 (CA-E2-58) |

## Regra de conclusão

Etapa concluída = todos os `CA-E<n>-*` verdes + `pnpm check`, `pnpm build`, `pnpm db:test`, `pnpm test:integration`,
`pnpm test:e2e` passando + security gate `PASSA` + revisão. Testes de segurança da spec §6.5 exigem o par
permitido/negado: itens 1–5 e 7 cobertos por CA-E2-07..21 e CA-E2-36/37; item 6 (arquivos privados) não se aplica
até existir Storage.
