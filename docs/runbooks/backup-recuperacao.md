# Runbook — Backup e recuperação do Supabase hospedado

Versão 1.0 (2026-10-28, Etapa 9) · Dono: architect · Execução: usuário ou agente autorizado · Referências: `architecture.md` §11 ("não afirmar backup sem verificar"), ADR-0035, ADR-0038, `contracts/etapa-9.md` §9 (U-8), CA-E9-70..72.

**Regra deste documento:** nada abaixo afirma que um backup existe, quanto dura ou que restaura. Todo item marcado **[confirmar no painel]** é fato do plano do Supabase que só o titular do projeto vê. "Backup verificado" só pode ser declarado com um registro na §7.

## 1. O que precisa ser protegido

| Ativo | Onde está | Observação |
|---|---|---|
| Dados do app (`public.*`: famílias, lançamentos, metas, divisão, auditoria, notificações) | Postgres do projeto Supabase | O dado crítico. Dinheiro em `numeric`, sem cache externo (ADR-0003, ADR-0015) |
| Usuários e credenciais (`auth.users`, identidades, sessões) | schema `auth` do mesmo Postgres | O dump do CLI **pode não incluir** schemas gerenciados por padrão **[confirmar no painel / testar na restauração]**; sem `auth`, `profiles` fica sem dono e ninguém entra |
| Esquema (tabelas, RLS, funções, triggers) | `supabase/migrations/` no Git | Reconstrói o esquema, não os dados |
| Segredos (chaves do Supabase, `LOG_HMAC_KEY`, `APP_URL`) | painel do Supabase e variáveis do Render | Não vão a backup de dados; ver §6 |
| Storage | não existe (sem upload no produto) | — |

Os dados do navegador (tema) e o cache do service worker não guardam dado financeiro (ADR-0031) e não entram em backup.

## 2. Objetivos propostos (a ratificar pelo usuário)

| Objetivo | Proposta | Motivo |
|---|---|---|
| RPO (perda máxima aceita) | 24 h | uso familiar, escrita esparsa; compatível com backup diário |
| RTO (tempo para voltar) | 4 h úteis | restauração manual em projeto novo + troca das variáveis do Render |

Se o plano contratado não entregar o RPO acima **[confirmar no painel]**, a alternativa é o dump lógico manual da §4 em periodicidade menor, ou subir de plano. Decisão do usuário.

## 3. Backup nativo do Supabase

1. No painel do projeto: *Database → Backups*. Anotar na §7: plano, frequência, janela de retenção, existência de PITR (recuperação para um instante) **[confirmar no painel]**.
2. Se o plano não tiver backup diário, **registrar o risco** (perda total desde a última cópia manual) e tratar a §4 como obrigatória.
3. Ligar PITR só se o RPO exigir; é decisão de custo do usuário.

## 4. Dump lógico manual (independente do plano)

Executar de uma máquina de confiança, com a *connection string* do banco (pooler, painel → *Database → Connection string*) em variável de ambiente `SUPABASE_DB_URL` **na sessão**, nunca em arquivo versionado nem em segredo do GitHub.

```bash
# esquema (referência) e dados do app
supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-schema.sql
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only -f backup-dados.sql
# usuários: incluir o schema auth explicitamente e validar na restauração (§5, passo 5)
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --schema auth -f backup-auth.sql
```

Regras: arquivos **criptografados** em repouso (ex.: `age`/`gpg`) e guardados fora do repositório e fora de artefatos de CI; contêm PII (e-mail, nomes) e dados financeiros. Apagar a cópia local não criptografada ao terminar. Retenção: definir na §7 e respeitar a exclusão de conta (um backup antigo ainda contém a conta excluída: a política de retenção precisa dizer por quanto tempo; depois de qualquer restauração, as contas listadas em `private.account_erasure_log` do backup mais novo ou da origem precisam ser anonimizadas de novo, procedimento manual a definir por CR quando ocorrer, ADR-0038).

## 5. Restauração (ensaio e emergência)

**Nunca restaurar por cima do projeto de produção sem decisão explícita.** O ensaio e a emergência usam um destino novo.

1. Criar um projeto Supabase descartável (ou usar o Supabase local com Docker: `supabase start`).
2. Aplicar o esquema: `supabase db push --db-url "<destino>"` (as migrations) **ou** carregar `backup-schema.sql`.
3. Carregar os dados: `backup-auth.sql` antes de `backup-dados.sql` (FKs de `profiles` para `auth.users`); `psql "<destino>" -f ...`.
4. Reaplicar o que não é dado: templates de e-mail e configuração do Auth são do painel (não estão no dump) **[confirmar]**.
5. **Validar** (todas devem passar; registrar números na §7):
   - contagem de linhas por tabela do app igual à origem no instante do dump;
   - `select count(*) from auth.users` igual à origem; login de uma conta de teste funciona no destino;
   - regressão financeira R1: receitas, despesas e saldo consolidado de uma família de teste batem com os valores anotados na origem;
   - RLS ativa: com o JWT de uma conta, `select` em outra família devolve 0 linhas;
   - `supabase db lint --db-url "<destino>" --level warning` sem aviso;
   - `refresh_notifications()` e `materialize_recurrences` executam sem erro.
6. **Emergência**: se o destino validado vai virar produção, trocar no Render `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e as URLs do Auth (Site URL, redirects), redeployar, rodar o `checklist-entrega.md` §4 e comunicar os usuários (todos precisarão entrar de novo: as sessões não são restauradas).

## 6. Incidente com segredo vazado

1. Gerar novas chaves no painel (*Project Settings → API*; revogar `service_role`/secret antigas) e atualizar o Render.
2. Trocar `LOG_HMAC_KEY` quebra apenas a correlação histórica de `emailHmac` (aceito, ADR-0035).
3. Rever `auth.users` e `audit_events` por atividade anormal no período; checar `security_events` (troca de senha) dos usuários afetados.
4. Registrar na §7 (data, causa, ação).

## 7. Registro (preencher; sem registro, o item não está verificado)

| Data | Evento | Plano / retenção / PITR **[confirmar no painel]** | Origem → destino | Tempo | Validações (§5.5) | Quem |
|---|---|---|---|---|---|---|
| — | Plano e backups conferidos | | | — | — | |
| — | Ensaio de restauração | — | | | | |
| — | Retenção dos logs do Render e do Supabase (API/Postgres) anotada (SEC-4, SEC-26) | | — | — | — | |

Retenção do log de aplicação (Render): ______ dias **[confirmar no painel]**. Retenção dos logs de API/Postgres (Supabase): ______ dias **[confirmar no painel]**. O IP no log (ADR-0035) não pode ficar guardado por mais tempo que isso, e esse prazo é o declarado ao titular.
