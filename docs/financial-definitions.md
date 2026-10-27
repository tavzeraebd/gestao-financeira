# Definições financeiras — Núcleo

Versão 1.2 (2026-10-24): D9 e D10 revisadas, D13 e D15 ampliadas, D21–D22 e R15–R20 novas (contratos `etapa-6.md` e
`etapa-7.md`; ADRs 0025–0028). Versão 1.1 (2026-10-24): D3 (variação), D7 (pagamento), D12 (edição de série) e D14 (orçamento mensal) revisadas;
D16–D20 e R9–R14 novas (contratos `etapa-4.md` e `etapa-5.md`; ADRs 0020–0024). Versão 1.0 (Etapa 0). Obrigatório antes de dashboards/relatórios (spec §8). Cada definição tem id
(`Dn`) citado em código e testes (`describe("D3 ...")`). Toda fórmula é implementada **uma vez**
(função SQL `security invoker` para agregação, ou função de domínio TS pura) e reutilizada por
dashboard e relatórios (spec §7.11).

## 0. Termos

- **Lançamento efetivado**: `transactions` com `status = 'paid'` e `deleted_at is null`.
- **Lançamento previsto**: `status = 'pending'` e `deleted_at is null`.
- **Ignorado**: `status = 'canceled'` ou `deleted_at is not null` — não entra em nenhum cálculo; permanece no histórico.
- **Conta de ativo**: `accounts.type <> 'credit_card'`. **Conta de passivo**: `credit_card`.
- **Fuso**: `America/Sao_Paulo`. "Hoje" = data civil nesse fuso, calculada no servidor (`src/lib/dates`), nunca no fuso do servidor de hospedagem.
- **Período**: intervalo fechado de datas civis `[início, fim]`.

## 1. Representação monetária ([ADR-0003](adr/0003-dinheiro-centavos-numeric.md))

| Camada | Representação |
|---|---|
| Banco | `numeric(14,2)`; arredondamento SQL com `round(x, 2)` (meio para longe do zero) |
| Transporte banco↔app | **string** decimal. Leitura: selecionar `amount::text` (PostgREST aceita cast em `select`) ou RPC que devolve `text`. Escrita: enviar string `"1234.56"`. Nunca passar por `number` de ponto flutuante |
| Domínio TS | `type Cents = number & { readonly __brand: "Cents" }` — inteiro seguro (`Number.isSafeInteger`), limite `|v| <= 99_999_999_999_999` (= 999.999.999.999,99) |
| Exibição | `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })` sobre `cents / 100` (só para formatar) |

Funções de `src/lib/money/` (Etapa 3; testes unitários obrigatórios):

| Função | Contrato |
|---|---|
| `parseBRL(input: string): Result<Cents, "EMPTY"\|"INVALID_FORMAT"\|"TOO_MANY_DECIMALS"\|"NEGATIVE"\|"OUT_OF_RANGE">` | ver regras abaixo |
| `formatBRL(c: Cents): string` | `123456` → `"R$ 1.234,56"` (espaço do Intl é U+00A0; testes comparam com o resultado do Intl) |
| `fromDbNumeric(s: string): Cents` | `"1234.56"`→`123456`, `"-0.50"`→`-50`, `"10"`→`1000`; parse por string (split no `.`), lança em formato inválido |
| `toDbNumeric(c: Cents): string` | `123456`→`"1234.56"`, `-5`→`"-0.05"` |
| `addCents`, `subCents`, `sumCents(list)` | aritmética inteira com verificação de faixa |
| `allocate(total: Cents, weights: number[] \| "equal"): Cents[]` | maior resto (D13); soma = total exato |
| `percentOf(part: Cents, whole: Cents): number \| null` | só exibição; `whole = 0` → `null` |

Regras de `parseBRL` (entrada sempre positiva; o sinal vem do tipo do lançamento):
1. Remove espaços (inclusive U+00A0) e prefixo `R$`. Vazio → `EMPTY`. Sinal `-` → `NEGATIVE`.
2. Aceita **apenas**: `^\d{1,3}(\.\d{3})+(,\d{1,2})?$` (com milhar) ou `^\d+(,\d{1,2})?$` (sem milhar).
3. Vírgula é o único separador decimal; ponto é só milhar e exige grupos de exatamente 3 dígitos.
4. Mais de 2 casas → `TOO_MANY_DECIMALS` (sem arredondar em silêncio). Acima do limite → `OUT_OF_RANGE`.
5. Zero é aceito pelo parser; a validação do lançamento exige `> 0`.

