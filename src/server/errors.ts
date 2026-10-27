import "server-only";
import { isAuthError } from "@supabase/supabase-js";
import type { ErrorCode } from "@/server/action";
import { ERROR_MESSAGES } from "@/server/error-messages";

/** Campo do formulário a que cada erro conhecido pertence (`fieldErrors`). */
const FIELD_BY_CODE: Partial<Record<ErrorCode, string>> = {
  NAME_TAKEN: "name",
  ACCOUNT_ARCHIVED: "accountId",
  CATEGORY_ARCHIVED: "categoryId",
  CATEGORY_TYPE_MISMATCH: "categoryId",
  DATE_BEFORE_OPENING_BALANCE: "transactionDate",
  FUTURE_DATE_NOT_ALLOWED: "transactionDate",
  REVERSAL_EXCEEDS_REMAINING: "amount",
  OPENING_DATE_AFTER_TRANSACTIONS: "openingBalanceDate",
  BUDGET_ALREADY_EXISTS: "categoryId",
  GOAL_NEGATIVE_PROGRESS: "amount",
  // Pagar/alterar o valor de um lançamento dividido (payBill, updateTransaction): erro no campo valor.
  SPLIT_AMOUNT_TOO_SMALL: "amount",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: Partial<Record<string, string[]>>;

  constructor(
    code: ErrorCode,
    options?: {
      cause?: unknown;
      fieldErrors?: Partial<Record<string, string[]>>;
    },
  ) {
    // A mensagem é sempre a segura (pt-BR); o detalhe técnico fica só em `cause`.
    super(ERROR_MESSAGES[code], { cause: options?.cause });
    this.name = "AppError";
    this.code = code;
    const field = FIELD_BY_CODE[code];
    this.fieldErrors =
      options?.fieldErrors ??
      (field ? { [field]: [ERROR_MESSAGES[code]] } : undefined);
  }
}

/** `true` se `e` é um erro do Postgres com o `code` SQLSTATE e (opcional) o nome da constraint. */
export function isConstraintViolation(
  e: unknown,
  code: "23503" | "23505" | "23514",
  constraint?: string,
): boolean {
  if (!isPostgrestError(e) || e.code !== code) return false;
  return constraint === undefined || e.message.includes(constraint);
}

const AUTH_CODES: Record<string, ErrorCode> = {
  invalid_credentials: "INVALID_CREDENTIALS",
  email_not_confirmed: "EMAIL_NOT_CONFIRMED",
  weak_password: "WEAK_PASSWORD",
  same_password: "SAME_PASSWORD",
  over_request_rate_limit: "RATE_LIMITED",
  over_email_send_rate_limit: "RATE_LIMITED",
  session_not_found: "UNAUTHENTICATED",
  session_expired: "UNAUTHENTICATED",
  refresh_token_not_found: "UNAUTHENTICATED",
  bad_jwt: "UNAUTHENTICATED",
  user_not_found: "UNAUTHENTICATED",
  email_address_invalid: "VALIDATION_ERROR",
  validation_failed: "VALIDATION_ERROR",
};

/** Mensagens `P0001` das RPCs (`data-model.md` §4.6) -> código do app. Lista fechada. */
const DB_CODES: Record<string, ErrorCode> = {
  NOT_AUTHENTICATED: "UNAUTHENTICATED",
  INVALID_INPUT: "VALIDATION_ERROR",
  ALREADY_IN_FAMILY: "ALREADY_IN_FAMILY",
  INVITE_NOT_FOUND: "INVITE_NOT_FOUND",
  INVITE_EXPIRED: "INVITE_EXPIRED",
  INVITE_ALREADY_USED: "INVITE_ALREADY_USED",
  INVITE_REVOKED: "INVITE_REVOKED",
  INVITE_EMAIL_MISMATCH: "INVITE_EMAIL_MISMATCH",
  INVITE_LIMIT_REACHED: "INVITE_LIMIT_REACHED",
  ACCOUNT_ARCHIVED: "ACCOUNT_ARCHIVED",
  CATEGORY_ARCHIVED: "CATEGORY_ARCHIVED",
  CATEGORY_TYPE_MISMATCH: "CATEGORY_TYPE_MISMATCH",
  DATE_BEFORE_OPENING_BALANCE: "DATE_BEFORE_OPENING_BALANCE",
  OPENING_DATE_AFTER_TRANSACTIONS: "OPENING_DATE_AFTER_TRANSACTIONS",
  FUTURE_DATE_NOT_ALLOWED: "FUTURE_DATE_NOT_ALLOWED",
  INVALID_REVERSAL: "INVALID_REVERSAL",
  REVERSAL_EXCEEDS_REMAINING: "REVERSAL_EXCEEDS_REMAINING",
  TRANSACTION_HAS_REVERSALS: "TRANSACTION_HAS_REVERSALS",
  CATEGORY_HAS_CHILDREN: "CATEGORY_HAS_CHILDREN",
  INVALID_CATEGORY_PARENT: "INVALID_CATEGORY_PARENT",
  INVALID_STATUS_TRANSITION: "INVALID_STATUS_TRANSITION",
  RECURRENCE_LIMIT_REACHED: "RECURRENCE_LIMIT_REACHED",
  GOAL_NOT_ACTIVE: "GOAL_NOT_ACTIVE",
  GOAL_NEGATIVE_PROGRESS: "GOAL_NEGATIVE_PROGRESS",
  SPLIT_NOT_ALLOWED: "SPLIT_NOT_ALLOWED",
  SPLIT_SUM_MISMATCH: "SPLIT_SUM_MISMATCH",
  SPLIT_AMOUNT_TOO_SMALL: "SPLIT_AMOUNT_TOO_SMALL",
  MEMBER_INACTIVE: "MEMBER_INACTIVE",
  NOT_FOUND: "NOT_FOUND",
};

const POSTGREST_CODES: Record<string, ErrorCode> = {
  "42501": "FORBIDDEN",
  "23505": "CONFLICT",
  // FK violada (ex.: conta/responsável de outra família): referência inválida, não erro interno.
  "23503": "VALIDATION_ERROR",
  "23514": "VALIDATION_ERROR",
  PGRST116: "NOT_FOUND",
  PGRST301: "UNAUTHENTICATED",
};

function lookup(
  table: Record<string, ErrorCode>,
  key: unknown,
): ErrorCode | undefined {
  return typeof key === "string" && Object.hasOwn(table, key)
    ? table[key]
    : undefined;
}

function isPostgrestError(e: unknown): e is { code: string; message: string } {
  if (typeof e !== "object" || e === null) return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.code === "string" &&
    typeof o.message === "string" &&
    "details" in o
  );
}

/** Converte qualquer erro em `AppError`. A mensagem do Postgres/Supabase nunca chega ao usuário. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;

  if (isAuthError(e)) {
    const mapped = lookup(AUTH_CODES, e.code);
    if (mapped) return new AppError(mapped, { cause: e });
    if (e.status === 429) return new AppError("RATE_LIMITED", { cause: e });
    if (e.name === "AuthSessionMissingError") {
      return new AppError("UNAUTHENTICATED", { cause: e });
    }
    return new AppError("INTERNAL_ERROR", { cause: e });
  }

  if (isPostgrestError(e)) {
    if (e.code === "P0001") {
      const mapped = lookup(DB_CODES, e.message.trim());
      return new AppError(mapped ?? "INTERNAL_ERROR", { cause: e });
    }
    const mapped = lookup(POSTGREST_CODES, e.code);
    return new AppError(mapped ?? "INTERNAL_ERROR", { cause: e });
  }

  return new AppError("INTERNAL_ERROR", { cause: e });
}
