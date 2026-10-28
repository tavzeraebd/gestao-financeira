"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import {
  deleteAccountSchema,
  updateProfileSchema,
} from "@/modules/profile/schemas";
import {
  hasPasswordIdentity,
  rpcDeleteMyAccount,
  updateOwnProfile,
} from "@/modules/profile/repository";
import { runAction, type ActionResult } from "@/server/action";
import { AppError, toAppError } from "@/server/errors";
import { logger } from "@/server/logger";
import {
  emailRateKey,
  hitIpRateLimit,
  hitRateLimit,
  isIpRateLimited,
} from "@/server/rate-limit";

export async function updateProfile(
  input: z.input<typeof updateProfileSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "profile",
    operation: "updateProfile",
    schema: updateProfileSchema,
    input,
    auth: "required",
    handler: async (data, { supabase, userId }) => {
      if (!userId) throw new AppError("UNAUTHENTICATED");
      // Só a própria linha: filtro por id + RLS (profiles_update_self).
      const updated = await updateOwnProfile(
        supabase,
        userId,
        data.displayName,
      );
      if (!updated) throw new AppError("NOT_FOUND");
      revalidatePath("/", "layout");
      return null;
    },
  });
}

/**
 * Exclui a PRÓPRIA conta (ADR-0038). O servidor não confia no cliente: a senha é conferida aqui com
 * `signInWithPassword` no e-mail do usuário autenticado (a sessão nova traz o `amr` fresco que a
 * RPC exige) e a RPC roda com a sessão do usuário, nunca com `service_role`. O papel, a família e a
 * regra do último owner são decididos no banco; nada disso vem da entrada.
 */
export async function deleteAccount(
  input: z.input<typeof deleteAccountSchema>,
): Promise<ActionResult<never>> {
  return runAction({
    module: "account",
    operation: "deleteAccount",
    schema: deleteAccountSchema,
    input,
    auth: "required",
    handler: async (data, { supabase, userId, requestId, ip }) => {
      if (!userId) throw new AppError("UNAUTHENTICATED");

      // Operação irreversível: 3 por hora por usuário, ANTES de qualquer reautenticação.
      if (!hitRateLimit("account_deletion", userId).allowed) {
        throw new AppError("RATE_LIMITED");
      }

      const { data: current, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const email = current.user?.email;
      // Conta sem identidade de senha (ex.: OAuth futuro): sem como reautenticar; nada é alterado.
      if (!email || !hasPasswordIdentity(current.user?.identities)) {
        throw new AppError("ACCOUNT_ERASURE_UNAVAILABLE");
      }

      // A conferência de senha é um oráculo: divide os baldes do login (IP e IP+e-mail).
      const emailKey = emailRateKey(email);
      const attempts = hitIpRateLimit("auth_ip", ip, requestId);
      const failures = isIpRateLimited("auth_failure", ip, requestId, emailKey);
      if (!attempts.allowed || !failures.allowed) {
        throw new AppError("RATE_LIMITED");
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: data.password,
      });
      if (signInError) {
        if (toAppError(signInError).code === "INVALID_CREDENTIALS") {
          hitIpRateLimit("auth_failure", ip, requestId, emailKey);
        }
        throw signInError;
      }

      await rpcDeleteMyAccount(supabase);

      // Sem `familyId` no log: após a exclusão a família pode nem existir mais.
      logger.info({
        requestId,
        module: "account",
        operation: "deleteAccount",
        code: "OK",
        userId,
      });

      // Tolerante: as sessões já foram removidas no banco; falhar aqui não pode impedir o redirect.
      try {
        const { error } = await supabase.auth.signOut({ scope: "global" });
        if (error) throw error;
      } catch (e) {
        logger.warn({
          requestId,
          module: "account",
          operation: "deleteAccount",
          code: `SIGN_OUT_${toAppError(e).code}`,
          userId,
        });
      }
      redirect("/login?conta=excluida");
    },
  });
}
