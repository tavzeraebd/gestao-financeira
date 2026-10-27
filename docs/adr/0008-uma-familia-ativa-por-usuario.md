# ADR-0008 — Uma família ativa por usuário no MVP

Status: aceita · Escopo: family_members, Server Actions, UI

**Contexto.** A spec não pede múltiplas famílias por pessoa; suportá-las exige seletor de família, cookie de família ativa e `family_id` em toda action.

**Decisão.** Índice único parcial `family_members(user_id) where status = 'active'`. A família do usuário é derivada no servidor (`private.current_family_id()` / `requireMembership()`); actions não recebem `family_id`. Aceitar convite estando em outra família → `ALREADY_IN_FAMILY`.

**Alternativas.** N famílias com família ativa em cookie: escopo e superfície maiores sem requisito.

**Consequências.** Reversível: remover o índice e introduzir seleção explícita (o esquema já é N:N). Sair da família (Etapa 7) libera o usuário para outra.