| Entrada | Resultado |
|---|---|
| `1.234,56` / `R$ 1.234,56` / `1234,56` | 123456 |
| `1.234` | 123400 (ponto = milhar) |
| `12,5` | 1250 |
| `0,01` | 1 |
| `1.234.567,89` | 123456789 |
| `1,234.56` · `1.234.56` · `1.5` · `12.34` · `1,2,3` | `INVALID_FORMAT` |
| `10,999` | `TOO_MANY_DECIMALS` |
| `-5,00` | `NEGATIVE` |

Arredondamento: só existe onde há divisão/multiplicação (divisão de contas, juros do planejamento,
percentuais). Regra única: **meio para longe do zero** (igual ao `round()` do Postgres) ao converter um
resultado fracionário em centavos; distribuição usa maior resto (D13). Percentuais nunca são persistidos.

## 2. Definições

### D1 — Saldo de uma conta
`saldo(conta, data_ref) = opening_balance + Σ entradas − Σ saídas`, considerando lançamentos efetivados com
`transaction_date <= data_ref`:
- entradas: `income` com `account_id = conta`; `transfer` com `destination_account_id = conta`; estorno de `expense` na conta (D5).
- saídas: `expense` com `account_id = conta`; `transfer` com `account_id = conta`; estorno de `income` na conta (D5).
- Pendentes não afetam o saldo (D6). Saldo pode ser negativo.
- Cartão: mesma fórmula; resultado ≤ 0 é a dívida (D8).

### D2 — Saldo inicial
`opening_balance` em `opening_balance_date` é o saldo no **início** desse dia. Não é receita, não entra em
totais de receita/despesa de nenhum período, só em saldos. Lançamento com data anterior a
`opening_balance_date` é rejeitado (trigger). Alterar o saldo inicial recalcula todos os saldos
(derivados) e é auditado.

### D3 — Saldo consolidado ("Saldo total" do dashboard)
`saldo_consolidado(data_ref) = Σ saldo(conta, data_ref)` para **todas as contas de ativo** da família
(ativas e arquivadas — arquivar não some com dinheiro; conta arquivada com saldo 0 não muda nada).
Cartões ficam **fora** e aparecem num indicador separado "Faturas em aberto" (D8).
Variação vs mês anterior: `saldo_consolidado(fim do período) − saldo_consolidado(fim do período anterior)`;
percentual = variação / |saldo anterior| × 100; saldo anterior = 0 → "sem base de comparação".
Datas de referência no dashboard: atual = `min(fim do período, hoje)`; anterior = fim do período anterior (D4/D20).
Numa data anterior ao `opening_balance_date`, a conta entra com o próprio saldo inicial: o app não conhece o saldo de
antes do registro, e o saldo inicial não é movimentação (D2). Por isso a variação mede só os lançamentos efetivados entre
as duas datas ([ADR-0020](adr/0020-dashboard-agregacao-compartilhada.md) §4; é o comportamento de `account_balances(p_as_of)`).

### D4 — Receitas, despesas e resultado do período
- `receitas(P) = Σ amount` de `income` efetivados com `transaction_date ∈ P` − Σ estornos de `income` com data ∈ P.
- `despesas(P) = Σ amount` de `expense` efetivados com `transaction_date ∈ P` − Σ estornos de `expense` com data ∈ P.
- `resultado(P) = receitas(P) − despesas(P)`.
- **Transferências nunca entram** em receitas, despesas ou resultado (inclui pagamento de fatura e aportes a metas vinculados a transferência).
- Despesa no cartão entra na data da compra (D8).
- Por categoria: mesmo critério agrupado por `category_id`; categoria-pai soma as subcategorias.
- Comparação de períodos: período anterior = mesmo comprimento imediatamente antes (mês civil → mês civil anterior; intervalo de N dias → N dias anteriores). Variação % com anterior = 0 → `null`.

