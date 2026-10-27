# ADR-0023 — Recorrências: só receita/despesa, agenda imutável, materialização isolada por série e remoção de projeções intocadas

Status: aceita (2026-10-24, Etapa 5; emendas v1.1 no mesmo dia, pós-revisão: §5, §6, §7 e §8) · Escopo: `recurrences`, `transactions.recurrence_id/occurrence_date`, RPC `materialize_recurrences` · Refina a ADR-0011, a D12 e o `data-model.md` §5.4

**Contexto.** A ADR-0011 decidiu que as ocorrências são materializadas sob demanda como `pending`, com idempotência por `unique (recurrence_id, occurrence_date)` e catch-up automático. A spec §7.7 exige: próxima ocorrência, encerramento, alterar uma ocorrência ou a série, pausar e reativar, prevenir duplicidade e recuperar falhas, sem prometer processamento que não existe. Três problemas apareceram ao detalhar:
- a D12 dizia "pausar cancela as futuras". Uma linha `canceled` continua ocupando a chave única, então reativar não recriaria essas datas;
- uma série com conta arquivada faria a materialização inteira falhar;
- mudar a agenda de uma série gera colisões de data com ocorrências editadas.

**Decisão.**
1. **Tipos `income` e `expense` apenas**: transferência pendente não existe (ADR-0022), e a spec não pede transferência recorrente. A série nasce no formulário de compromisso ("Repetir"). O formulário de Nova transação **não** ganha o toggle do mockup (tela 3), porque registra fatos já ocorridos (`paid` ≤ hoje), e uma repetição é, por definição, um compromisso futuro.
2. **Agenda imutável**: `type`, `frequency`, `interval_count` e `start_date` ficam fora do grant de update. São editáveis: descrição, valor, conta, categoria, responsável, `end_date` e `is_active`. Para mudar a frequência ou o início, encerra-se a série e cria-se outra.
3. **Materialização**: `materialize_recurrences()` roda como `security definer`, sem parâmetros, só na família do chamador.
   - Trava as séries com `for update skip locked` e insere com `on conflict (recurrence_id, occurrence_date) do nothing`.
   - O horizonte vai até o fim do mês seguinte a hoje. Tetos: 60 ocorrências por série e 500 por chamada (o resto entra nas chamadas seguintes).
   - `created_by` = autor da série.
   - Cada série roda num bloco com `exception`. A falha de uma (conta arquivada, categoria arquivada, responsável ou autor inativo) não para as outras: fica em `last_failure_code`/`last_failure_at`, e a próxima chamada tenta de novo.
   - O backend chama a RPC ao abrir dashboard, compromissos, recorrências e orçamentos, e depois de escrever numa série. Uma falha da RPC é registrada e não derruba a página. Nenhum número realizado depende dela (pendentes não entram em saldo nem em totais).
4. **Ocorrência intocada** = `pending`, não excluída, com data ≥ hoje, `transaction_date = occurrence_date` e valor, descrição, conta, categoria e responsável iguais aos da série **antes** da mudança, sem observações. O estado é derivado, sem coluna de "editada".
   - Editar a série atualiza as intocadas no lugar.
   - Pausar, ou encurtar com `end_date`, **remove fisicamente** as intocadas afetadas. Isso revisa a D12 ("cancela"): elas são projeções que nunca tiveram efeito, e removê-las deixa reativar e estender sem colisão.
   - Ocorrências pagas, canceladas, excluídas ou editadas nunca são tocadas.
5. **Ponteiro `next_occurrence_date`** (do banco, fora dos grants) = primeira data da agenda ainda não materializada.
   - Reativar coloca no ponteiro a primeira data ≥ hoje: o período pausado não gera atrasados.
   - Mudar `end_date` coloca `least(base, primeira data ≥ hoje)`, em que `base` é o ponteiro antigo.
   - **Emenda (v1.1, migration `20261024101100`, D12):** *reativar junto com mudar `end_date`* — o ponteiro parte do valor **recalculado** pela reativação (`on_or_after(hoje)`), não do antigo; senão o `least` recuaria o ponteiro para o período pausado e geraria atrasados.
6. **Limites contra abuso**: até 100 séries ativas por família, e `start_date` ≥ saldo inicial da conta (senão a série falharia sempre). Sem `pg_cron`.
   - **Emenda (v1.1):** `start_date ≥ hoje − 12 meses` na criação (`INVALID_INPUT`; o início é imutável, então vale só no insert). `DATE_BEFORE_OPENING_BALANCE` tem precedência. Evita uma série com início remoto gerar até 60 ocorrências vencidas de uma vez (SEC-20).
7. **Backoff de falha (emenda v1.1):** `materialize_recurrences()` pula séries com `last_failure_at` há menos de 1 hora; editar a série zera a falha e libera a nova tentativa imediata. Evita reprocessar a cada render uma série que falha sempre (SEC-21). A decisão do §3 ("a próxima chamada tenta de novo") passa a ser "a próxima chamada após 1 hora, ou após editar a série".
8. **Policies de UPDATE (emenda v1.1):** o ramo "autor" de `recurrences_update` e `transactions_update` exige vínculo ativo na família; ex-integrante não edita o que criou (SEC-19).

**Alternativas.** Cancelar em vez de remover: bloqueia reativar por causa da chave única. Chave única parcial `where status <> 'canceled'`: recriaria a ocorrência que o usuário cancelou. Coluna `edited_at`: mais um estado a manter coerente, e o derivado basta. Agenda editável: exige regerar com colisões e regras de precedência. Recorrência de transferência: sem requisito na spec e com semântica de "pendente" estranha para quem usa.

**Consequências.** A primeira chamada do mês cria as ocorrências até o fim do mês seguinte. Uma ausência longa gera os atrasados como vencidos, que não são pagos sozinhos (spec §7.6). A propagação grava um `transaction.updated` por ocorrência atualizada, com o editor como ator. As projeções futuras de planejamento (Etapa 6) usam a mesma agenda `private.recurrence_occurrence`, sem persistir.
