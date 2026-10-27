# ADR-0001 — Monólito modular Next.js App Router

Status: aceita (2026-10-23) · Escopo: todo o projeto

**Contexto.** Spec §3.5 pede monólito modular e proíbe microserviços sem justificativa; um time de agentes precisa de fronteiras claras.

**Decisão.** Um app Next.js (App Router) com módulos por domínio em `src/modules/<m>/` (`schemas`, `actions`, `queries`, `service`, `repository`, `domain/`, `components/`); infraestrutura transversal em `src/server/` e `src/lib/`. Services/repositories ficam dentro do módulo (não em `src/server/services|repositories`, como sugere a spec §4).

**Alternativas.** Camadas globais (`server/services`, `server/repositories`): espalham um caso de uso por 3 pastas. Backend separado (API própria): dois deploys sem ganho.

**Consequências.** Um deploy; Server Actions como API interna; um módulo não importa `repository` de outro (usa `queries`/`service` exportados).