### D5 — Estornos
- Estorno = novo lançamento com `reversal_of_id` = original, **mesmo `type`, mesma conta, mesma categoria**, `status='paid'`, data própria, valor ≤ valor original − estornos anteriores (trigger com lock).
- Efeito: inverte o sentido do original na conta (estorno de despesa é entrada) e **abate** o total do tipo/categoria no período da **data do estorno** (meses passados não são reescritos; uma categoria pode ficar negativa num mês — exibido como tal).
- Devolução do lojista = estorno. Reembolso de terceiro (empresa, plano de saúde) = **receita** na categoria "Reembolsos". Esta é a política da spec §7.5.
- Transferência não tem estorno: corrige-se editando ou excluindo (lógico).
- Diferença para exclusão: exclusão lógica remove todo o efeito (lançamento errado); estorno registra um fato real e preserva o original.

### D6 — Pago × pendente
- Efetivado (`paid`) afeta saldo e totais realizados na `transaction_date`.
- Previsto (`pending`) **não** afeta saldo nem realizado; aparece em "Próximos vencimentos", em "previsto/comprometido" de orçamentos e em projeções.
- `paid` exige `transaction_date <= hoje` (validação de domínio no servidor).
- Vencido = `pending` com `transaction_date < hoje` — **derivado**, nunca armazenado; nada é marcado como pago por ter vencido.

### D7 — Contas a pagar/receber ↔ transações ([ADR-0012](adr/0012-contas-a-pagar-como-transacoes-pendentes.md))
- Conta a pagar = `expense` `pending`; a receber = `income` `pending`. Vencimento = `transaction_date` enquanto pendente; `due_date` guarda o vencimento original.
- Pagar = a **mesma linha** passa a `paid` e `transaction_date` passa a ser a data do pagamento (padrão hoje, editável ≤ hoje). Uma linha, logo zero dupla contabilização.
- Cancelar = `status='canceled'` (fica no histórico, fora dos cálculos). Linha cancelada é imutável.
- Pagamento parcial: fora do escopo do MVP. Desfazer pagamento: fora da spec (corrige-se editando ou excluindo o efetivado).
- Refinamento da Etapa 5 ([ADR-0022](adr/0022-compromissos-pagamento-por-rpc.md)): o status muda só pelas RPCs
  `pay_pending_transaction` e `cancel_pending_transaction`. No pagamento, o valor e a conta podem ser ajustados para o real.
  `due_date` é mantido pelo banco: igual a `transaction_date` enquanto pendente, preservado no pagamento, nulo em lançamento
  criado já pago. Não existe `pending` de transferência.

### D8 — Cartão de crédito ([ADR-0013](adr/0013-cartao-como-conta-passivo.md))
- Cartão é uma conta `credit_card` (passivo) com `credit_limit`, `statement_closing_day`, `statement_due_day`.
- Compra = `expense` `paid` na conta do cartão, na data da compra → entra em despesas do período da compra (D4) e aumenta a dívida.
- Pagamento de fatura = `transfer` da conta de ativo para o cartão → reduz saldo consolidado (D3) e a dívida; **não** é despesa.
- Fatura é **derivada**: compras com `transaction_date` entre o dia seguinte ao fechamento anterior e o fechamento atual (dia de fechamento > dias do mês → último dia, D12). Sem tabela de fatura no MVP.
- "Faturas em aberto" = −saldo(cartão, hoje) quando negativo. Limite disponível = `credit_limit + saldo(cartão)`.
- Parcelamento: fora do escopo (não consta na spec).

