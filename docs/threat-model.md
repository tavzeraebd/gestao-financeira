# Threat model — Núcleo (Etapas 1–2, com direção para 3+)

Versão 1.2 (2026-10-24: §3.11 metas, divisão e planejamento; §3.12 relatórios, notificações, integrantes e auditoria). Versão 1.1 (2026-10-24: §3.9 dashboard e gráficos, §3.10 compromissos, recorrências e orçamentos). Versão 1.0 (Etapa 0). Método: `fx-threat-modeling` modo completo. Escopo: autenticação, isolamento
familiar, convites, segredos, Server Actions. Cada caso de abuso (`AB-nn`) tem defesa e teste; os testes
aparecem em `acceptance-criteria.md` com o mesmo id.

## 1. Ativos

| Id | Ativo | Por que importa |
|---|---|---|
| A1 | Dados financeiros da família (contas, saldos, lançamentos, metas) — Etapa 3+ | sigilo e integridade; vazamento entre famílias é a falha mais grave (spec §6) |
| A2 | Vínculos e papéis (`family_members`) | controlam todo o acesso; auto-promoção = controle total |
| A3 | Credenciais e sessão (senha, access/refresh token, cookies `sb-*`) | personificação |
| A4 | Tokens de convite | entrada em família alheia |
| A5 | Dados pessoais (e-mail, nome, avatar) | LGPD; enumeração de contas |
| A6 | Segredos de infraestrutura (secret key/service role, credenciais SMTP/OAuth futuras) | ignoram RLS |
| A7 | Trilha de auditoria (`audit_events`) | não-repúdio; investigação |
| A8 | Disponibilidade (Auth, envio de e-mail) | abuso de cadastro/recuperação |

## 2. Fronteiras de confiança

| Id | Fronteira | Não confiável → confiável |
|---|---|---|
| F1 | Navegador → Next.js (proxy, RSC, Server Actions, Route Handler `/auth/confirm`) | toda entrada, cookies, headers, `next`, ids |
| F2 | Next.js → Supabase API (PostgREST/Auth) com JWT do usuário | o servidor Next não é confiável para o banco: o banco decide pelo JWT |
| F3 | PostgREST → Postgres (RLS, RPC `security definer`) | funções definer rodam com privilégio do dono |
| F4 | Navegador → Supabase direto (publishable key é pública) | qualquer pessoa pode chamar a API REST com a publishable key e o próprio JWT, sem passar pelo Next |
| F5 | E-mail (link de confirmação/recuperação) → `/auth/confirm` | link pode ser interceptado/reutilizado |
| F6 | Link de convite compartilhado fora do app (WhatsApp etc.) | canal não controlado |

F4 é a premissa central: **toda regra precisa valer chamando a API diretamente**. Por isso a autorização
fica no banco, e o Next apenas repete por UX.

## 3. Ameaças e casos de abuso

### 3.1 Autenticação (F1, F2, F5)

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-01 | Atacante tenta senhas em massa num e-mail | rate limit nativo do Supabase Auth; mensagem genérica `INVALID_CREDENTIALS`; senha mín. 8 com letras e dígitos (`config.toml`) | integração: erro genérico; config revisada |
| AB-02 | Enumeração de contas pelo cadastro ou recuperação ("e-mail já existe") | com confirmação ligada o Supabase devolve sucesso falso no cadastro duplicado; `requestPasswordReset` responde sempre a mesma mensagem | E2E/integração: resposta idêntica p/ e-mail existente e inexistente |
| AB-03 | Usuário não confirmado acessa o app | `enable_confirmations = true`; login devolve `EMAIL_NOT_CONFIRMED`; sem sessão até confirmar | E2E: cadastro → login antes de confirmar falha; após link do Mailpit, entra |
| AB-04 | Open redirect via `?next=https://evil` ou `//evil` | `safeNextPath()` com allowlist de prefixos | unit: tabela de entradas maliciosas |
| AB-05 | Reuso de link de confirmação/recuperação | `verifyOtp` com `token_hash` é de uso único e expira (Supabase); falha → `/login?erro=link_invalido` | integração/E2E: segundo uso falha |
| AB-06 | Sessão roubada/expirada continua válida no servidor; token de sessão lido por script | servidor usa `getUser()` (valida no Auth); logout chama `signOut()` (revoga refresh). Cookies `sb-*`: o padrão do `@supabase/ssr` é `httpOnly: false` e sem `Secure`, então os dois `setAll` (`src/lib/supabase/server.ts` e `proxy.ts`) **forçam** `httpOnly: true`, `sameSite: "lax"` e `secure` em produção. Sem cliente Supabase no navegador ([ADR-0016](adr/0016-sessao-so-no-servidor.md); corrige SEC-3) | E2E: após logout, rota privada → `/login`; atributos `HttpOnly`/`SameSite=Lax` do cookie `sb-*` conferidos (e `Secure` em build de produção) |
| AB-07 | Página privada servida sem sessão por falha do proxy | layout chama `requireUser()`/`requireMembership()`; RLS devolve vazio | E2E: acesso direto sem cookie → `/login?next=` |
| AB-08 | Redefinição de senha sem sessão de recuperação | `/redefinir-senha` exige usuário da sessão criada por `verifyOtp(type=recovery)`; action `updatePassword` exige sessão | E2E: abrir direto → `/recuperar-senha` |
| AB-09 | "Simular" autenticação (bypass em dev) | proibido por spec §6.3; nenhum modo fake; E2E usa Auth local real + Mailpit | revisão de código |

