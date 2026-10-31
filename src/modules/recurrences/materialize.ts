import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { ensureInstallmentsPosted } from "@/modules/transactions/installments-post";
import { rpcMaterializeRecurrences } from "@/modules/recurrences/repository";
import { logger } from "@/server/logger";
import { getRequestId } from "@/server/request-id";

/**
 * Materializa as próximas ocorrências das séries da família (RPC `materialize_recurrences`,
 * idempotente). Deduplicada por requisição. Falha silenciosa: registra o código e não lança,
 * porque nenhum número realizado depende da materialização (contrato §0.2).
 */
export const ensureRecurrencesMaterialized = cache(async (): Promise<void> => {
  // D23: junto da materialização, lança na fatura as parcelas vencidas (falha silenciosa própria).
  await ensureInstallmentsPosted();
  try {
    const supabase = await createClient();
    await rpcMaterializeRecurrences(supabase);
  } catch (e) {
    const raw =
      typeof e === "object" && e !== null && "code" in e
        ? (e as { code: unknown }).code
        : undefined;
    logger.warn({
      requestId: await getRequestId(),
      module: "recurrences",
      operation: "ensureRecurrencesMaterialized",
      code: typeof raw === "string" ? raw : "MATERIALIZE_FAILED",
    });
  }
});