### D9 — Metas: aportes e retiradas ([ADR-0025](adr/0025-metas-reserva-sem-transacao.md); revisão da v1.1)
- Acumulado = Σ `deposit` − Σ `withdrawal` de `goal_contributions` não excluídas, de todas as datas (fonte única; sem `current_amount`).
- Aporte é **reserva (alocação)**: não tem lançamento vinculado, não move dinheiro, não altera saldo de conta (D1), consolidado (D3), receitas/despesas/resultado (D4), orçamento (D14) nem fluxo de caixa (D17). A v1.1 previa também o aporte ligado a uma transferência (`transaction_id`); isso foi **removido**. Quem quiser separar o dinheiro de fato registra uma transferência comum, à parte.
- Acumulado nunca < 0: retirada maior que o acumulado, ou exclusão de aporte que o deixaria negativo, é rejeitada. Contribuição só em meta `active`, com data ≤ hoje.
- `% = acumulado / target_amount × 100` (pode passar de 100%; só exibição). Restante = `max(target − acumulado, 0)`.
- Ritmo atual = líquido (aportes − retiradas) com `contribution_date ∈ [hoje − 89, hoje]` ÷ 3, em centavos com meio para longe do zero. Ritmo ≤ 0 ou restante = 0 → sem estimativa.
- Estimativa de conclusão = `addMonths(hoje, ceil(restante / ritmo))`, exibida como mês e ano, **sempre** com a premissa: "Mantendo R$ X por mês (média de aportes menos retiradas dos últimos 90 dias)".
- Com data-alvo: meses até o alvo = `(ano_alvo − ano_hoje)·12 + (mês_alvo − mês_hoje)`; ≤ 0 → "a data-alvo já passou". Aporte mensal necessário = `ceil(restante / meses)` em centavos (arredonda **para cima**: é o mínimo para chegar).
- Meta "perto de ser alcançada" (notificação, Etapa 7) = `active` com 80% ≤ % < 100%.

### D10 — Despesas compartilhadas e divisão ([ADR-0026](adr/0026-divisao-de-despesas-por-rpc.md); revisão da v1.1)
- Distinção da spec §7.10: (1) despesa familiar original = a transação `expense` (conta no consolidado e em D4 uma vez); (2) distribuição de responsabilidade = `expense_splits` (nenhuma função de saldo, totais ou orçamento as lê); (3) liquidação = `settlements` (não altera contas nem consolidado).
- Parcelas: 2 a 20 integrantes distintos, cada parcela > 0, **Σ parcelas = `amount` exato**. Divisão igual = D13 sobre pesos iguais, na ordem dos integrantes (`joined_at`, depois `id`). Só em `expense` não cancelada, não excluída e que não seja estorno.
- Valor da despesa mudou (pagamento com o valor real, edição): as parcelas são **reescaladas** na proporção anterior por D13 (pesos = parcelas antigas).
- Estorno de despesa dividida herda a proporção do original: parcelas do estorno = D13(valor do estorno, pesos = parcelas atuais do original), com sinal negativo, na data do estorno (D5).
- Pagador = `assigned_member_id` da despesa (do original, no caso do estorno).
- Relatório por integrante, período P (`member_expense_totals`): para cada `expense` efetivada não excluída com data ∈ P (estornos com sinal invertido): com divisão → cada integrante recebe a sua parcela; sem divisão → o valor inteiro vai ao `assigned_member_id`; sem responsável → "Família (sem responsável)" (`member_id` nulo). **Σ do relatório = despesas(P) (D4).**
- Saldo entre integrantes (`member_balances`, todas as datas, só efetivados): `deve(X→Y)` = Σ parcelas líquidas de X em despesas pagas por Y (X ≠ Y) − Σ liquidações não excluídas de X para Y. Por par, mostra-se só o líquido positivo (`deve(X→Y) − deve(Y→X)`). Parcela do próprio pagador e despesa sem responsável não geram dívida. Pendentes não geram dívida (aparecem como "a dividir").

### D11 — Data que define o período
`transaction_date` é a única data de período e de efeito no saldo (regime de caixa, simples para família):
efetivado = data em que o dinheiro entrou/saiu (no cartão, a data da compra); pendente = vencimento.
`created_at` nunca define período. Aportes usam `contribution_date`; liquidações, `settlement_date`.

### D12 — Recorrências e meses curtos ([ADR-0011](adr/0011-recorrencias-materializadas-sob-demanda.md))
- Ocorrência n é calculada **a partir de `start_date`** (não encadeada), evitando deriva:
  - `weekly`: `start + 7·interval·n` dias;
  - `monthly`: `addMonths(start, interval·n)`; dia âncora > dias do mês → **último dia do mês**; no mês seguinte volta ao dia âncora (31/jan → 28 ou 29/fev → 31/mar → 30/abr);
  - `yearly`: 29/fev → 28/fev em ano não bissexto.
