# Texto explicativo vai em InfoHint

## Decisão

Texto explicativo vai em `InfoHint` (`src/components/shared/info-hint.tsx`, botão ⓘ), nunca direto na tela.
Ficam na tela só rótulos, títulos, dados, erros/validações, alertas críticos ou de risco (exclusão
irreversível, saldo negativo, segurança), confirmações destrutivas, estados vazios curtos, placeholders,
botões e toasts.

## Por quê

Pedido do usuário: telas o mais limpas possíveis, objetivas e diretas.

## Impacto

- `PageHeader.description` e `LabeledField.description` já renderizam o ⓘ sozinhos.
- O texto só existe no DOM com o popover aberto: testes devem clicar no botão "Mais informações sobre
  <assunto>" antes de procurar o texto.
- Dúvida: se o usuário perde a capacidade de agir ou de entender o risco sem o texto, ele fica na tela.
