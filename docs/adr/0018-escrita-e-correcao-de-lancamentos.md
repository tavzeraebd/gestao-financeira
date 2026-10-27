# ADR-0018 — Escrita e correção de lançamentos: RLS + triggers de invariantes, transferência em uma linha, estorno por trigger

Status: aceita (2026-10-23, Etapa 3) · Escopo: `accounts`, `categories`, `transactions` · Refina `data-model.md` §2 e §5.1–5.3 (remove as RPCs `create_transfer` e `reverse_transaction`)

**Contexto.** A spec §7.3/§7.4 exige transferências atômicas, edição e cancelamento seguros e histórico. Pela premissa F4, toda regra precisa valer também na chamada direta à API REST. O `data-model.md` previa as RPCs `create_transfer` e `reverse_transaction`, e a `permissions.md` previa RLS direta para os lançamentos.

**Decisão.**
1. Contas, categorias e lançamentos são escritos direto pelo PostgREST com o JWT do usuário, protegidos por policy por comando, grant por coluna e triggers de invariantes no banco. A auditoria é gravada por trigger `after` `security definer`, que chama `private.log_audit`. Nenhuma RPC de escrita na Etapa 3.
2. **Transferência = uma linha** (`type='transfer'`, `account_id` → `destination_account_id`). É atômica por construção: não existe meia transferência.
3. **Estorno = nova linha** com `reversal_of_id`. Um trigger trava o original (`for update`), exige o mesmo `type`, a mesma conta e a mesma categoria, o original `paid` e não excluído, o original diferente de transferência e de estorno, a data do estorno ≥ a data do original e Σ estornos ≤ `amount`. Só owner, admin ou o autor do original podem estornar.
4. Formas de corrigir um lançamento efetivado: **editar** (auditado, com old/new), **excluir** de forma lógica (remove todo o efeito) ou **estornar** (registra um fato real, parcial permitido; D5). `type` é imutável. Um original com estorno ativo e o próprio estorno têm os campos financeiros travados, e excluir um original com estorno ativo é bloqueado. `status='canceled'` fica reservado para pendentes (Etapa 5).
5. Saldos e totais saem de funções SQL `security invoker` que devolvem `text` (ADR-0003/0004). "Hoje" é `private.today()` = data civil em `America/Sao_Paulo`.

**Alternativas.** RPC `security definer` para toda escrita: duplica a RLS e aumenta a superfície privilegiada (cada RPC teria de reconferir família e papel). RPCs só para transferência e estorno: nenhum ganho, porque a linha única e o lock do trigger já garantem a atomicidade. Transferência em duas linhas ligadas: duas escritas para manter em sincronia e risco de meia transferência.

**Consequências.** As invariantes valem pela API direta, e o pgTAP prova cada uma. O app repete as regras no Zod só para UX. A Etapa 5 acrescenta o grant de `status` e as regras de pagar e cancelar pendentes. Concorrência de edição: a última gravação vence, e as duas ficam auditadas (risco aceito no MVP).