- Encerramento: ocorrências com data > `end_date` não existem.
- Materialização idempotente como `pending` (`unique (recurrence_id, occurrence_date)`) até o horizonte `fim do mês seguinte a hoje`, disparada ao acessar o app; recupera automaticamente qualquer atraso (catch-up desde `next_occurrence_date`). Tetos de 60 ocorrências por série e 500 por chamada: o restante entra nas chamadas seguintes. A falha de uma série não impede as outras e fica registrada nela ([ADR-0023](adr/0023-recorrencias-modelo-e-edicao-de-serie.md)).
- Só `income`/`expense`. Agenda imutável (`frequency`, `interval_count`, `start_date`): mudar a agenda = encerrar e criar outra série.
- Alterar uma ocorrência = editar a transação (a chave única impede recriação). Excluir uma = cancelar (idem).
- **Ocorrência intocada** = pendente, não excluída, com data ≥ hoje, `transaction_date = occurrence_date`, sem observações e com valor, descrição, conta, categoria e responsável iguais aos da série antes da mudança.
- Alterar a série (valor, descrição, conta, categoria, responsável) = atualiza **só** as intocadas. Pausar = `is_active=false` e **remove** as intocadas (revisão da v1.0, que dizia "cancela": a linha cancelada ocupa a chave única e impediria reativar); reativar = materializa de novo a partir de hoje, sem gerar atrasados do período pausado. Encerrar ou encurtar (`end_date`) = remove as intocadas depois do término. Pagas, canceladas, excluídas e editadas nunca são tocadas.
- Projeções além do horizonte (planejamento/fluxo futuro) usam ocorrências **virtuais** calculadas pela mesma função, sem persistir.

### D13 — Distribuição e arredondamento (divisão igual ou por peso)
`allocate(total, n partes)`: base = `floor(total × peso_i / Σpesos)`; resto = total − Σ base, distribuído
1 centavo por vez às partes de maior resto fracionário; empate → ordem estável (`joined_at`, depois `member_id`).
Ex.: R$ 100,00 / 3 → 33,34 · 33,33 · 33,33. Soma = original, sempre (teste de propriedade).
Etapa 6: a mesma regra existe em SQL (`private.allocate_cents(p_total numeric, p_weights numeric[]) returns numeric[]`, empate
pelo índice do array, que o chamador ordena por `joined_at`, `id`), fonte de verdade das parcelas gravadas. O `allocate` de
`src/lib/money` serve só à prévia da tela. As duas são testadas com a mesma tabela: R6, R16, R17 e 7 partes de 1,00
(0,15 · 0,15 · 0,14 · 0,14 · 0,14 · 0,14 · 0,14).

### D14 — Orçamento ([ADR-0024](adr/0024-orcamentos-mensais.md))
- Só mensal: P = cada mês civil de `start_month` a `end_month` (opcional); o mesmo limite vale em todos os meses.
- Realizado(P) = despesas(P) (D4) da categoria do orçamento e das subcategorias (categoria nula = todas as despesas): efetivadas, não excluídas, estornos abatendo pela data do estorno (D5). Pode ser negativo.
- Comprometido(P) = Σ `expense` `pending` não excluídos com data ∈ P, **no mesmo recorte de categoria** (revisão da v1.0, que não recortava). **"Comprometido" = despesa pendente ("a pagar"); receita pendente ("a receber") nunca entra.** O mesmo vale para o "comprometido" do consolidado (R3/R12): `getPendingCommitted` devolve só o `payable` de `pending_summary` (D19); o a receber aparece à parte em `getBillsSummary`.
- Disponível = limite − realizado (negativo = acima do limite). % consumido = realizado / limite × 100 (só exibição). Estado: `ok` < 80%; `attention` de 80% a 100%, inclusive; `exceeded` > 100%; realizado ≤ 0 → `ok`.
- Transferências, pendentes (fora do comprometido), cancelados e aportes de meta não entram no realizado.
- Comparação: os 3 meses anteriores dentro da vigência, com o limite atual. Categoria arquivada: o orçamento continua calculando.

### D15 — Planejamento de cenários (sem persistência)
Parcela (Price): `PMT = PV·i / (1 − (1+i)^−n)`, `PV = valor − entrada`, `i` = taxa mensal **informada** pelo
usuário; `i = 0` → `PV/n`. Total pago = `entrada + PMT·n`. Cálculo em `number` e resultado convertido a
centavos com meio-para-longe-do-zero. Tela distingue: conhecido (dados do app), informado (entradas),
estimado (resultado). Aviso fixo: "Simulação para apoiar decisões. Não é recomendação nem aconselhamento financeiro."

