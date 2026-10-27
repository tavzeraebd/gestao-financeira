# ADR-0030 — Gestão de integrantes por RPCs auditadas; quem sai não leva nem apaga nada; atividade = auditoria para owner/admin

Status: aceita (2026-10-24, Etapa 7) · Escopo: `change_member_role`, `transfer_ownership`, `remove_family_member`, `leave_family`, renomear família, `/familia`, `/familia/atividade` · Refina `data-model.md` §4.8 (substitui `update_family` por trigger de auditoria) e aplica `permissions.md` §2 e §4

**Contexto.** A spec §7.13 pede alterar papel, remover conforme regras, atividade e o destino de transações, metas e registros de quem sai. A matriz aprovada define quem faz o quê. `family_members` não tem grant de escrita (impede auto-promoção). A ADR-0020 §5 levou a atividade recente do dashboard para esta etapa.

**Decisão.**
1. Quatro RPCs `security definer` (família e papel do chamador lidos do banco; alvo buscado por `id` **e** família do chamador **e** `status='active'`, senão `NOT_FOUND`; linhas travadas com `for update`; tudo auditado):
   - `change_member_role(p_member_id, p_role)`: só owner; alvo ≠ chamador (`CANNOT_TARGET_SELF`); alvo não pode ser o owner; `p_role in ('admin','member')`. Papel igual = sem efeito, sem evento.
   - `transfer_ownership(p_member_id)`: só owner; alvo ativo ≠ chamador; troca atômica (chamador → admin, depois alvo → owner).
   - `remove_family_member(p_member_id)`: owner remove admin e member; admin remove member; ninguém remove o owner nem a si (`CANNOT_TARGET_SELF`).
   - `leave_family()`: admin e member; owner → `OWNER_MUST_TRANSFER`.
2. Saída ou remoção: `status = 'removed' | 'left'` e `ended_at = now()`. **Nada é apagado nem reatribuído**: lançamentos, compromissos, séries, metas, aportes, parcelas e liquidações ficam na família com autoria e responsável preservados (FKs `restrict`). Na tela, o nome de quem saiu aparece como "Ex-integrante" (o perfil deixa de ser legível, `shares_family_with`).
3. Efeitos colaterais na mesma transação: os convites **pendentes criados pelo alvo** são revogados (`invite.revoked` com `"reason": "member_ended"`), para que quem saiu não volte por um link que ele mesmo gerou. Notificações do ex-integrante ficam invisíveis (RLS exige vínculo ativo). Na próxima requisição, `requireMembership` leva a `/onboarding`.
4. Séries do ex-integrante: nada muda. A materialização marca a série com `RECURRENCE_AUTHOR_INACTIVE` (Etapa 5), e a tela orienta encerrar e criar outra. Compromissos com o ex-integrante como responsável continuam pagáveis por owner, admin e autor.
5. Renomear a família continua como `update (name)` direto (owner, RLS da Etapa 2), e um trigger `after update` (`security definer`) grava `family.updated { "fields": ["name"] }`. Não existe `update_family`.
6. Tela de atividade `/familia/atividade` lê `audit_events` (RLS: owner/admin), paginada, com descrição montada por um catálogo fechado de ações. Member → página não encontrada.

**Alternativas.** Apagar ou transferir os registros de quem sai: perde histórico financeiro, contra a regra "nenhuma cascata em histórico". Deixar os convites do removido válidos: porta de volta para um admin removido. RPC `update_family`: duplica a policy já testada só para auditar.

**Consequências.** A família tem sempre exatamente um owner ativo (índice único da Etapa 2 + RPCs). O owner sozinho não pode sair (exclusão de família segue não suportada). Uma série de ex-integrante precisa ser recriada por quem fica.
