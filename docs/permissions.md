# Permissões — Núcleo

Versão 1.0 (Etapa 0). Fonte de verdade da autorização: **banco** (RLS + RPCs). O app repete as regras
só para exibir/ocultar ações (`src/modules/family/permissions.ts`) — esconder botão nunca é controle.

## 1. Papéis

| Papel | Quem | Resumo |
|---|---|---|
| `owner` | quem criou a família (exatamente 1 ativo por família, índice único) | administra família, papéis e tudo o que admin faz |
| `admin` | promovido pelo owner ou convidado como admin pelo owner | gerencia cadastros e operações; convida/remove `member` |
| `member` | convidado | consulta tudo da família; registra e gerencia **os próprios** lançamentos |
| sem vínculo ativo | autenticado sem família, ou com vínculo `removed`/`left` | nada da família (nem leitura) |
| `anon` | não autenticado | nenhuma tabela nem RPC de `public` |

"Próprio" = `created_by = auth.uid()`. Vínculo `removed`/`left` perde acesso imediatamente (helpers exigem `status='active'`).

## 2. Matriz papel × operação

Legenda: ✔ permitido · P = só os próprios registros · — negado. Etapa = quando é implementado.
Etapas 2 e 3 estão **aprovadas**. As linhas das Etapas 4–7 foram **aprovadas como estão** em 2026-10-24 (o usuário pediu
execução autônoma; spec §6.2). A Etapa 5 implementa "marcar como paga" por RPC, porque a RLS não restringe colunas por
linha para o responsável ([ADR-0022](adr/0022-compromissos-pagamento-por-rpc.md)). Isso não muda a matriz.
Detalhes das Etapas 6–7 sem mudar a matriz (contratos `etapa-6.md` e `etapa-7.md`): o member registra aporte só no **próprio** nome
(owner/admin, para qualquer integrante ativo); a divisão é por RPC e nenhuma escrita direta em `expense_splits` existe
([ADR-0026](adr/0026-divisao-de-despesas-por-rpc.md)); quem sai ou é removido tem os convites pendentes que criou revogados, e nada do
que registrou é apagado ([ADR-0030](adr/0030-gestao-de-integrantes-e-atividade.md)); renomear a família segue como update direto, agora auditado.

