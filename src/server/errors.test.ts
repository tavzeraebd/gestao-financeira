import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ERROR_MESSAGES } from "@/server/error-messages";
import { AppError, toAppError } from "@/server/errors";

const pg = (code: string, message: string) => ({
  code,
  message,
  details: null,
  hint: null,
});

describe("toAppError", () => {
  it.each([
    ["invalid_credentials", 400, "INVALID_CREDENTIALS"],
    ["email_not_confirmed", 400, "EMAIL_NOT_CONFIRMED"],
    ["weak_password", 422, "WEAK_PASSWORD"],
    ["same_password", 422, "SAME_PASSWORD"],
    ["over_request_rate_limit", 429, "RATE_LIMITED"],
    ["over_email_send_rate_limit", 429, "RATE_LIMITED"],
    ["session_not_found", 401, "UNAUTHENTICATED"],
    ["algo_desconhecido", 500, "INTERNAL_ERROR"],
  ] as const)("AuthError %s -> %s", (authCode, status, expected) => {
    const result = toAppError(
      new AuthApiError("detalhe interno", status, authCode),
    );
    expect(result.code).toBe(expected);
    expect(result.message).toBe(ERROR_MESSAGES[expected]);
    expect(result.message).not.toContain("detalhe interno");
  });

  it("AuthError com status 429 sem code -> RATE_LIMITED", () => {
    expect(toAppError(new AuthApiError("x", 429, undefined)).code).toBe(
      "RATE_LIMITED",
    );
  });

  it("AuthSessionMissingError -> UNAUTHENTICATED", () => {
    expect(toAppError(new AuthSessionMissingError()).code).toBe(
      "UNAUTHENTICATED",
    );
  });

  it.each([
    ["NOT_AUTHENTICATED", "UNAUTHENTICATED"],
    ["INVALID_INPUT", "VALIDATION_ERROR"],
    ["ALREADY_IN_FAMILY", "ALREADY_IN_FAMILY"],
    ["INVITE_NOT_FOUND", "INVITE_NOT_FOUND"],
    ["INVITE_EXPIRED", "INVITE_EXPIRED"],
    ["INVITE_ALREADY_USED", "INVITE_ALREADY_USED"],
    ["INVITE_REVOKED", "INVITE_REVOKED"],
    ["INVITE_EMAIL_MISMATCH", "INVITE_EMAIL_MISMATCH"],
    ["INVITE_LIMIT_REACHED", "INVITE_LIMIT_REACHED"],
    ["ACCOUNT_ARCHIVED", "ACCOUNT_ARCHIVED"],
    ["CATEGORY_ARCHIVED", "CATEGORY_ARCHIVED"],
    ["CATEGORY_TYPE_MISMATCH", "CATEGORY_TYPE_MISMATCH"],
    ["DATE_BEFORE_OPENING_BALANCE", "DATE_BEFORE_OPENING_BALANCE"],
    ["OPENING_DATE_AFTER_TRANSACTIONS", "OPENING_DATE_AFTER_TRANSACTIONS"],
    ["FUTURE_DATE_NOT_ALLOWED", "FUTURE_DATE_NOT_ALLOWED"],
    ["INVALID_REVERSAL", "INVALID_REVERSAL"],
    ["REVERSAL_EXCEEDS_REMAINING", "REVERSAL_EXCEEDS_REMAINING"],
    ["TRANSACTION_HAS_REVERSALS", "TRANSACTION_HAS_REVERSALS"],
    ["CATEGORY_HAS_CHILDREN", "CATEGORY_HAS_CHILDREN"],
    ["INVALID_CATEGORY_PARENT", "INVALID_CATEGORY_PARENT"],
  ] as const)("P0001 %s -> %s", (message, expected) => {
    expect(toAppError(pg("P0001", message)).code).toBe(expected);
  });

  it("P0001 com mensagem fora da lista -> INTERNAL_ERROR sem expor a mensagem", () => {
    const result = toAppError(pg("P0001", "segredo: tabela x coluna y"));
    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.message).not.toContain("segredo");
  });

  it.each([
    ["42501", "FORBIDDEN"],
    ["23505", "CONFLICT"],
    ["23514", "VALIDATION_ERROR"],
    ["PGRST116", "NOT_FOUND"],
    ["XX000", "INTERNAL_ERROR"],
  ] as const)("Postgres %s -> %s", (code, expected) => {
    const result = toAppError(
      pg(code, "permission denied for table family_invites"),
    );
    expect(result.code).toBe(expected);
    expect(result.message).not.toContain("family_invites");
  });

  it("não usa chaves herdadas de Object.prototype como código", () => {
    expect(toAppError(pg("P0001", "constructor")).code).toBe("INTERNAL_ERROR");
  });

  it("erro desconhecido -> INTERNAL_ERROR", () => {
    expect(toAppError(new Error("boom")).code).toBe("INTERNAL_ERROR");
    expect(toAppError("texto").code).toBe("INTERNAL_ERROR");
    expect(toAppError(null).code).toBe("INTERNAL_ERROR");
  });

  it("AppError passa direto", () => {
    const original = new AppError("FORBIDDEN");
    expect(toAppError(original)).toBe(original);
  });
});
