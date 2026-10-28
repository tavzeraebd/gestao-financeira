import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/server/logger";
import { getRequestId } from "@/server/request-id";
import { rpcRefreshNotifications } from "./repository";

/**
 * Gera as notificações do usuário (RPC `refresh_notifications`, idempotente, até 100 por chamada).
 * Deduplicada por requisição. Falha silenciosa: registra o código e não lança, porque a central e o
 * contador continuam funcionando com o que já existe (ADR-0029).
 */
export const ensureNotificationsRefreshed = cache(async (): Promise<void> => {
  try {
    const supabase = await createClient();
    await rpcRefreshNotifications(supabase);
  } catch (e) {
    const raw =
      typeof e === "object" && e !== null && "code" in e
        ? (e as { code: unknown }).code
        : undefined;
    logger.warn({
      requestId: await getRequestId(),
      module: "notifications",
      operation: "ensureNotificationsRefreshed",
      code: typeof raw === "string" ? raw : "REFRESH_FAILED",
    });
  }
});
