# ADR-0022 — Compromissos: status muda só por RPC `security definer`; `due_date` mantido por trigger; `/transacoes` lista só efetivados

Status: aceita (2026-10-24, Etapa 5) · Escopo: `transactions` (status, `due_date`), RPCs `pay_pending_transaction` e `cancel_pending_transaction`, `/compromissos` · **Revisa a ADR-0018** (nas Consequências, "a Etapa 5 acrescenta o grant de `status`") e refina a ADR-0012 e a D7

**Contexto.** Pela ADR-0012, compromisso = transação `pending`, e pagar muda a mesma linha. A matriz aprovada (`permissions.md`) deixa o **responsável** (`assigned_member_id` = vínculo do chamador) marcar como paga uma conta que não criou, mas não editá-la. A RLS é por linha, e o grant por coluna vale por papel, não por linha. Por isso, "este member só pode mudar `status` e a data nesta linha" não se expressa com policy + grant. Pagar também precisa travar a linha e validar a transição de forma atômica: pagar duas vezes não pode contar duas vezes.

**Decisão.**
1. `status` continua **fora** do grant de update. Só duas RPCs `security definer` (`search_path = ''`, família = `private.current_family_id()`, linha travada com `for update`) mudam o status:
   - `pay_pending_transaction(p_transaction_id, p_paid_on, p_amount, p_account_id)`, para owner, admin, autor ou responsável;
   - `cancel_pending_transaction(p_transaction_id)`, para owner, admin ou autor (linha "cancelar" de Transações).
2. Um trigger reforça as regras mesmo contra um definer com defeito:
   - as únicas transições são `pending → paid` e `pending → canceled`;
   - linha `canceled` é imutável;
   - `pending` não existe para `transfer` (CHECK);
   - ao virar `paid`: conta ativa, data ≤ hoje e data ≥ saldo inicial.
3. `due_date` é do banco (fora dos grants). Enquanto a linha está `pending`, o trigger mantém `due_date = transaction_date`. No pagamento, o vencimento fica preservado e `transaction_date` passa a ser a data do pagamento. Lançamento criado já `paid` tem `due_date` nulo.
4. O valor e a conta podem ser ajustados no pagamento (valor real). Não há pagamento parcial (ADR-0012) nem "desfazer pagamento" (fora da spec): um erro se corrige editando ou excluindo (lógico) o lançamento efetivado.
5. A auditoria grava `transaction.paid` (no lugar de `transaction.updated` nessa transição) e `transaction.canceled`.
6. `/transacoes` passa a listar **só efetivados**. Pendentes e cancelados ficam em `/compromissos`, e o pago que veio de um compromisso aparece nos dois (aba "Pagos").

**Alternativas.** Grant de `status` + policy que inclua o responsável: o responsável ganharia edição de todas as colunas da linha. Grant de `status` + trigger que barre o resto: o trigger não distingue "pagar" de "editar" sem reconstruir a autorização, e a superfície fica igual à da RPC, só que espalhada. Tabela `bills`: rejeitada na ADR-0012.

**Consequências.** As RPCs são a primeira escrita `security definer` sobre lançamentos e precisam de pgTAP de permitido e negado para cada papel. A RPC duplica parte da RLS (família e papel), de propósito e testada. O trigger de lançamentos é redefinido por inteiro na Etapa 5, com toda a lógica da Etapa 3 preservada.
