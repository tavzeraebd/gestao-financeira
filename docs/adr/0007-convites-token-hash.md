# ADR-0007 — Convite por link com token aleatório, hash SHA-256, expiração e uso único

Status: aceita · Escopo: family_invites (Etapa 2)

**Contexto.** Spec §5.1: token imprevisível, expiração e uso controlado. Não há SMTP de produção.

**Decisão.** A RPC gera 32 bytes (`extensions.gen_random_bytes`) em hex, grava só o `sha256` e devolve o token uma única vez; o link `APP_URL/convite/<token>` é copiado por quem convida. Validade de 7 dias, aceite com `for update`, revogação, vínculo opcional a e-mail, limite de 20 pendentes por família.

**Alternativas.** `auth.admin.inviteUserByEmail`: exige service role e SMTP. Token em claro no banco: um vazamento do banco vira acesso. Token no fragmento `#`: perde-se no redirect de login.

**Consequências.** Sem e-mail de convite no MVP; mitigações de vazamento por URL (no-referrer, sem log de caminho).

**Atualização (2026-10-23, contrato E1–2 v1.1).** O `next` do cadastro sobrevive à confirmação: `safeNextPath(next, "")` → `user_metadata.next_path` → template `{{ if .Data.next_path }}&next=…{{ end }}` → `/auth/confirm` revalida. Como `user_metadata` é controlado pelo usuário (F4), o template deve codificar o valor com `urlquery`.