| Módulo | Operação | owner | admin | member | Etapa | Mecanismo no banco |
|---|---|:-:|:-:|:-:|:-:|---|
| Perfil | ver o próprio / editar nome e avatar | ✔ | ✔ | ✔ | 2 | RLS `id = auth.uid()` + grant de coluna |
| Perfil | ver perfil de quem compartilha família | ✔ | ✔ | ✔ | 2 | `shares_family_with` |
| Perfil | Excluir a própria conta (anonimiza; apaga a família só se for o único integrante) | ✔ sem outros integrantes ativos | ✔ | ✔ | 9 | RPC `delete_my_account` (definer; reautenticação com senha provada no banco, `amr` até 5 min; ADR-0038) |
| Família | criar família (sem vínculo ativo) | n/a | n/a | n/a | 2 | RPC `create_family` (qualquer autenticado sem família) |
| Família | ver família e integrantes | ✔ | ✔ | ✔ | 2 | `is_family_member` |
| Família | renomear | ✔ | — | — | 2 | RLS update + grant `(name)` |
| Família | excluir família | — | — | — | — | não suportado |
| Convites | ver convites da família | ✔ | ✔ | — | 2 | select por coluna (sem `token_hash`) |
| Convites | criar convite `member` | ✔ | ✔ | — | 2 | RPC `create_family_invite` |
| Convites | criar convite `admin` | ✔ | — | — | 2 | RPC |
| Convites | revogar convite | ✔ (todos) | convites `member` | — | 2 | RPC `revoke_family_invite` |
| Convites | aceitar convite (destinatário sem família) | n/a | n/a | n/a | 2 | RPC `accept_family_invite` |
| Integrantes | alterar papel admin↔member | ✔ (exceto o próprio) | — | — | 7 | RPC `change_member_role` |
| Integrantes | transferir propriedade | ✔ | — | — | 7 | RPC `transfer_ownership` |
| Integrantes | remover integrante | ✔ (admin, member) | member | — | 7 | RPC `remove_family_member` |
| Integrantes | sair da família | — (transferir antes) | ✔ | ✔ | 7 | RPC `leave_family` |
| Integrantes | alterar o próprio papel / inserir vínculo direto | — | — | — | 2 | sem grant/policy de escrita em `family_members` |
| Auditoria | ver eventos | ✔ | ✔ | — | 2 | RLS select |
| Auditoria | criar/alterar/apagar evento | — | — | — | 2 | só `private.log_audit` |
| Contas | ver contas e saldos | ✔ | ✔ | ✔ | 3 | RLS |
| Contas | criar, editar, arquivar, alterar saldo inicial | ✔ | ✔ | — | 3 | RLS `has_family_role(owner,admin)` |
| Categorias | ver | ✔ | ✔ | ✔ | 3 | RLS |
| Categorias | criar, editar, arquivar, excluir sem histórico | ✔ | ✔ | — | 3 | RLS |
| Transações | ver e pesquisar | ✔ | ✔ | ✔ | 3 | RLS |
| Transações | criar receita/despesa/transferência | ✔ | ✔ | ✔ | 3 | RLS insert `is_family_member` + `created_by = auth.uid()` |
| Transações | editar, excluir (lógico), estornar, cancelar | ✔ | ✔ | P | 3 | RLS update `has_family_role(owner,admin) or created_by = auth.uid()`; delete físico negado |
| Contas a pagar | criar compromisso (pendente); editar e cancelar | ✔ | ✔ | ✔ criar; P editar/cancelar | 5 | RLS insert/update de Transações; cancelar por RPC `cancel_pending_transaction` |
| Contas a pagar | marcar pendente como paga | ✔ | ✔ | P ou responsável (`assigned_member_id` = seu vínculo) | 5 | RPC `pay_pending_transaction` (definer; ADR-0022) |
| Recorrências | criar | ✔ | ✔ | ✔ | 5 | RLS |
| Recorrências | editar série, pausar, reativar, encerrar | ✔ | ✔ | P | 5 | RLS |
| Recorrências | materializar ocorrências (disparado ao acessar) | ✔ | ✔ | ✔ | 5 | RPC `materialize_recurrences` (definer, idempotente, só família do chamador) |
| Orçamentos | ver | ✔ | ✔ | ✔ | 5 | RLS |
| Orçamentos | criar, editar, arquivar | ✔ | ✔ | — | 5 | RLS |
| Metas | ver | ✔ | ✔ | ✔ | 6 | RLS |
| Metas | criar, editar, pausar, concluir, cancelar | ✔ | ✔ | — | 6 | RLS |
| Metas | registrar aporte/retirada | ✔ | ✔ | ✔ | 6 | RLS |
| Metas | excluir aporte (lógico) | ✔ | ✔ | P | 6 | RLS |
| Divisão | definir divisão de uma despesa | ✔ | ✔ | P (despesa própria) | 6 | RPC `set_transaction_splits` |
| Divisão | registrar liquidação | ✔ | ✔ | se é `from` ou `to` | 6 | RLS |
| Divisão | excluir acerto (lógico) | ✔ | ✔ | P (autor) ou se é `from` ou `to` | 6 | RLS `settlements_update` (SEC-25, migration 20261024101700) |
| Planejamento | simular cenários | ✔ | ✔ | ✔ | 6 | sem persistência |
| Relatórios / Dashboard | ver | ✔ | ✔ | ✔ | 4/7 | funções `security invoker` (RLS) |
| Notificações | ver e marcar como lida | próprias | próprias | próprias | 7 | RLS `user_id = auth.uid()` |

## 3. Estratégia RLS

1. `alter table ... enable row level security;` em **toda** tabela de `public` (verificado por pgTAP:
   nenhuma tabela de `public` com `relrowsecurity = false`).
