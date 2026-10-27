# ADR-0003 — Dinheiro: centavos inteiros no TS, numeric(14,2) no banco, string no transporte

Status: aceita · Escopo: todo valor monetário

**Contexto.** Spec §3.5/§5.3 proíbe ponto flutuante sem estratégia; o PostgREST serializa `numeric` como número JSON (float no JS).

**Decisão.** Banco `numeric(14,2)`; valores de lançamento `> 0` (o sinal vem do tipo). Domínio TS em `Cents` (inteiro seguro, branded). Transporte sempre string (`amount::text` na leitura; `"1234.56"` na escrita). Parsing pt-BR estrito; arredondamento meio-para-longe-do-zero; maior resto em distribuições (`financial-definitions.md` §1).

**Alternativas.** `bigint` de centavos no banco: contraria a spec (`numeric`) e piora o SQL de relatório. Biblioteca decimal no TS: dependência a mais para soma/subtração.

**Consequências.** Repositories nunca leem coluna monetária sem cast; `src/lib/money` é obrigatório e testado; percentuais só para exibição.
