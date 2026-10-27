# ADR-0016 — Sessão só no servidor: cookies `sb-*` httpOnly e nenhum cliente Supabase no navegador

Status: aceita (2026-10-23, emenda E1–2 v1.1; corrige SEC-3) · Escopo: `src/lib/supabase/**`, `src/proxy.ts`, todo código cliente · Complementa ADR-0006 e ADR-0014

**Contexto.** O `@supabase/ssr` grava os cookies de sessão (access e refresh token, validade de 400 dias) com `httpOnly: false` e sem `Secure`. O AB-06 do threat model afirmava o contrário. O cliente de navegador (`src/lib/supabase/client.ts`) não tinha nenhum uso.

**Decisão.** Os dois `setAll` (`src/lib/supabase/server.ts` e `src/lib/supabase/proxy.ts`) forçam `httpOnly: true`, `sameSite: "lax"` e `secure: NODE_ENV === "production"` sobre as opções da biblioteca. `src/lib/supabase/client.ts` foi removido: o navegador não fala com o Supabase (Auth, PostgREST, Realtime, Storage). Toda leitura passa por RSC/`queries.ts` e toda escrita por Server Action, sempre com o JWT do usuário no servidor.

**Alternativas.** Manter o cliente de navegador (Realtime, chamadas diretas): o token teria de ficar legível por JavaScript, e um XSS roubaria o refresh token.

**Consequências.** Realtime, upload direto ao Storage ou qualquer chamada do navegador ao Supabase exigem ADR nova (por exemplo, URL assinada emitida pelo servidor). A publishable key continua pública: a premissa F4 (chamada direta à API com o próprio JWT) segue valendo, e a autorização continua no banco. Os testes verificam os atributos do cookie.