Refinamento da Etapa 6 ([ADR-0027](adr/0027-planejamento-simulacao-sem-persistencia.md)). Valores em centavos de entrada; cálculo
em `number`; conversão por meio para longe do zero; nenhum resultado persistido.
- **Financiamento** (comprar carro, grande compra): parcela = `round(PMT)`; total das parcelas = `round(PMT_exato · n)` (não
  `parcela · n`, para que `i = 0` dê exatamente `PV`); juros = total das parcelas − `PV`; custo total = entrada + total das
  parcelas. Limites: entrada < valor; `n` 1..480; `i` 0..20% ao mês, até 4 casas.
- **Juntar para um objetivo** (viagem): sem rendimento. Com aporte mensal informado → meses = `ceil((alvo − guardado) / aporte)`;
  com prazo informado → aporte = `ceil((alvo − guardado) / meses)`.
- **Prazo de meta**: D9 com o aporte mensal informado (padrão: o ritmo atual da meta).
- **Base conhecida**: resultado médio mensal = resultado (D4) dos **3 meses civis completos** anteriores ao atual ÷ 3; média da
  categoria = `category_totals` desses 3 meses ÷ 3; saldo de hoje = D3.
- **Novo compromisso mensal**: novo resultado médio = resultado médio − valor; efeito em 12 meses = valor × 12.
- **Redução de despesas**: economia mensal = média da categoria × % informado (ou o valor informado, até a média); em 12 meses = × 12.
- **Saldo futuro** (1..12 meses): saldo do fim do mês k = D3 de hoje + Σ até k de (entradas − saídas previstas do mês) + ajuste
  mensal informado × k. Previsto do mês (`projected_cash_flow`) = pendentes materializados com data no mês (no 1º mês, também
  os vencidos) + ocorrências **virtuais** das séries ativas com data ≥ `next_occurrence_date` e ≤ `end_date` (D12). Pendente
  e virtual nunca se repetem (a virtual começa onde a materialização parou).

### D16 — Despesas por categoria (dashboard, "Categorias de gastos")
- `category_totals(P, 'expense')`: D4 por categoria, com a subcategoria somada à categoria-pai; inclui categorias arquivadas; omite total 0.
- Fatias do gráfico = categorias com total > 0, em ordem decrescente. Até 6 fatias; com 7 ou mais, as 5 maiores + "Outras categorias" (soma das demais).
- Percentual da fatia = total / Σ totais positivos × 100. O centro mostra despesas(P) (D4), que pode ser menor que Σ positivos quando há categoria negativa.
- Categoria com total < 0 (estornos no período maiores que os gastos, D5) não vira fatia: aparece na tabela com o valor negativo.

### D17 — Fluxo de caixa mensal (dashboard)
- `monthly_cash_flow`: para cada mês civil da janela, receitas, despesas e resultado de D4 no mês **inteiro**. Todo mês aparece, inclusive com 0.
- Janela: 6 meses civis terminando no mês de `ate` do período. Σ dos meses = `period_summary` da janela.

### D18 — Últimas transações (dashboard)
Os 5 lançamentos efetivados, não excluídos, mais recentes **dentro do período** (`transaction_date desc`, `created_at desc`), inclusive transferências e estornos, com a mesma `direction` da listagem.

### D19 — Compromissos: resumo e próximos vencimentos (Etapa 5)
- A pagar em aberto = Σ `expense` `pending`; a receber em aberto = Σ `income` `pending`; vencidos = os mesmos, com `transaction_date < hoje` (com contagem). Não entram em saldo nem em realizado (D6).
- Próximos vencimentos = pendentes com vencimento ≤ hoje + 30 dias (os vencidos incluídos), em ordem de vencimento, até 5.

### D20 — Período do dashboard
`mes_atual` (padrão) = mês civil de hoje; `mes_anterior` = mês civil anterior; `personalizado` = `[de, ate]` com `de ≤ ate`, `de ≥ 2000-01-01`, `ate ≤ fim do mês atual` e até 366 dias (fora disso, vale `mes_atual`). O período anterior segue D4.