2. Policies explícitas por comando (`for select|insert|update|delete`), sempre `to authenticated`. Comando
   sem policy = negado. Nada de `for all`.
3. Helpers em `private` (não exposto pela API), `stable security definer set search_path = ''`, nomes
   qualificados, `(select auth.uid())`: `is_family_member(uuid)`, `has_family_role(uuid, text[])`,
   `shares_family_with(uuid)`, `current_family_id()` (`data-model.md` §4.7).
4. `insert`/`update` sempre com `with check` que repete a condição de pertença e fixa autoria
   (`created_by = (select auth.uid())`). FKs compostas `(family_id, x_id)` garantem que referências
   apontam para a mesma família — mesmo que a policy esqueça um caso.
5. Grants revisados por tabela: `revoke all ... from anon, authenticated;` e `grant` mínimo a
   `authenticated` (por coluna quando o update é parcial ou há coluna secreta). `anon` não recebe nada em
   `public`. Funções: `revoke execute ... from public, anon;` (Postgres concede EXECUTE a PUBLIC por padrão).
6. Views: só `with (security_invoker = true)`. Funções de leitura/relatório: `security invoker`.
   `security definer` só para escrita controlada (RPCs) e helpers; cada uma revisada e testada.
7. `service_role`/secret key ignora RLS: proibida no fluxo do usuário (`architecture.md` §6).
8. pgTAP prova permitido **e** negado para cada policy/RPC (`acceptance-criteria.md` §E2-DB).

## 4. Impedir auto-promoção de papel

- `family_members` não tem grant nem policy de `insert`/`update`/`delete` para `authenticated`: um
  `update family_members set role='owner'` falha com `permission denied` (42501).
- Papel só muda por RPC `security definer` que (a) lê o papel do **chamador** no banco, nunca de parâmetro;
  (b) rejeita alvo = próprio usuário; (c) nunca atribui `owner` (só `transfer_ownership`, troca atômica);
  (d) audita.
- Índice único "um owner ativo por família" e `check` de `role`/`status` tornam estados inválidos
  impossíveis mesmo se uma RPC tiver bug.
- Convite carrega `role` restrito a `admin|member` por `check`; admin só cria convite `member`.
- Server Action não recebe `role` do chamador nem `family_id`: deriva do banco.

## 5. Fluxo de convite

```
owner/admin  ──createInvite(role, email?)──> RPC create_family_invite
                                             token = 32 bytes aleatórios (hex, 256 bits) ; grava sha256(token)
             <── inviteUrl = APP_URL/convite/<token>  (mostrado UMA vez, com "Copiar link")
convidado    ──abre link──> /convite/<token>  (Referrer-Policy: no-referrer)
             sem sessão → Entrar / Criar conta com next=/convite/<token>
             com sessão → get_invite_preview(token) → nome da família, papel, validade
             ──acceptInvite(token)──> RPC accept_family_invite (lock da linha; valida revogado/usado/expirado/e-mail/sem família)
             <── redirect /inicio
```

| Propriedade | Como |
|---|---|
| Imprevisível | `extensions.gen_random_bytes(32)` (CSPRNG do Postgres), 256 bits; força bruta inviável |
| Não recuperável do banco | só `token_hash` (SHA-256) é armazenado; coluna fora do grant de select |
| Expiração | 7 dias fixos (`expires_at`), checada no aceite e na prévia |
| Uso único | `accepted_at` sob `select ... for update`; segunda tentativa → `INVITE_ALREADY_USED` |
| Revogável | `revoke_family_invite`; convite revogado nunca aceita |
| Vinculado a e-mail (opcional) | se `invited_email` preenchido, aceite exige e-mail do JWT igual |
| Limite | máx. 20 convites pendentes por família |
| Sem envio de e-mail no MVP | o link é copiado e compartilhado por quem convida (SMTP de produção é bloqueador de etapa final) |
| Vazamento por URL | `no-referrer`, logger não registra caminho `/convite/*`, página não carrega recurso de terceiros |
