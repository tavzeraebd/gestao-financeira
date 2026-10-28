# ADR-0036 — Trilha de tentativas negadas nas RPCs de integrantes: negar sem desfazer a transação

Status: aceita (2026-10-28, Etapa 9) · Escopo: `change_member_role`, `transfer_ownership`, `remove_family_member` (recriadas por migration nova), `src/modules/family/repository.ts`, catálogo de auditoria (`member.action_denied`), `describeAuditEvent` · Fecha SEC-26 · Complementa ADR-0030 e ADR-0006

**Contexto.** As RPCs de integrantes negam com `raise exception` (`FORBIDDEN`, `CANNOT_TARGET_SELF`, `NOT_FOUND`), o que desfaz a transação: nenhuma linha em `audit_events` para a tentativa negada. Quem chama a RPC direto com a publishable key não passa pelas Server Actions e só deixa rastro no log da plataforma. Tentativas de auto-promoção ou de remover o owner (AB-110/111) ficam sem trilha investigável no produto (SEC-26, média).

**Decisão.**
1. As três RPCs passam a **devolver `text`**: `null` quando a operação aconteceu; o código (`'FORBIDDEN'`, `'CANNOT_TARGET_SELF'`, `'NOT_FOUND'`) quando foi **negada**. `INVALID_INPUT`, `NOT_AUTHENTICATED` e erros inesperados continuam em `raise`. `leave_family`, `refresh_notifications` e as demais RPCs **não mudam**.
2. A lógica atual vira um bloco interno com `begin ... exception when sqlstate '42501' or sqlstate 'P0001'`; o tratador reconhece os três códigos acima (pelo texto da exceção), grava **`member.action_denied`** em `audit_events` e **retorna o código** em vez de relançar. A subtransação desfeita libera os `for update`. Qualquer outra exceção é relançada.
3. **Evento**: `entity_type 'family_member'`, `entity_id` = alvo quando o uuid pertence à família do chamador (senão nulo, para não confirmar existência), `metadata { "operation": "change_role" | "transfer_ownership" | "remove", "reason": "<código>" }`. Sem nome, e-mail, papel de terceiro ou texto livre. Chamador **sem família** ativa: retorna `'FORBIDDEN'` sem gravar (`audit_events.family_id` é obrigatório); o rastro fica no log da plataforma.
4. **Anti-poluição**: no máximo **20 eventos de negação por ator por hora**; acima disso a RPC ainda nega, mas não grava.
5. **Aplicação**: `family/repository.ts` converte o `text` recebido em `AppError(code)`, então as Server Actions e as mensagens não mudam (CA-E7-36). O repositório tolera `null` de uma RPC antiga (sem retorno) para que a ordem de deploy app/banco não importe.
6. **Leitura**: owner e admin leem (política existente); aparece em `/familia/atividade` no grupo "familia" (prefixo `member.`) como "Ação negada" · "Tentativa de alterar papel" (ou "transferir propriedade", "remover integrante"). O `describeAuditEvent` cobre a ação nova (o teste percorre o catálogo, CA-E7-37).
7. **Retenção dos logs de Postgres/API do Supabase hospedado** é verificada no runbook (parte restante do achado, de caráter documental).

**Alternativas.**
- Registrar a negação só na Server Action em chamada separada: não cobre a API direta, que é o caso relevante.
- `dblink`/transação autônoma: extensão extra e privilégios que o hospedado não garante.
- Nova função `*_checked` mantendo as antigas: duas superfícies de escrita para o mesmo efeito e risco de a antiga ficar exposta.
- Aceitar o risco: SEC-26 sobe para alta se o projeto exigir trilha; a decisão aqui é que a trilha é barata e fecha a lacuna.

**Consequências.** Mudança de **tipo de retorno** exige `drop function` + `create function` em migration nova (migrations aplicadas nunca são editadas) e nova concessão de `execute` só a `authenticated`; o contrato com o cliente da API muda de "exceção" para "texto" (consumidores externos não existem). Os pgTAP 510/520/560 da Etapa 7 e `rpc-exposure.test.ts` passam a afirmar o valor devolvido em vez de `throws_ok` para as três negações; a cobertura de concorrência (CA-E7-05) é preservada.
