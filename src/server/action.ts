import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ERROR_MESSAGES } from "@/server/error-messages";
import { toAppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { getRequestId } from "@/server/request-id";
import type { Database } from "@/types/database";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_CONFIRMED"
  | "WEAK_PASSWORD"
  | "SAME_PASSWORD"
  | "ALREADY_IN_FAMILY"
  | "NO_FAMILY"
  | "INVITE_NOT_FOUND"
  | "INVITE_EXPIRED"
  | "INVITE_ALREADY_USED"
  | "INVITE_REVOKED"
  | "INVITE_EMAIL_MISMATCH"
  | "INVITE_LIMIT_REACHED"
  | "ACCOUNT_ARCHIVED"
  | "CATEGORY_ARCHIVED"
  | "CATEGORY_TYPE_MISMATCH"
  | "DATE_BEFORE_OPENING_BALANCE"
  | "OPENING_DATE_AFTER_TRANSACTIONS"
  | "FUTURE_DATE_NOT_ALLOWED"
  | "INVALID_REVERSAL"
  | "REVERSAL_EXCEEDS_REMAINING"
  | "TRANSACTION_HAS_REVERSALS"
  | "CATEGORY_HAS_CHILDREN"
  | "INVALID_CATEGORY_PARENT"
  | "CATEGORY_IN_USE"
  | "INVALID_STATUS_TRANSITION"
  | "RECURRENCE_LIMIT_REACHED"
  | "BUDGET_ALREADY_EXISTS"
  | "GOAL_NOT_ACTIVE"
  | "GOAL_NEGATIVE_PROGRESS"
  | "SPLIT_NOT_ALLOWED"
  | "SPLIT_SUM_MISMATCH"
  | "SPLIT_AMOUNT_TOO_SMALL"
  | "MEMBER_INACTIVE"
  | "NAME_TAKEN"
  | "OWNER_MUST_TRANSFER"
  | "CANNOT_TARGET_SELF"
  | "INTERNAL_ERROR";

export type ActionError = {
  code: ErrorCode;
  /** pt-BR, seguro para o usuário. */
  message: string;
  /** Em VALIDATION_ERROR e em erros de domínio ligados a um campo (ex.: NAME_TAKEN). */
  fieldErrors?: Partial<Record<string, string[]>>;
  requestId: string;
};

export type ActionResult<T = null> =
  { ok: true; data: T } | { ok: false; error: ActionError };

export type ActionContext = {
  supabase: SupabaseClient<Database>;
  userId: string | null;
  requestId: string;
};

export async function runAction<S extends z.ZodType, O>(opts: {
  module: string;
  operation: string;
  schema: S;
  input: unknown;
  auth: "required" | "none";
  handler: (input: z.output<S>, ctx: ActionContext) => Promise<O>;
}): Promise<ActionResult<O>> {
  const requestId = await getRequestId();
  const startedAt = Date.now();
  let userId: string | undefined;

  const fail = (
    code: ErrorCode,
    fieldErrors?: ActionError["fieldErrors"],
  ): ActionResult<O> => {
    logger[code === "INTERNAL_ERROR" ? "error" : "warn"]({
      requestId,
      module: opts.module,
      operation: opts.operation,
      code,
      durationMs: Date.now() - startedAt,
      userId,
    });
    return {
      ok: false,
      error: {
        code,
        message: ERROR_MESSAGES[code],
        ...(fieldErrors ? { fieldErrors } : {}),
        requestId,
      },
    };
  };

  try {
    const parsed = opts.schema.safeParse(opts.input);
    if (!parsed.success) {
      return fail(
        "VALIDATION_ERROR",
        z.flattenError(parsed.error).fieldErrors as ActionError["fieldErrors"],
      );
    }

    const supabase = await createClient();
    let currentUserId: string | null = null;

    if (opts.auth === "required") {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        // Sem sessão ou sessão inválida = UNAUTHENTICATED; falha de rede/servidor = erro interno.
        const appError = toAppError(error);
        if (appError.code === "UNAUTHENTICATED") return fail("UNAUTHENTICATED");
        if (
          error.status === 400 ||
          error.status === 401 ||
          error.status === 403
        ) {
          return fail("UNAUTHENTICATED");
        }
        throw appError;
      }
      if (!data.user) return fail("UNAUTHENTICATED");
      currentUserId = data.user.id;
      userId = currentUserId;
    }

    const result = await opts.handler(parsed.data, {
      supabase,
      userId: currentUserId,
      requestId,
    });

    logger.info({
      requestId,
      module: opts.module,
      operation: opts.operation,
      code: "OK",
      durationMs: Date.now() - startedAt,
      userId,
    });
    return { ok: true, data: result };
  } catch (e) {
    // redirect()/notFound() lançados pelo handler seguem adiante.
    unstable_rethrow(e);
    const appError = toAppError(e);
    return fail(appError.code, appError.fieldErrors);
  }
}