### D21 — Período dos relatórios (Etapa 7; [ADR-0028](adr/0028-relatorios-reutilizam-reports.md))
- `7_dias` = `[hoje − 6, hoje]`; `30_dias` (padrão) = `[hoje − 29, hoje]`; `3_meses` = `[1º dia do mês de hoje − 2 meses, hoje]`;
  `12_meses` = `[1º dia do mês de hoje − 11 meses, hoje]`; `personalizado` = regras de D20.
- Período anterior: `7_dias`/`30_dias` → os N dias imediatamente anteriores; `3_meses`/`12_meses` → as duas pontas recuadas
  k meses (`addMonths(−k)`, k = 3 ou 12); `personalizado` → regra de D4.
- Meses do período = meses civis que tocam P (fluxo, evolução). Orçado × realizado: os mesmos meses, no máximo os 12 últimos.

### D22 — Movimento por conta (relatório "por conta", Etapa 7)
- Para cada conta (ativo e cartão, ativas e arquivadas), em P, só efetivados não excluídos: entradas = `income` na conta +
  `transfer` recebida + estorno de `expense` na conta; saídas = `expense` na conta + `transfer` enviada + estorno de `income`.
  Líquido = entradas − saídas. **Aqui as transferências entram** (o relatório é da conta, não do consolidado).
- Saldo no início = `account_balances(início − 1)`; no fim = `account_balances(fim)`; fim = início + líquido.
- Σ líquido das contas de ativo = variação do consolidado (D3) no período: as transferências entre contas de ativo se anulam,
  e o pagamento de fatura sai do ativo (D8). Conta sem movimento no período e com saldo 0 é omitida.

## 3. Regressão financeira obrigatória (spec §13)

