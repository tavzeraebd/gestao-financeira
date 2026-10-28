import "server-only";
import type { ErrorCode } from "@/server/action";

/** Mensagens pt-BR seguras para o usuário, com próximo passo. Nunca repassar erro do Supabase/Postgres. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR:
    "Alguns dados estão inválidos. Corrija os campos indicados e tente novamente.",
  UNAUTHENTICATED: "Sua sessão expirou. Entre novamente para continuar.",
  FORBIDDEN:
    "Você não tem permissão para fazer isso. Peça a quem administra a família.",
  NOT_FOUND: "Não encontramos o que você procura. Volte e tente novamente.",
  CONFLICT: "Essa informação já existe. Revise os dados e tente novamente.",
  RATE_LIMITED:
    "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  INVALID_CREDENTIALS:
    "E-mail ou senha incorretos. Confira os dados ou redefina sua senha.",
  EMAIL_NOT_CONFIRMED:
    "Confirme seu e-mail antes de entrar. Podemos reenviar o link de confirmação.",
  WEAK_PASSWORD:
    "A senha é fraca. Use ao menos 8 caracteres, com letras e números.",
  SAME_PASSWORD:
    "A nova senha deve ser diferente da atual. Escolha outra senha.",
  ALREADY_IN_FAMILY:
    "Você já faz parte de uma família. Acesse o início para continuar.",
  NO_FAMILY:
    "Você ainda não faz parte de uma família. Crie uma ou aceite um convite.",
  INVITE_NOT_FOUND:
    "Convite não encontrado. Confira o link ou peça um novo convite.",
  INVITE_EXPIRED:
    "Este convite expirou. Peça um novo convite a quem administra a família.",
  INVITE_ALREADY_USED:
    "Este convite já foi usado. Peça um novo convite a quem administra a família.",
  INVITE_REVOKED:
    "Este convite foi cancelado. Peça um novo convite a quem administra a família.",
  INVITE_EMAIL_MISMATCH:
    "Este convite foi emitido para outro e-mail. Entre com o e-mail convidado.",
  INVITE_LIMIT_REACHED:
    "A família atingiu o limite de convites pendentes. Revogue algum convite e tente novamente.",
  ACCOUNT_ARCHIVED:
    "Esta conta está arquivada. Reative a conta ou escolha outra.",
  CATEGORY_ARCHIVED:
    "Esta categoria está arquivada. Reative a categoria ou escolha outra.",
  CATEGORY_TYPE_MISMATCH:
    "A categoria não combina com o tipo do lançamento. Escolha uma categoria de despesa ou de receita conforme o caso.",
  DATE_BEFORE_OPENING_BALANCE:
    "A data é anterior ao saldo inicial da conta. Escolha uma data a partir do saldo inicial ou ajuste a data do saldo da conta.",
  OPENING_DATE_AFTER_TRANSACTIONS:
    "Já existem lançamentos antes dessa data. Escolha uma data anterior ao primeiro lançamento da conta.",
  FUTURE_DATE_NOT_ALLOWED:
    "A data não pode ser futura. Use a data de hoje ou anterior.",
  INVALID_REVERSAL:
    "Não é possível estornar este lançamento. Só despesas e receitas efetivadas, sem exclusão, podem ser estornadas.",
  REVERSAL_EXCEEDS_REMAINING:
    "O valor do estorno é maior que o valor ainda estornável. Informe um valor menor.",
  TRANSACTION_HAS_REVERSALS:
    "Este lançamento tem estornos e não pode ser alterado nem excluído. Exclua os estornos antes, se for o caso.",
  CATEGORY_HAS_CHILDREN:
    "Esta categoria tem subcategorias ativas. Arquive as subcategorias antes.",
  INVALID_CATEGORY_PARENT:
    "A categoria pai não é válida. Escolha uma categoria principal do mesmo tipo.",
  CATEGORY_IN_USE:
    "Esta categoria tem lançamentos, recorrências ou orçamentos. Arquive-a para escondê-la dos formulários.",
  INVALID_STATUS_TRANSITION:
    "Este compromisso já foi pago ou cancelado. Atualize a página para ver a situação atual.",
  RECURRENCE_LIMIT_REACHED:
    "A família já tem 100 recorrências ativas. Pause ou encerre alguma antes de criar outra.",
  BUDGET_ALREADY_EXISTS:
    "Já existe um orçamento ativo para esta categoria. Edite o existente.",
  GOAL_NOT_ACTIVE:
    "Esta meta não está ativa. Reative-a para registrar aportes.",
  GOAL_NEGATIVE_PROGRESS:
    "O valor guardado não pode ficar negativo. Confira o valor da retirada.",
  SPLIT_NOT_ALLOWED: "Só despesas não canceladas podem ser divididas.",
  SPLIT_SUM_MISMATCH:
    "A soma das partes precisa ser igual ao valor da despesa.",
  SPLIT_AMOUNT_TOO_SMALL:
    "O valor ficou pequeno demais para a divisão entre os integrantes. Remova a divisão ou aumente o valor.",
  MEMBER_INACTIVE:
    "Um dos integrantes não faz mais parte da família. Atualize a página.",
  NAME_TAKEN: "Já existe um item com este nome. Escolha outro nome.",
  OWNER_MUST_TRANSFER:
    "Transfira a propriedade da família para outro integrante antes de sair.",
  CANNOT_TARGET_SELF: "Você não pode fazer isso com o seu próprio vínculo.",
  INTERNAL_ERROR:
    "Algo deu errado do nosso lado. Tente novamente em instantes.",
};