### 3.2 Isolamento familiar (F2, F3, F4)

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-10 | Usuário da família B faz `GET /rest/v1/families?id=eq.<A>` com o próprio JWT | RLS `is_family_member` | pgTAP: B lê 0 linhas de A (families, members, invites, audit, profiles) |
| AB-11 | Usuário sem família lê qualquer dado | helpers exigem vínculo `active` | pgTAP |
| AB-12 | Integrante removido continua lendo | helpers exigem `status='active'` | pgTAP (Etapa 2: simular `status='removed'` como postgres) |
| AB-13 | Usuário cria lançamento com `family_id` alheio (Etapa 3+) | policy insert `with check is_family_member(family_id)`; FK composta impede referenciar conta/categoria de outra família | pgTAP Etapa 3 |
| AB-14 | Usuário lança na própria família referenciando conta de outra (`account_id` alheio) | FK composta `(family_id, account_id)` | pgTAP Etapa 3 |
| AB-15 | `anon` lista tabelas ou chama RPC | `revoke` de `anon` em tabelas e funções de `public` | pgTAP: privilégios de `anon` = vazio |
| AB-16 | Tabela nova esquecida sem RLS | pgTAP falha se qualquer tabela de `public` tiver RLS desligado | pgTAP `000`/`00_privileges` |
| AB-17 | Função `security definer` sequestrada por `search_path` | `set search_path = ''` + nomes qualificados; pgTAP verifica `proconfig` de toda função definer em `public`/`private` | pgTAP |
| AB-18 | Helpers `private.*` chamados via API para sondar | schema `private` não exposto (`[api] schemas=["public"]`) | integração: `rpc('is_family_member')` → 404 |
| AB-19 | Ler perfis de usuários de outras famílias | `profiles_select` só próprio + `shares_family_with` | pgTAP |
| AB-20 | Operação negada deixa escrita parcial | RPCs numa transação; `raise` aborta tudo | pgTAP: após erro, contagens inalteradas |

### 3.3 Papéis e auto-promoção (F3, F4)

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-21 | Member faz `PATCH /family_members?id=eq.<seu>` com `role=owner` | sem grant/policy de update em `family_members` | pgTAP: 42501 e papel inalterado |
| AB-22 | Member insere vínculo próprio em outra família | sem grant de insert | pgTAP |
| AB-23 | Admin cria convite `admin` para um cúmplice | RPC exige owner para `role='admin'` | pgTAP |
| AB-24 | Member cria/revoga convite | RPC → `FORBIDDEN` | pgTAP |
| AB-25 | Admin revoga convite de outra família passando id | RPC filtra pela família do chamador; responde `INVITE_NOT_FOUND` | pgTAP |
| AB-26 | Server Action recebe `role`/`family_id` forjado | actions não aceitam `family_id`; `role` do convite validado por Zod e pela RPC; papel do chamador sempre lido do banco | unit/integração |
| AB-27 | Segundo owner por corrida | índice único "1 owner ativo por família" | pgTAP |

