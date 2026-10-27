# ADR-0009 — Testes de autorização com pgTAP no Supabase local + integração com Vitest

Status: aceita · Escopo: testes de banco e de servidor

**Contexto.** Spec §6.5: a etapa não conclui sem provar acesso permitido e negado.

**Decisão.** pgTAP em `supabase/tests/database/*.test.sql` via `pnpm db:test` (`supabase test db`). Cada arquivo em `begin; ... rollback;`, personificando usuários com `set local role authenticated` + `set local request.jwt.claims`. Helpers de teste no schema `tests`, criados por `000_setup.test.sql`, nunca em migration. Integração de Server Actions/serviços em `tests/integration` (Vitest, Supabase local; usuários criados com a secret key **só** no setup de teste). E2E Playwright lê e-mails no Mailpit.

**Alternativas.** Testar RLS só via supabase-js: mais lento e não cobre grants nem `search_path`.

**Consequências.** `pnpm db:reset && pnpm db:test` precisa passar do zero; cada policy/RPC nova traz testes de negação.
