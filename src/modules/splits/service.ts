import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { toDbNumeric } from "@/lib/money";
import type { Membership } from "@/modules/family/types";
import { AppError, isConstraintViolation, toAppError } from "@/server/errors";
import type { Database } from "@/types/database";
import {
  insertSettlement,
  rpcSetTransactionSplits,
  selectSettlementIdByIdempotencyKey,
  settlementExists,
  softDeleteSettlement,
} from "./repository";
import type { setSplitSchema, settlementSchema } from "./schemas";

type Client = SupabaseClient<Database>;

const SETTLEMENT_KEY = "settlements_family_idempotency_key";

/**
 * Divide, refaz ou remove a divisão (RPC `set_transaction_splits`: lock, autorização, integrantes, D13 ou
 * soma exata). Valor menor que o nº de partes em centavos geraria parcela 0,00 (`23514`): vira erro de
 * validação claro no campo, não `INTERNAL_ERROR`.
 */
export async function setTransactionSplits(
  supabase: Client,
  data: z.output<typeof setSplitSchema>,
): Promise<void> {
  const shares =
    data.mode === "equal"
      ? data.memberIds.map((member_id) => ({ member_id }))
      : data.mode === "amounts"
        ? data.shares.map((s) => ({
            member_id: s.memberId,
            amount: toDbNumeric(s.amount),
          }))
        : [];
  try {
    await rpcSetTransactionSplits(supabase, {
      transactionId: data.transactionId,
      mode: data.mode,
      shares,
    });
  } catch (e) {
    if (isConstraintViolation(e, "23514", "expense_splits")) {
      throw new AppError("VALIDATION_ERROR", {
        cause: e,
        fieldErrors: {
          [data.mode === "equal" ? "memberIds" : "shares"]: [
            "O valor da despesa é pequeno demais para dividir entre tantos integrantes. Escolha menos integrantes.",
          ],
        },
      });
    }
    throw e;
  }
}

export async function createSettlement(
  supabase: Client,
  membership: Membership,
  data: z.output<typeof settlementSchema>,
): Promise<{ id: string }> {
  try {
    const id = await insertSettlement(supabase, {
      familyId: membership.familyId,
      fromMemberId: data.fromMemberId,
      toMemberId: data.toMemberId,
      amount: data.amount,
      settlementDate: data.settlementDate,
      notes: data.notes ?? null,
      idempotencyKey: data.idempotencyKey,
    });
    return { id };
  } catch (e) {
    if (isConstraintViolation(e, "23505", SETTLEMENT_KEY)) {
      const existing = await selectSettlementIdByIdempotencyKey(
        supabase,
        membership.familyId,
        data.idempotencyKey,
      );
      if (existing) return { id: existing };
    }
    const app = toAppError(e);
    if (app.code === "FUTURE_DATE_NOT_ALLOWED") {
      throw new AppError(app.code, {
        cause: e,
        fieldErrors: { settlementDate: [app.message] },
      });
    }
    throw e;
  }
}

export async function deleteSettlement(
  supabase: Client,
  settlementId: string,
): Promise<void> {
  const updated = await softDeleteSettlement(supabase, settlementId);
  if (updated > 0) return;
  // 0 linhas: visível e não excluído → a RLS negou (não é autor/owner/admin); senão não existe para o chamador.
  throw new AppError(
    (await settlementExists(supabase, settlementId)) ? "FORBIDDEN" : "NOT_FOUND",
  );
}