### 3.4 Convites (F6, F3)

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-30 | Adivinhar/forçar token | 256 bits CSPRNG; formato validado | pgTAP: token de 64 hex aleatório inexistente → `INVITE_NOT_FOUND` |
| AB-31 | Vazamento do banco revela tokens utilizáveis | só `sha256(token)`; coluna fora do grant de select | pgTAP: `select token_hash` por authenticated → 42501 |
| AB-32 | Reusar convite já aceito (encaminhado a terceiros) | uso único com lock | pgTAP: 2º aceite → `INVITE_ALREADY_USED` |
| AB-33 | Aceitar convite expirado/revogado | checagens na RPC | pgTAP |
| AB-34 | Link vinculado a e-mail usado por outra conta | `INVITE_EMAIL_MISMATCH` | pgTAP |
| AB-35 | Token vaza por Referer/log | `Referrer-Policy: no-referrer` em `/convite/*`; logger não registra caminho/URL; página sem recursos de terceiros | revisão + teste de header (E2E) |
| AB-36 | Spam de convites | máx. 20 pendentes por família | pgTAP |
| AB-37 | Aceite concorrente em duas famílias | índice único "1 família ativa por usuário" → `ALREADY_IN_FAMILY` | pgTAP |
| AB-38 | Prévia do convite expõe dados de quem convidou | `get_invite_preview` devolve só nome da família, papel, validade, status | pgTAP: colunas da função |

### 3.5 Segredos (A6)

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-40 | Secret key no bundle do navegador | só `NEXT_PUBLIC_SUPABASE_URL` e `..._PUBLISHABLE_KEY` são públicas; `src/lib/env/server.ts` com `server-only`; nenhuma referência a `SUPABASE_SECRET_KEY` em `src/` | grep no aceite + `pnpm build` e busca no `.next/static` |
| AB-41 | `.env` commitado | `.gitignore` (`.env*`, exceto `.env.example`); security gate (gitleaks) | gate |
| AB-42 | Token/senha em log ou mensagem de erro | logger com allowlist tipada; mensagens ao usuário de `error-messages.ts` | unit do logger; revisão |
| AB-43 | Service role usada no fluxo do usuário "para simplificar" | proibido sem ADR; não existe `admin.ts` em `src/` nas Etapas 1–2 | grep no aceite |

### 3.6 Server Actions e entrada (F1)

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-50 | Chamar Server Action diretamente (POST forjado) com payload fora do formulário | Zod no servidor em toda action (`runAction`); limites de tamanho | unit: payloads inválidos → `VALIDATION_ERROR` |
| AB-51 | CSRF contra Server Action | verificação de Origin nativa do Next (não desligar); cookies `SameSite=Lax` | revisão de config |
| AB-52 | Duplo envio cria família/lançamento duplicado | botão desabilitado em `loading`; índice único (família ativa) e `idempotency_key` (Etapa 3) | E2E duplo clique; pgTAP |
| AB-53 | Erro interno vaza stack/SQL | `toAppError` + mensagem fixa; `error.tsx` genérico com `requestId` | unit |
| AB-54 | Clickjacking em telas autenticadas | `X-Frame-Options: DENY` + `frame-ancestors 'none'` | E2E de header |
| AB-55 | XSS por `display_name`/nome da família | React escapa; sem `dangerouslySetInnerHTML`; limites no banco | lint + revisão |

### 3.7 Auditoria (A7)

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-60 | Apagar/alterar rastro | `audit_events` sem grant de escrita; só `private.log_audit` | pgTAP |
| AB-61 | Member lê auditoria com dados de outros | select só owner/admin | pgTAP |
| AB-62 | Auditoria guardando PII/token | catálogo fechado de `metadata` (`data-model.md` §4.6) | pgTAP: metadata dos eventos da Etapa 2 sem chaves proibidas |

