# ADR-0035 — Log de segurança com IP e HMAC de e-mail, e eventos de segurança da conta (`security_events`)

Status: aceita (2026-10-28, Etapa 9) · Escopo: `src/server/logger.ts`, `src/server/action.ts`, `src/server/log-identity.ts`, `src/lib/client-ip.ts`, `src/lib/env/server.ts` (`LOG_HMAC_KEY`, `TRUSTED_PROXY_HOPS`), tabela `public.security_events` e trigger em `auth.users`, bloco "Atividade de segurança" em `/configuracoes` · Fecha SEC-4 · Complementa ADR-0016, ADR-0018 (auditoria), `architecture.md` §8

**Contexto.** SEC-4: login falho e acesso negado vão ao stdout sem IP, sem identificador pseudonimizado do e-mail e sem `inviteId`, o que impede investigar força bruta e credential stuffing; troca de senha não gera evento. `audit_events` exige `family_id` (não serve a quem ainda não tem família) e é lida por owner/admin (mostrar a troca de senha de um integrante à gestão da família seria exposição indevida).

**Decisão.**
1. **Allowlist do logger ganha três campos**, cada um validado por padrão estrito (valor fora do padrão é descartado, como hoje): `ip` (IPv4 ou IPv6 válido, até 45 caracteres), `emailHmac` (16 hex) e `inviteId` (uuid). Continua proibido logar e-mail, nome, senha, token, cookie, cabeçalho, URL e entrada do usuário.
2. **Quando logar o IP**: nas linhas `warn`/`error` de `runAction` (falha de ação, acesso negado, rate limit) e nunca nas linhas `info` de sucesso, para reduzir a coleta ao que a investigação exige. O IP é dado pessoal (LGPD): base legal de **legítimo interesse para segurança**, retenção limitada à do log da plataforma (verificada no runbook), sem cópia em banco.
3. **`emailHmac`** = primeiros 16 hex de `HMAC-SHA256(LOG_HMAC_KEY, e-mail em minúsculas e sem espaços)`. `LOG_HMAC_KEY` é segredo de servidor (mínimo 32 caracteres), **opcional** no código: sem ela o campo é omitido e o servidor avisa uma vez. **Nunca** cai para hash sem chave (um hash simples de e-mail é reversível por dicionário). Só as ações de autenticação e de convite informam o e-mail (`identity` em `runAction`), apenas quando o schema validou. `inviteId` só quando o id está na entrada da ação (revogar, criar); nunca o token.
4. **`public.security_events`** (por usuário, não por família): `id`, `user_id` (FK `profiles`, restrict), `action` (`check in ('password.changed')`), `metadata jsonb` (`{}`), `created_at`. RLS: `select` só do próprio usuário (`user_id = (select auth.uid())`); **nenhum** grant de escrita. A escrita é um **trigger `after update of encrypted_password` em `auth.users`** (`security definer`, `search_path = ''`, `when (new.encrypted_password is not null and old.encrypted_password is distinct from new.encrypted_password)`), então cobre troca logada, recuperação por e-mail e qualquer caminho do Auth, e não pode ser forjada pelo cliente. O padrão de trigger em `auth.users` já existe e está em produção (`on_auth_user_created`).
5. **Leitura**: `/configuracoes` mostra as 10 últimas entradas ("Senha alterada em 28/10/2026 14:03"). Sem notificação por e-mail nesta etapa (depende de SMTP; o aviso nativo do Auth fica nas pendências do usuário).
6. **Eventos de integrantes negados** têm trilha própria na auditoria da família (ADR-0036); não entram aqui.

**Alternativas.**
- Registrar a troca de senha em `audit_events`: sem família não há onde gravar, e a gestão leria um dado privado.
- Chamar uma RPC `record_security_event` pela Server Action: o cliente da API poderia chamá-la direto e forjar ou omitir eventos; o trigger é à prova disso.
- Logar o IP completo em todas as linhas: coleta além do necessário.
- Hash do e-mail sem chave: reversível por dicionário. IP truncado: perde a capacidade de correlacionar ataques de um mesmo host.
- Serviço de observabilidade externo: dependência e custo sem requisito.

**Consequências.** A investigação de força bruta passa a ter IP e identificador estável por conta no log, sem expor o e-mail. `LOG_HMAC_KEY` e `TRUSTED_PROXY_HOPS` entram na configuração do Render (item do usuário). Trocar `LOG_HMAC_KEY` quebra a correlação histórica (aceito; rotação documentada no runbook). O evento de troca de senha existe a partir da migration; não há retroativo.
