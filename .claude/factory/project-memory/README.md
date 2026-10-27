# Memória deste projeto

Memória **exclusiva deste projeto**.

> Não duplicar conhecimento global.
> Não registrar o que já é evidente no código ou `CLAUDE.md`.
> Ler somente quando a tarefa depender dela.

Conteúdo daqui não vai para a memória organizacional global (`~/.claude/factory/memory/`) sem proposta e aprovação.

## Estrutura

| Pasta           | Conteúdo                                           |
| --------------- | -------------------------------------------------- |
| `decisions/`    | ADRs: decisões arquiteturais e técnicas relevantes |
| `conventions/`  | convenções locais que não estão no `CLAUDE.md`     |
| `requirements/` | requisitos e critérios de aceitação persistentes   |
| `security/`     | achados, escopo de teste e threat model (ver o `README.md` da pasta) |

## Regra de leitura

A memória é **opt-in e sob demanda**.

Fluxo padrão:

```text
tarefa
→ contexto atual
→ procurar memória somente se houver dependência
→ ler apenas o arquivo relevante
```

Não:

* carregar todas as pastas;
* listar todo o histórico;
* ler memória por hábito;
* usar memória antiga quando o código/decisão atual contradizê-la.

Quando houver conflito, o estado atual explicitamente decidido pelo projeto prevalece.

## Regra de escrita

Só registrar algo se pelo menos uma condição for verdadeira:

* evita repetir uma decisão importante;
* documenta uma restrição que não é óbvia;
* registra um requisito persistente;
* evita uma decisão incorreta no futuro.

Se não houver ganho claro de contexto futuro, **não criar arquivo**.

Antes de criar:

1. procurar arquivo relacionado;
2. atualizar o existente se representar o mesmo assunto;
3. verificar `CLAUDE.md`;
4. evitar duplicação.

## Formato

Um arquivo deve conter **um assunto** e ser curto.

Priorizar:

```text
O que foi decidido
Por quê
Impacto / restrição relevante
```

Não registrar:

* narrativa da investigação;
* histórico de tentativas;
* explicações óbvias pelo código;
* cópias de documentação;
* detalhes temporários;
* preferências pessoais sem consequência técnica.

## Decisions

`decisions/NNNN-titulo.md`

Use para decisões que afetam arquitetura, contratos, estrutura ou comportamento técnico futuro.

Formato mínimo:

```markdown
# Título

Status: ativa

## Decisão

...

## Por quê

...

## Impacto

...
```

Se substituída:

```text
Status: substituída por NNNN
```

Não apagar decisões substituídas.

Não criar ADR para mudanças triviais ou decisões facilmente inferíveis do código.

## Conventions

Registrar somente convenções locais que:

* são recorrentes;
* não estão no `CLAUDE.md`;
* não são óbvias pela implementação.

Exemplos:

* convenção de nomes;
* organização de camadas;
* tratamento de erros;
* idioma;
* scripts específicos.

Se a regra já estiver no `CLAUDE.md`, **referenciar em vez de duplicar**.

## Requirements

Registrar somente requisitos persistentes ou critérios de aceitação que precisem sobreviver à tarefa atual.

Não transformar esta pasta em backlog.

Requisitos temporários ou já incorporados ao código não precisam permanecer aqui.

## Evolução

Se um conteúdo for generalizável para outros projetos:

```text
project-memory
→ ~/.claude/factory/learning/proposals/
→ avaliação/aprovação
→ memória global
```

Nunca escrever diretamente na memória organizacional.

## Regra de economia

> **Contexto atual primeiro. Memória somente quando agrega informação. Um arquivo relevante é melhor que um diretório inteiro.**

O objetivo desta memória não é registrar tudo.

É preservar **somente decisões, restrições e conhecimento local que economizem trabalho futuro**.