### 3.8 Integridade financeira (Etapa 3; [ADR-0018](adr/0018-escrita-e-correcao-de-lancamentos.md))

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-70 | Member grava lançamento em nome de outro integrante (`created_by` forjado) | `created_by` fora do grant de insert, com default `auth.uid()` e `with check created_by = auth.uid()` | pgTAP CA-E3-05 |
| AB-71 | Member altera ou exclui lançamento alheio pela API direta | policy de update `owner/admin or created_by = auth.uid()`; sem grant de delete | pgTAP CA-E3-06 |
| AB-72 | Lançamento inconsistente pela API (categoria de outro tipo, conta arquivada, data antes do saldo inicial, efetivado no futuro) | triggers de invariantes no banco | pgTAP CA-E3-07 |
| AB-73 | Estorno maior que o original, estorno de transferência ou estornos concorrentes que somados passam do valor | trigger com `for update` no original e soma dos estornos | pgTAP CA-E3-09 |
| AB-74 | "Desexcluir" ou editar lançamento excluído para reescrever o histórico | policy de update exige `deleted_at is null`; trigger fixa `deleted_at`/`deleted_by` | pgTAP CA-E3-08 |
| AB-75 | Edição financeira sem rastro | trigger `after` `security definer` grava `transaction.updated` com old/new | pgTAP CA-E3-15 |

### 3.9 Dashboard e gráficos (Etapa 4; [ADR-0020](adr/0020-dashboard-agregacao-compartilhada.md), [ADR-0021](adr/0021-graficos-recharts-cliente-sob-demanda.md))

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-80 | Gráfico ou indicador mostra dados de **outra família** vindos de cache: `"use cache"`/`unstable_cache`/cache de `fetch` no servidor, biblioteca de cache ou `localStorage` no cliente, Router Cache depois de trocar de usuário no mesmo navegador | ADR-0015; os dados chegam ao gráfico só por props do RSC da requisição; os gráficos não fazem fetch nem usam storage; páginas dinâmicas (cookies); logout com `signOut` + navegação nova | E2E CA-E4-57 (A sai, B entra no mesmo navegador: nenhum valor de A no DOM); grep CA-E4-38 |
| AB-81 | Função de agregação devolve linhas de outra família (`security definer` por engano ou parâmetro `p_family_id` forjado) | funções `security invoker`, sem parâmetro de família, com filtro `current_family_id()` + RLS | pgTAP CA-E4-01/02 (`prosecdef = false`; B e C recebem vazio/zero) |
| AB-82 | Consulta cara por intervalo enorme (`?de=2000-01-01&ate=9999-12-31`; `monthly_cash_flow` com séculos) | `dashboardFiltersSchema` tolerante + `resolvePeriod` (até 366 dias, `ate ≤ fim do mês atual`); `monthly_cash_flow` até 24 meses → `INVALID_INPUT` | unit CA-E4-30/31; pgTAP CA-E4-03 |
| AB-83 | XSS pelo nome de categoria no tooltip, na legenda ou na tabela do gráfico | o Recharts escreve texto SVG escapado; tooltip e legenda em JSX; o `chart` do shadcn (com `dangerouslySetInnerHTML`) não é usado | grep CA-E4-70; RTL com nome `<img onerror>` exibido como texto (CA-E4-71) |
| AB-84 | Número errado em silêncio: agregado acima do inteiro seguro, soma em ponto flutuante ou fórmula repetida em componente | montantes em `text` → `fromDbNumeric` (`RangeError` → `INTERNAL_ERROR`); fórmulas só em SQL e em `reports/domain`; componentes só formatam | unit CA-E4-36; grep CA-E4-37; pgTAP CA-E4-06 |
| AB-85 | Member lê a auditoria pelo dashboard ("atividade recente") | o dashboard não lê `audit_events` (ADR-0020 §5); RLS da auditoria só owner/admin | grep CA-E4-38 (nenhum `audit_events` em `src/modules/reports`) |

