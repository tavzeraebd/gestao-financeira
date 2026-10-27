# ADR-0015 — Renderização dinâmica, sem Cache Components nem cache compartilhado de dados de família

Status: aceita (2026-10-23, emenda E1–2 v1.1) · Escopo: `next.config.ts`, todas as rotas e leituras de dados

**Contexto.** O Next 16 oferece `cacheComponents` (`"use cache"`) e `partialPrefetching`. A spec §14 só admite cache com invalidação explícita e **nunca** compartilhado entre famílias. Toda tela do app depende do cookie de sessão e da família do usuário; um erro de chave de cache vira vazamento entre famílias (A1, a falha mais grave do threat model).

**Decisão.** `cacheComponents` e `partialPrefetching` ficam desligados (padrão `false` no Next 16.4; não habilitar em `next.config.ts`). Rotas de `(app)`, `onboarding` e `convite` são dinâmicas (leem cookies). Proibido para dados de família: `"use cache"`, `unstable_cache`, cache de `fetch`, `revalidateTag`. Permitido: `React.cache` (deduplicação dentro de uma requisição, como em `src/server/auth.ts`). Depois de uma mutação, a action usa `revalidatePath` (ou `refresh()` de `next/cache`) só para atualizar o roteador do cliente.

**Alternativas.** Cache Components com `"use cache: private"`: o ganho é pequeno com volume familiar, e o risco de chave errada é alto e difícil de testar. ISR/estático: não se aplica a telas autenticadas.

**Consequências.** Cada navegação consulta o Supabase. O desempenho vem de índices e de agregação no banco (ADR-0004). Habilitar cache exige ADR nova com teste de isolamento entre famílias.