| Caso | Dados | Esperado |
|---|---|---|
| R1 | Conta corrente saldo inicial 1.000,00; receita 500,00; despesa 200,00; transferência 100,00 corrente→poupança (saldo inicial 0) | consolidado 1.300,00; receitas 500,00; despesas 200,00; resultado 300,00; corrente 1.200,00; poupança 100,00 |
| R2 | R1 + estorno de 50,00 da despesa | consolidado 1.350,00; despesas 150,00 |
| R3 | R1 + despesa pendente 80,00 | consolidado 1.300,00; comprometido 80,00 |
| R4 | Compra no cartão 300,00 em março; pagamento da fatura 300,00 em abril | despesas março 300,00, abril 0; consolidado cai 300,00 só em abril |
| R5 | Recorrência mensal início 31/01/2027 | 31/01, 28/02, 31/03, 30/04/2027; 2028: 29/02 |
| R6 | Divisão de 100,00 em 3 | 33,34 + 33,33 + 33,33 = 100,00 |
| R7 | Edição de despesa 200,00 → 250,00 | despesas 250,00; audit com old/new |
| R8 | Exclusão lógica da despesa | despesas 0; linha preservada com `deleted_at` |
| R9 | Categoria Alimentação com subcategoria Mercado. Setembro: despesa 80,00 em Alimentação, 120,00 em Mercado, 50,00 em Transporte; transferência 100,00; pendente 30,00 em Alimentação. Outubro: estorno 20,00 da despesa de Mercado | `category_totals(set)`: Alimentação 200,00, Transporte 50,00 (Mercado não aparece separada; transferência e pendente fora); fatias 80,0% e 20,0%. `category_totals(out)`: Alimentação −20,00; outubro sem fatias; despesas(out) = −20,00 |
| R10 | Setembro: receitas 0, despesas 200,00. Outubro: receitas 500,00, despesas 250,00 | receitas: delta +500,00, percentual `null` ("sem base de comparação"); despesas: +50,00 e +25,0%; resultado: −200,00 → +250,00, delta +450,00, +225,0% (sobre \|−200,00\|) |
| R11 | Janela jan–jun/2026: março, compra no cartão 300,00; abril, pagamento da fatura 300,00 (transferência); maio, receita 500,00, despesa 100,00 e estorno 50,00 dela | 6 linhas: jan 0/0, fev 0/0, mar 0/300,00, abr 0/0, mai 500,00/50,00, jun 0/0; Σ = `period_summary(jan..jun)` = 500,00/350,00 |
| R12 | R3 com vencimento ontem; pagar hoje com 85,00 | antes: vencido (derivado), consolidado inalterado, comprometido 80,00. Depois: a **mesma linha** `paid`, `transaction_date` = hoje, `due_date` = ontem, despesas do mês +85,00, saldo −85,00, comprometido 0; contagem de linhas igual; segundo pagamento → `INVALID_STATUS_TRANSITION` |
| R13 | Série mensal de 1.200,00 com início = hoje − 2 meses; chamar a materialização duas vezes | 4 ocorrências (−2, −1, este mês, próximo mês), as 2 primeiras vencidas; a segunda chamada devolve 0; pausar remove as intocadas com data ≥ hoje; reativar recria as de data ≥ hoje, sem as do período pausado |
| R14 | Orçamento de Alimentação (pai) com limite 500,00 no mês M: despesa 300,00 em Alimentação, 150,00 em Mercado (filha), estorno 50,00 da primeira no mês M, transferência 100,00, despesa 60,00 em Transporte, pendente 80,00 em Alimentação. Orçamento "Todas as despesas" com limite 400,00 | Alimentação: realizado 400,00, comprometido 80,00, disponível 100,00, 80,0% → `attention`. Todas: realizado 460,00, 115,0% → `exceeded`, disponível −60,00 |
| R15 | R1 + meta "Viagem" com alvo 5.000,00: aporte 400,00 (hoje) e retirada 100,00 (hoje) | acumulado 300,00; 6,0%; restante 4.700,00; ritmo 100,00/mês; estimativa = hoje + 47 meses; consolidado 1.300,00, corrente 1.200,00, poupança 100,00, receitas 500,00, despesas 200,00 (iguais a R1); `budget_progress`, `monthly_cash_flow` e `category_totals` iguais a R1; retirada de 300,01 → `GOAL_NEGATIVE_PROGRESS`; excluir o aporte de 400,00 → `GOAL_NEGATIVE_PROGRESS`; excluir a retirada e depois o aporte → acumulado 0,00 |
| R16 | Integrantes A, B, C (nessa ordem de entrada). R1 + a despesa de 200,00 com responsável A, dividida igualmente; estorno de 50,00 dela no mesmo mês | parcelas 66,67 · 66,67 · 66,66; parcelas do estorno 16,67 · 16,67 · 16,66; por integrante no mês: A 50,00, B 50,00, C 50,00 (Σ 150,00 = despesas); consolidado 1.350,00 (= R2: a divisão não muda nada); saldos: B deve 50,00 a A, C deve 50,00 a A |
| R17 | Compromisso de 100,00 dividido igualmente entre A, B, C; pago com 101,00 | antes: 33,34 · 33,33 · 33,33; depois: 33,68 · 33,66 · 33,66 (Σ 101,00); 3 linhas de parcela antes e depois; despesas +101,00, uma linha de lançamento |
| R18 | Despesa 300,00 paga por A dividida igualmente entre A, B, C; despesa 90,00 paga por B dividida por valores A 30,00 · B 60,00; despesa 50,00 sem responsável dividida entre B e C; liquidação de B para A de 50,00 | saldos: B deve 20,00 a A (100,00 − 30,00 − 50,00); C deve 100,00 a A; nenhuma dívida da despesa sem responsável; consolidado e despesas iguais aos sem divisão (440,00 de despesas) |
| R19 | Financiamento: valor 80.000,00, entrada 20.000,00, 36 meses | `i = 0`: parcela 1.666,67, total das parcelas 60.000,00, juros 0,00, custo total 80.000,00. `i = 1,5%`: parcela 2.169,14, total das parcelas 78.089,17, juros 18.089,17, custo total 98.089,17. `i = 0,4%`: parcela 1.792,87, total 64.543,36 |
| R20 | Mês M com R1 + despesa 90,00 sem responsável; a despesa de 200,00 com responsável A, sem divisão | por conta: corrente início 1.000,00, entradas 500,00, saídas 390,00 (200,00 + 90,00 + 100,00), fim 1.110,00; poupança início 0,00, entradas 100,00, fim 100,00; Σ líquido ativo = 210,00 = variação do consolidado; por integrante: A 200,00, "Família (sem responsável)" 90,00, Σ 290,00 = despesas(M) |