### 3.10 Compromissos, recorrências e orçamentos (Etapa 5; [ADR-0022](adr/0022-compromissos-pagamento-por-rpc.md)–[ADR-0024](adr/0024-orcamentos-mensais.md))

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-90 | `materialize_recurrences` como superfície de abuso: (a) materializar séries de outra família; (b) chamar em laço para inflar a tabela ou travar o banco; (c) criar ocorrências em nome de outro integrante; (d) usar o privilégio do definer para escrever além do derivado | sem parâmetros (família = `current_family_id()`); idempotente (`unique (recurrence_id, occurrence_date)` + `on conflict do nothing`); tetos de 60 por série e 500 por chamada; até 100 séries ativas por família; `for update skip locked`; só insere linhas derivadas de séries da própria família, com `created_by` = autor da série; `search_path=''` | pgTAP CA-E5-09/02 (B chama: nada de A muda; segunda chamada devolve 0; tetos; `anon` → 42501) |
| AB-91 | Inserir lançamento com `recurrence_id`/`occurrence_date` forjados para "ocupar" a ocorrência de uma série (ela nunca seria gerada) ou fazer um lançamento parecer recorrente | colunas fora dos grants; FK composta com `recurrences` | pgTAP CA-E5-07 (insert com as colunas → 42501) |
| AB-92 | Member paga ou cancela compromisso alheio pela API direta; usuário de outra família paga pelo id | RPC com família do chamador (`NOT_FOUND` para id alheio) e autorização owner/admin/autor/responsável (cancelar: sem responsável) | pgTAP CA-E5-05/06; integração CA-E5-33 |
| AB-93 | Dupla contabilização: pagar duas vezes (duplo clique, duas abas) ou "pagar" criando um lançamento novo | `for update` + `status='pending'` na RPC e transição no trigger; pagar muda a **mesma linha**; botão em `loading` | pgTAP R12 (contagem de linhas igual; segundo pagamento → `INVALID_STATUS_TRANSITION`); E2E CA-E5-55 |
| AB-94 | Mudar `status` direto pela API (`paid → pending` para tirar o efeito sem rastro, `canceled → paid`, editar um cancelado) | `status` fora do grant de update; trigger de transição; cancelado imutável | pgTAP CA-E5-06/07 |
| AB-95 | Pagar com data futura, antes do saldo inicial ou numa conta arquivada para distorcer saldos | RPC (`FUTURE_DATE_NOT_ALLOWED`) + trigger (`DATE_BEFORE_OPENING_BALANCE`, `ACCOUNT_ARCHIVED`); FK composta da conta | pgTAP CA-E5-05 |
| AB-96 | Orçamento com categoria de receita, de outra família ou arquivada para mostrar números enganosos | trigger (`CATEGORY_TYPE_MISMATCH`, `CATEGORY_ARCHIVED` na criação e no desarquivamento); FK composta; o orçamento existente com categoria arquivada continua calculando e aparece com selo | pgTAP CA-E5-13; E2E CA-E5-56 |
| AB-97 | Member cria ou altera orçamento pela API direta | RLS insert/update owner/admin | pgTAP CA-E5-04 |
| AB-98 | A edição da série sobrescreve ocorrência paga, cancelada ou editada (perda de dado) ou move ocorrência de outra série | propagação só nas intocadas, pela comparação com os valores OLD, e só da própria série; agenda imutável | pgTAP CA-E5-12 |
| AB-99 | Uma série quebrada (conta arquivada, responsável removido, autor que saiu) bloqueia a materialização da família inteira (negação de serviço) | bloco `exception` por série; `last_failure_code`; as outras séries seguem; a UI mostra "Precisa de atenção" com o próximo passo | pgTAP CA-E5-10; E2E CA-E5-54 |

