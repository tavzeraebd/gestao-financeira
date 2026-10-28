# Runbook — Migrations em produção (Supabase hospedado)

Versão 1.0 (2026-10-28, Etapa 9) · Dono: architect · Execução: usuário ou agente autorizado · Referências: ADR-0002, ADR-0039 §4, `contracts/etapa-9.md` §Premissas e §6.

## Regras

1. **Migration aplicada em produção nunca é editada.** Correção = migration nova.
2. O CI **não** aplica migrations (ADR-0039 §4): exige credencial de escrita em produção.
3. Sem Docker local, a validação é **lint remoto** + testes de integração/pgTAP marcados para quando houver Docker (`ci-docker.yml` ou Docker Desktop). Isso é uma verificação **mais fraca**; o relatório de entrega diz "pgTAP não executado" enquanto for verdade.
4. Tipos: depois do push, `supabase gen types typescript --linked > src/types/database.ts` e `git diff` só pode mostrar o esperado.
5. Toda migration nova traz `-- DOWN (manual)` e o efeito em dados existentes no cabeçalho.

## Procedimento

Pré-requisitos: `supabase login`, projeto ligado (`supabase link --project-ref <ref>`), senha do banco à mão (não em arquivo).

1. `git status` limpo e na `main` atualizada; `pnpm check` e `pnpm build` verdes.
2. **Backup antes** (`backup-recuperacao.md` §3–4): confirmar que existe cópia recente; para as migrations M3 e M4 da Etapa 9 (troca de assinatura de função e função de exclusão), fazer o dump lógico antes.
3. `supabase migration list --linked`: local × remoto coerentes (nada remoto ausente do repositório).
4. `supabase db push --linked --dry-run`: conferir que **só** as migrations novas aparecem.
5. `supabase db push --linked`.
6. `supabase db lint --linked --level warning`: sem aviso novo.
7. `supabase migration list --linked`: todas aplicadas.
8. `supabase gen types typescript --linked`: sem diff inesperado em `src/types/database.ts`.
9. **Ordem com o app** (Etapa 9): M1, M2 e M4 antes do deploy do app; M3 em qualquer ordem (o repositório novo aceita os dois retornos). Deploy do app depois.
10. Conferir no app em produção com uma conta de teste: `/inicio`, `/familia`, `/configuracoes`.

## Reversão

Não há rollback automático. Opções, nessa ordem: (a) migration corretiva nova; (b) restauração em projeto novo (`backup-recuperacao.md` §5) se houve dano de dado. O `-- DOWN (manual)` de cada migration descreve o desfazimento do esquema, não de dados.

## Ajuste de limites sem deploy (ADR-0033)

Os tetos vivem em `private.volume_limits`. Ajuste: no SQL Editor do painel, `update private.volume_limits set max_active = <n> where kind = '<kind>';` e registrar abaixo. Aumentar um teto é decisão de produto/segurança; registrar quem pediu e por quê.

## Registro

| Data | Migrations aplicadas | Dry-run | Lint remoto | Types sem diff | Quem |
|---|---|---|---|---|---|
| — | | | | | |
