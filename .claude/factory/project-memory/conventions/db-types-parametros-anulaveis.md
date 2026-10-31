# `pnpm db:types` e os parâmetros anuláveis de `create_installment_purchase`

## Armadilha

`supabase gen types` marca como **não-nulos** três parâmetros de `public.create_installment_purchase` que a função aceita nulos:
`p_assigned_member_id`, `p_idempotency_key` e `p_notes`. O agente de banco os corrigiu à mão em `src/types/database.ts`
para `string | null` (`Args` da função).

## O que fazer ao regerar os tipos

Depois de `pnpm db:types`, reabra `src/types/database.ts`, localize `create_installment_purchase` e restaure `| null`
nos três parâmetros. Sem isso, o `typecheck` quebra em quem passa `null` (compra parcelada sem responsável, chave ou notas).
Confira com `git diff src/types/database.ts`: nenhuma outra linha desse bloco deve mudar.
