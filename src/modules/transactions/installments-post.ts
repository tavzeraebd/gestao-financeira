import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { rpcPostDueInstallments } from "@/modules/transactions/repository";
import { logger } from "@/server/logger";
import { getRequestId } from "@/server/request-id";

/**
 * D23: lança na fatura as parcelas cuja data chegou (RPC `post_due_installments`, idempotente,
 * até 500 por chamada). Deduplicada por requisição. Falha silenciosa: registra o código e não
 * lança, porque a parcela fica pendente e é tentada na próxima requisição.
 */
export const ensureInstallmentsPosted = cache(async (): Promise<void> => {
  try {
    const supabase = await createClient();
    await rpcPostDueInstallments(supabase);
  } catch (e) {
    const raw =
      typeof e === "object" && e !== null && "code" in e
        ? (e as { code: unknown }).code
        : undefined;
    logger.warn({
      requestId: await getRequestId(),
      module: "transactions",
      operation: "ensureInstallmentsPosted",
      code: typeof raw === "string" ? raw : "POST_INSTALLMENTS_FAILED",
    });
  }
});
