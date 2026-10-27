# ADR-0002 — Supabase local-first com CLI e migrations versionadas

Status: aceita · Escopo: banco, auth, testes

**Contexto.** Não há projeto em nuvem nem credenciais; spec §5 exige migrations reproduzíveis e nada manual no painel.

**Decisão.** Desenvolvimento e testes contra `supabase start` (Docker). CLI fixada como devDependency `supabase`. Toda mudança de banco é migration em `supabase/migrations/`; `pnpm db:reset` recria do zero. E-mails locais no Mailpit (porta 54324). Nuvem/deploy só nas etapas finais.

**Alternativas.** Projeto em nuvem desde já: bloqueado por credenciais. Postgres puro + auth próprio: reimplementa o que o Supabase oferece.

**Consequências.** Docker é pré-requisito; tipos gerados com `supabase gen types typescript --local`; produção exigirá SMTP, URLs de redirect e chaves reais (bloqueadores da Etapa 9).