### 3.11 Metas, divisão e planejamento (Etapa 6; [ADR-0025](adr/0025-metas-reserva-sem-transacao.md)–[ADR-0027](adr/0027-planejamento-simulacao-sem-persistencia.md))

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-100 | Aporte em meta de **outra família** (`goal_id` alheio) ou com `family_id` alheio pela API direta | FK composta `(family_id, goal_id)` → `23503`; policy insert `is_family_member(family_id)` → `42501`; `goal_summary` invoker sem parâmetro de família | pgTAP CA-E6-02/03 |
| AB-101 | Member registra aporte ou retirada **em nome de outro** integrante (`member_id` alheio) ou forja `created_by` | trigger: member só com `member_id = private.current_member_id()` (`42501`); `created_by` fora do grant, `with check created_by = auth.uid()` | pgTAP CA-E6-05 |
| AB-102 | Retirada (ou exclusão de aporte) que deixa a meta negativa; duas retiradas concorrentes que somadas passam do acumulado | `pg_advisory_xact_lock` da meta + soma no trigger → `GOAL_NEGATIVE_PROGRESS`; contribuição imutável (só `deleted_at` no grant) | pgTAP CA-E6-05/06 (concorrência com duas sessões) |
| AB-103 | Dupla contabilização: aporte tratado como despesa, transferência ou receita; meta somada ao consolidado | aporte sem vínculo com `transactions` (ADR-0025); nenhuma função de saldo/totais lê `goal_contributions` | pgTAP/integração R15 (CA-E6-14, CA-E6-36) |
| AB-104 | Divisão com integrante de **outra família** ou **removido** (inclusive para sondar se um `member_id` existe) | RPC: vínculo desta família (`INVALID_INPUT` igual para inexistente e alheio), `active` ou já presente (`MEMBER_INACTIVE`); FK composta | pgTAP CA-E6-08 |
| AB-105 | **Soma de parcelas manipulada**: insert direto em `expense_splits`, parcelas que não fecham, negativas, com 3 casas, integrante repetido, ou valor da despesa alterado depois para descasar | sem grant de escrita; RPC valida formato, distinção e Σ exata; constraint trigger diferida Σ = `amount`; reescala no `after update of amount` | pgTAP CA-E6-07/08/09 (R17) |
| AB-106 | Member divide despesa alheia; usuário de outra família divide pelo id; divisão de transferência, receita, cancelada ou estorno | RPC: família do chamador (`NOT_FOUND`), owner/admin/autor (`42501`), `SPLIT_NOT_ALLOWED` | pgTAP CA-E6-07 |
| AB-107 | **Liquidação forjada em nome de outro**: member registra acerto entre dois terceiros, ou com `created_by` forjado, para apagar uma dívida | policy insert: owner/admin ou parte (`from`/`to` = próprio vínculo); `created_by` fixo; auditoria `settlement.created`; a parte afetada recebe `financial_event` (Etapa 7) | pgTAP CA-E6-10; CA-E7-07 |
| AB-108 | Member altera ou exclui aporte ou acerto alheio; "desexclui" um registro | policy update owner/admin ou autor e `deleted_at is null`; só `deleted_at` no grant; trigger fixa `deleted_by` | pgTAP CA-E6-06/10 |
| AB-109 | Simulador como superfície: entradas extremas geram `NaN`/`Infinity` ou travam a página; cenários vazam por URL, storage ou log; taxa "sugerida" passa por recomendação | Zod com limites (D15); domínio devolve `OUT_OF_RANGE`, nunca não finito; nada persistido, sem URL nem storage; taxa só informada; aviso fixo | unit CA-E6-33; grep CA-E6-38; E2E CA-E6-56 |

### 3.12 Relatórios, notificações, integrantes e auditoria (Etapa 7; [ADR-0028](adr/0028-relatorios-reutilizam-reports.md)–[ADR-0030](adr/0030-gestao-de-integrantes-e-atividade.md))

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-110 | **Auto-promoção via RPC**: member ou admin chama `change_member_role` no próprio vínculo; admin promove alguém; qualquer um passa `p_role = 'owner'` | papel do chamador lido do banco antes de tudo; só owner; alvo ≠ chamador (`CANNOT_TARGET_SELF`); `p_role in ('admin','member')`; owner só por `transfer_ownership`; `family_members` sem grant de escrita | pgTAP CA-E7-02 |
| AB-111 | **Remoção do último owner** (admin remove o owner, owner remove ou rebaixa a si, owner sai) deixando a família sem dono | ninguém remove o owner; owner não sai (`OWNER_MUST_TRANSFER`); alvo ≠ chamador; troca atômica; índice único "1 owner ativo" | pgTAP CA-E7-03/04 |
| AB-112 | **Transferir propriedade a não-membro** (usuário de outra família, vínculo encerrado, id inventado) ou admin removendo admin | alvo por `id` + família do chamador + `active` → `NOT_FOUND`; regra admin→member | pgTAP CA-E7-03/05 |
| AB-113 | Removido volta pela porta dos fundos: convite pendente que ele mesmo criou; sessão aberta continua lendo ou escrevendo | revogação dos convites pendentes criados pelo alvo na mesma transação; helpers exigem `active`; `requireMembership` → `/onboarding`; RPCs e RLS negam | pgTAP CA-E7-06; E2E CA-E7-57 |
| AB-114 | **Notificação lida por outro usuário** (select ou update por id, inclusive de outro integrante da mesma família) | RLS `user_id = auth.uid()` **e** vínculo ativo; grant de update só em `read_at`; trigger impede desmarcar | pgTAP CA-E7-08 |
| AB-115 | **Geração de notificação como oráculo de existência**: passar ids ou datas para descobrir compromissos, metas ou integrantes de outra família; diferença de erro entre "não existe" e "é de outro" | `refresh_notifications` sem parâmetros, só para o chamador e na família dele; `openNotification` devolve `NOT_FOUND` igual para os dois casos | pgTAP CA-E7-07; integração CA-E7-35 |
| AB-116 | Notificação forjada (insert direto com texto enganoso ou link externo) ou `href` manipulado | sem grant de insert/delete; `href` montado no app por lista fechada de rotas internas com uuid validado; texto em JSX (escapado) | pgTAP CA-E7-08; unit CA-E7-33 |
| AB-117 | **Relatório com família errada**: parâmetro de família, função `security definer`, cache entre usuários, troca de usuário no mesmo navegador | funções invoker sem parâmetro de família (filtro `current_family_id()` + RLS); sem cache (ADR-0015); dados só por props | pgTAP CA-E7-11; E2E CA-E7-58 |
| AB-118 | Member lê a auditoria pela tela de atividade ou pela API; metadata com PII | RLS select owner/admin; página `notFound()` para member; catálogo fechado sem nome, e-mail, descrição; descrição por lista fechada | pgTAP CA-E7-15; E2E CA-E7-56 |
| AB-119 | Corrida: owner transfere enquanto remove o mesmo integrante; remoção dupla; dois owners transferindo | `for update` nos dois vínculos em ordem de `id`; alvo precisa estar `active`; índice único de owner | pgTAP CA-E7-05 (duas sessões) |

