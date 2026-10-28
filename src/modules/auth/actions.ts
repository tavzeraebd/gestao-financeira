"use server";

import "server-only";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { serverEnv } from "@/lib/env/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import {
  requestPasswordResetSchema,
  resendConfirmationSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/modules/auth/schemas";
import { runAction, type ActionResult } from "@/server/action";
import { AppError, toAppError } from "@/server/errors";
import { emailHmac } from "@/server/log-identity";
import { logger } from "@/server/logger";
import {
  emailRateKey,
  hitIpRateLimit,
  hitRateLimit,
  isIpRateLimited,
} from "@/server/rate-limit";
import { getRequestId } from "@/server/request-id";

const identity = (data: { email: string }) => ({ email: data.email });

/**
 * Baldes de envio de e-mail (cadastro, reenvio, recuperação): por IP e por e-mail. Os dois são
 * contados sempre. `false` = acima do limite: a ação NÃO chama o Auth e responde o mesmo sucesso
 * neutro de sempre (anti-enumeração); só o log diz o motivo (ADR-0034 §4).
 */
function emailSendAllowed(
  email: string,
  ip: string | null,
  requestId: string,
): boolean {
  const byIp = hitIpRateLimit("auth_email_ip", ip, requestId);
  const byTarget = hitRateLimit("auth_email_target", emailRateKey(email));
  return byIp.allowed && byTarget.allowed;
}

/** Linha `warn` de uma ação neutra: o motivo real fica só aqui, com IP e e-mail pseudonimizado. */
function warnNeutral(
  operation: string,
  code: string,
  ctx: { requestId: string; ip: string | null },
  email: string,
): void {
  logger.warn({
    requestId: ctx.requestId,
    module: "auth",
    operation,
    code,
    ip: ctx.ip ?? undefined,
    emailHmac: emailHmac(email),
  });
}

export async function signUp(
  input: z.input<typeof signUpSchema>,
): Promise<ActionResult<{ email: string }>> {
  return runAction({
    module: "auth",
    operation: "signUp",
    schema: signUpSchema,
    input,
    auth: "none",
    identity,
    handler: async (data, { supabase, requestId, ip }) => {
      if (!emailSendAllowed(data.email, ip, requestId)) {
        warnNeutral("signUp", "RATE_LIMITED", { requestId, ip }, data.email);
        return { email: data.email };
      }
      // Destino pós-confirmação (ex.: convite): só vai ao metadata se for um destino válido.
      const nextPath = safeNextPath(data.next, "");
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            display_name: data.displayName,
            ...(nextPath ? { next_path: nextPath } : {}),
          },
          emailRedirectTo: `${serverEnv.APP_URL}/auth/confirm`,
        },
      });
      // E-mail já cadastrado (e confirmado): o Auth responde 422 user_already_exists.
      // Respondemos igual ao sucesso para não permitir enumeração de contas.
      const alreadyExists =
        error?.code === "user_already_exists" || error?.code === "email_exists";
      if (error && !alreadyExists) {
        // Rate limit também é neutro (SEC-13): um segundo cadastro do mesmo e-mail não pode
        // revelar que a conta existe. O motivo fica só no log.
        if (toAppError(error).code !== "RATE_LIMITED") throw error;
        warnNeutral("signUp", "RATE_LIMITED", { requestId, ip }, data.email);
      }
      return { email: data.email };
    },
  });
}

export async function signIn(
  input: z.input<typeof signInSchema>,
): Promise<ActionResult<never>> {
  return runAction({
    module: "auth",
    operation: "signIn",
    schema: signInSchema,
    input,
    auth: "none",
    identity,
    handler: async (data, { supabase, requestId, ip }) => {
      // Estourou = RATE_LIMITED sem chamar o Auth, igual para e-mail existente ou não.
      const emailKey = emailRateKey(data.email);
      const attempts = hitIpRateLimit("auth_ip", ip, requestId);
      const failures = isIpRateLimited("auth_failure", ip, requestId, emailKey);
      if (!attempts.allowed || !failures.allowed) {
        throw new AppError("RATE_LIMITED");
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (error) {
        // Só falha de credencial conta no par IP + e-mail (não penaliza erro do servidor).
        if (toAppError(error).code === "INVALID_CREDENTIALS") {
          hitIpRateLimit("auth_failure", ip, requestId, emailKey);
        }
        throw error;
      }
      redirect(safeNextPath(data.next));
    },
  });
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    logger.warn({
      requestId: await getRequestId(),
      module: "auth",
      operation: "signOut",
      code: toAppError(error).code,
    });
  }
  redirect("/login");
}

export async function requestPasswordReset(
  input: z.input<typeof requestPasswordResetSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "auth",
    operation: "requestPasswordReset",
    schema: requestPasswordResetSchema,
    input,
    auth: "none",
    identity,
    handler: async (data, { supabase, requestId, ip }) => {
      if (!emailSendAllowed(data.email, ip, requestId)) {
        warnNeutral(
          "requestPasswordReset",
          "RATE_LIMITED",
          { requestId, ip },
          data.email,
        );
        return null;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${serverEnv.APP_URL}/auth/confirm?next=/redefinir-senha`,
      });
      if (error) {
        // Resposta sempre neutra (anti-enumeração, inclusive em rate limit); o motivo fica só no log.
        warnNeutral(
          "requestPasswordReset",
          toAppError(error).code,
          { requestId, ip },
          data.email,
        );
      }
      return null;
    },
  });
}

export async function resendConfirmation(
  input: z.input<typeof resendConfirmationSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "auth",
    operation: "resendConfirmation",
    schema: resendConfirmationSchema,
    input,
    auth: "none",
    identity,
    handler: async (data, { supabase, requestId, ip }) => {
      if (!emailSendAllowed(data.email, ip, requestId)) {
        warnNeutral(
          "resendConfirmation",
          "RATE_LIMITED",
          { requestId, ip },
          data.email,
        );
        return null;
      }
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: data.email,
      });
      if (error) {
        // Sempre neutro, inclusive em rate limit; o código real fica só no log.
        warnNeutral(
          "resendConfirmation",
          toAppError(error).code,
          { requestId, ip },
          data.email,
        );
      }
      return null;
    },
  });
}

export async function updatePassword(
  input: z.input<typeof updatePasswordSchema>,
): Promise<ActionResult<never>> {
  return runAction({
    module: "auth",
    operation: "updatePassword",
    schema: updatePasswordSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });
      if (error) throw error;
      redirect("/inicio");
    },
  });
}
