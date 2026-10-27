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
import { toAppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { getRequestId } from "@/server/request-id";

export async function signUp(
  input: z.input<typeof signUpSchema>,
): Promise<ActionResult<{ email: string }>> {
  return runAction({
    module: "auth",
    operation: "signUp",
    schema: signUpSchema,
    input,
    auth: "none",
    handler: async (data, { supabase, requestId }) => {
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
        logger.warn({
          requestId,
          module: "auth",
          operation: "signUp",
          code: "RATE_LIMITED",
        });
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
    handler: async (data, { supabase }) => {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });
      if (error) throw error;
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
    handler: async (data, { supabase, requestId }) => {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${serverEnv.APP_URL}/auth/confirm?next=/redefinir-senha`,
      });
      if (error) {
        // Resposta sempre neutra (anti-enumeração, inclusive em rate limit); o motivo fica só no log.
        logger.warn({
          requestId,
          module: "auth",
          operation: "requestPasswordReset",
          code: toAppError(error).code,
        });
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
    handler: async (data, { supabase, requestId }) => {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: data.email,
      });
      if (error) {
        // Sempre neutro, inclusive em rate limit; o código real fica só no log.
        logger.warn({
          requestId,
          module: "auth",
          operation: "resendConfirmation",
          code: toAppError(error).code,
        });
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