### 3.13 Hardening e entrega (Etapa 9; [ADR-0033](adr/0033-limites-de-volume-e-frequencia-no-banco.md)–[ADR-0039](adr/0039-ci-github-actions-e-gate-de-seguranca-portatil.md))

| Id | Caso de abuso | Defesa | Teste |
|---|---|---|---|
| AB-120 | **Força bruta e credential stuffing sem rastro** (login falho sem IP nem identificador da conta) | log `warn` com `ip` e `emailHmac`; balde `auth_failure` (IP + e-mail) e `auth_ip`; mensagem igual para conta existente e inexistente | CA-E9-33, 35 |
| AB-121 | **Troca de senha silenciosa** após sessão roubada | trigger em `auth.users` grava `security_events` (não forjável pelo cliente); o titular vê em `/configuracoes` | CA-E9-09..11, 43 |
| AB-122 | **Inundação de volume** pela API direta (aportes, acertos, lançamentos, notificações) até degradar a família ou estourar o inteiro seguro | triggers com teto ativo e frequência por usuário (excluídas contam), valores em `private.volume_limits`; teto de 500 notificações e intervalo de 30 s | CA-E9-01..08, 45 |
| AB-123 | **Oráculo de volume entre famílias** (inserir com `family_id` alheio para saber se a outra família está no teto) | a verificação só conta quando `is_family_member`; senão a RLS/FK nega como antes | CA-E9-05 |
| AB-124 | **Tentativa negada de auto-promoção/remoção do owner sem rastro**, ou poluição da trilha com negações em massa | negação devolve código e grava `member.action_denied`; 20 por ator/hora; metadata sem PII | CA-E9-12..15 |
| AB-125 | **XSS** (script injetado, inline ou de terceiros) | CSP com nonce por requisição e `strict-dynamic`; sem `unsafe-inline`/`unsafe-eval` em `script-src`; `object-src 'none'`, `base-uri`, `form-action` | CA-E9-50, 51, 53, 55 |
| AB-126 | **CSP derruba o app ou o service worker** (disponibilidade) | `worker-src 'self'` explícito; `/offline` com política própria estática; testes de violação e hidratação; reversão por commit | CA-E9-53..55, 57 |
| AB-127 | **IP forjado** (`X-Forwarded-For` ou `x-client-ip` do cliente) para driblar o limite ou envenenar o log | IP só do `proxy`, pela entrada confiável contada da direita; cabeçalho do cliente sobrescrito; IP nulo ignora baldes por IP (não trava ninguém) | CA-E9-31, 36, 52 |
| AB-128 | **Exclusão de conta indevida** (sessão roubada, owner que deixa a família sem dono, apagar dado de terceiros, resíduo de PII) | reautenticação com `amr` de senha em 5 min exigida no banco; `OWNER_MUST_TRANSFER`; só dado do titular é anonimizado, a família permanece; família sem ninguém é apagada por mapa verificado; `auth.users` neutralizado; limite 3/h | CA-E9-17..22, 40, 41, 44 |
| AB-129 | **E-mail em massa a terceiro** pelos fluxos de cadastro, reenvio e recuperação | baldes `auth_email_ip` e `auth_email_target`; excedente responde neutro sem chamar o Auth (a parte do provedor é pendência do usuário, SEC-10) | CA-E9-36 |
| AB-130 | **Cadeia de suprimentos no CI** (ação alterada, `pull_request_target`, segredo em PR de fork, permissões amplas) | ações por SHA, `permissions: contents: read`, sem `pull_request_target`, sem segredo de produção, migrations de produção fora do CI | CA-E9-60, 62..64 |
| AB-131 | **Backup com PII fora de controle** (dump em repositório, em artefato do CI ou sem criptografia) | runbook: dump só local/cofre, criptografado, nunca versionado; `security:check` varre segredos; restauração ensaiada em projeto descartável | CA-E9-70, 71 |

