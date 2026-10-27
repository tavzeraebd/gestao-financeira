# ADR-0017 — Envio de formulários: POST após hidratação, sem log de argumentos e com sessão expirada tratada no cliente

Status: aceita (2026-10-23, emenda E1–2 v1.1; corrige SEC-1 e SEC-11) · Escopo: todo `<form>` do app, `src/proxy.ts`, `src/server/action.ts`, `next.config.ts` · Complementa ADR-0014

**Contexto.** Os formulários eram `<form onSubmit noValidate>` sem `method`. Um envio antes da hidratação virava GET nativo e punha e-mail e senha na URL (SEC-1). O `next dev` do Next 16 imprime os argumentos das Server Actions, senha inclusive (`logging.serverFunctions`, padrão `true`; SEC-11). Um redirect do proxy em resposta a uma Server Action quebra o cliente ("unexpected response").

**Decisão.**
1. Todo `<form>` tem `method="post"` e `noValidate`. O botão de envio fica desabilitado até a hidratação (`useHydrated()` em `src/hooks/use-hydrated.ts`). O envio continua por `handleSubmit` do RHF → Server Action em `startTransition` (ADR-0014).
2. `next.config.ts`: `logging: { serverFunctions: false }`.
3. `src/proxy.ts` não redireciona requisições com o header `Next-Action` nem métodos diferentes de GET/HEAD. Sem sessão, `runAction` devolve `UNAUTHENTICATED`, e o formulário navega para `/login?motivo=sessao_expirada&next=<rota atual>`. O `next` é validado por `safeNextPath`.

**Alternativas.** Aprimoramento progressivo (`<form action={serverAction}>` + `useActionState`): funciona sem JS, mas exige reescrever todos os formulários para `FormData`, duplicar o parsing de valores e abandonar o padrão RHF + Zod compartilhado. Redirecionar a action no proxy: quebra o cliente.

**Consequências.** Sem JavaScript, o formulário não envia (o botão fica desabilitado), e isso é aceito. Formulários das Etapas 3+ seguem o mesmo padrão. Um E2E com JS desligado confirma que nenhuma credencial vai para a URL.
