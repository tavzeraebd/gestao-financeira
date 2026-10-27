# ADR-0006 — Autorização no banco: RLS + helpers definer em `private` + escrita sensível por RPC

Status: aceita · Escopo: todas as tabelas de `public`

**Contexto.** A publishable key é pública: qualquer pessoa chama a API REST com o próprio JWT (threat model F4). Spec §6 exige RLS em tudo e proteção de papel no banco.

**Decisão.** RLS em toda tabela, com policies por comando `to authenticated`. Helpers `private.is_family_member`, `has_family_role`, `shares_family_with`, `current_family_id` (`stable security definer set search_path = ''`). `anon` sem grants em `public`. Família, vínculos, convites e auditoria só mudam por RPC `security definer`, que lê o papel do chamador no banco. O app usa sempre o cliente com o JWT do usuário; service role fora do fluxo do usuário.

**Alternativas.** Autorização só no Next com service role: um bug no app expõe tudo. Policies com subquery direta em `family_members`: recursão de RLS e custo.

**Consequências.** Toda tabela nova vem com policies e pgTAP de permitido/negado; FKs compostas reforçam o isolamento; o app repete as regras só para UX.