## 4. Riscos residuais aceitos (Etapas 1–2)

- Token de convite trafega no caminho da URL (logs de hospedagem/proxy reverso podem registrá-lo). Mitigado por uso único, 7 dias e revogação. Revisar na Etapa 9 com a plataforma de deploy.
- Rate limit de Server Actions próprias não existia nas Etapas 1–8. **Tratado na Etapa 9** (ADR-0034, em memória do processo, uma instância; vira decisão pendente se houver mais de uma) e, para a API direta, ADR-0033.
- Sem MFA e sem proteção contra senhas vazadas (recurso de plano pago do Supabase) — fora do escopo da spec.
- Exclusão de conta (LGPD) não implementada nas Etapas 1–8; FKs `restrict` bloqueiam remoção acidental. **Tratada na Etapa 9** (ADR-0038: anonimização + apagar a família sem integrantes). Portabilidade (exportar dados) continua fora do escopo.

## 5. Requisitos de segurança derivados (entram nos pedidos aos implementadores)

1. O sistema deve negar leitura e escrita de dados de família a quem não tem vínculo ativo — verificável por pgTAP AB-10/11/12/19.
2. O sistema deve impedir qualquer alteração de papel ou vínculo fora das RPCs — pgTAP AB-21/22/27.
3. O sistema deve aceitar convite só uma vez, dentro da validade, não revogado e (se vinculado) pelo e-mail correto — pgTAP AB-30..37.
4. O sistema deve manter `anon` sem privilégio em `public` e toda tabela com RLS — pgTAP AB-15/16/17.
5. O sistema não deve expor secret key no cliente nem registrar token/senha/e-mail em log — grep + unit AB-40/42/43.
6. O sistema deve validar `next` e toda entrada de Server Action no servidor — unit AB-04/50.
7. O sistema nunca deve exibir agregado de uma família a outra, nem por cache — pgTAP AB-81 + E2E AB-80 (Etapa 4).
8. O sistema deve mudar o status de um lançamento só pelas RPCs de pagamento e cancelamento, uma vez — pgTAP AB-92..95 (Etapa 5).
9. A materialização de recorrências deve ser idempotente, limitada e restrita à família do chamador — pgTAP AB-90/91/99 (Etapa 5).

10. O sistema deve impedir que aportes, parcelas e liquidações alterem saldos ou totais, e garantir Σ parcelas = valor da despesa — pgTAP AB-103/105 (Etapa 6).
11. O sistema deve permitir mudança de papel e vínculo só pelas RPCs, com exatamente um owner ativo, e revogar os convites de quem sai — pgTAP AB-110..113/119 (Etapa 7).
12. O sistema deve mostrar cada notificação só ao destinatário com vínculo ativo, sem servir de oráculo — pgTAP AB-114..116 (Etapa 7).

Riscos residuais aceitos nas Etapas 6–7: o acerto entre integrantes é declarado por uma das partes, sem aceite da outra (mitigado por auditoria e
notificação à parte afetada); notificações são instantâneos e só são geradas quando o usuário usa o app; "convite recebido" não existe sem e-mail;
um owner sozinho não pode sair da família.

Riscos residuais aceitos nas Etapas 4–5: a materialização roda no render do Server Component (escrita num GET; idempotente e
limitada; reavaliar na Etapa 9); o `period_summary` filtra só pela RLS (desempenho; medir na Etapa 9); a propagação de série
gera um evento de auditoria por ocorrência.
