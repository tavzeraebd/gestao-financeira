# ADR-0014 — Server Actions com Zod e `ActionResult` tipado; cliente Supabase do usuário

Status: aceita · Escopo: toda mutação do app

**Contexto.** Spec §3.2 separa validação, regra, autorização e persistência; §14 pede erros consistentes, sem dado sensível.

**Decisão.** Toda mutação é Server Action que passa por `runAction` (`src/server/action.ts`): Zod (schema compartilhado com o formulário RHF), `getUser()`, service → repository/RPC com o cliente do usuário, `toAppError` → `ActionResult<T>` com `code` fechado, mensagem pt-BR e `requestId`. Leituras de RSC ficam em `queries.ts`. Route Handler só para `/auth/confirm` (link de e-mail). Nenhum `family_id` vem do cliente (ADR-0008).

**Alternativas.** Route Handlers REST para tudo: duplica serialização e CSRF. `throw` para o cliente: perde tipagem e vaza mensagens.

**Consequências.** Um padrão para testar (unit do `runAction`, integração por action); redirect relançado com `unstable_rethrow`.
