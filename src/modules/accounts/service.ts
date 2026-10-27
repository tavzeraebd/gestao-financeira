import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { negCents } from "@/lib/money";
import {
  insertAccount,
  selectAccountById,
  setAccountActive,
  updateAccountRow,
} from "@/modules/accounts/repository";
import type {
  createAccountSchema,
  updateAccountSchema,
} from "@/modules/accounts/schemas";
import type { Membership } from "@/modules/family/types";
import { AppError, isConstraintViolation } from "@/server/errors";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

const NAME_KEY = "accounts_family_name_active_key";

function translate(e: unknown): unknown {
  return isConstraintViolation(e, "23505", NAME_KEY)
    ? new AppError("NAME_TAKEN", { cause: e })
    : e;
}

export async function createAccount(
  supabase: Client,
  membership: Membership,
  data: z.output<typeof createAccountSchema>,
): Promise<string> {
  try {
    return await insertAccount(supabase, {
      familyId: membership.familyId,
      type: data.type,
      name: data.name,
      institutionName: data.institutionName ?? null,
      openingBalance: data.openingBalance,
      openingBalanceDate: data.openingBalanceDate,
      creditLimit: data.creditLimit ?? null,
      statementClosingDay: data.statementClosingDay ?? null,
      statementDueDay: data.statementDueDay ?? null,
    });
  } catch (e) {
    throw translate(e);
  }
}

export async function updateAccount(
  supabase: Client,
  data: z.output<typeof updateAccountSchema>,
): Promise<void> {
  const current = await selectAccountById(supabase, data.accountId);
  if (!current) throw new AppError("NOT_FOUND");

  const isCard = current.type === "credit_card";
  if (isCard) {
    // Cartão: o formulário informa a dívida como valor positivo; o banco guarda `<= 0`.
    const errors: Record<string, string[]> = {};
    if (data.openingBalance < 0) {
      errors.openingBalance = ["Informe a fatura atual como valor positivo."];
    }
    if (data.statementClosingDay === undefined) {
      errors.statementClosingDay = ["Informe o dia de fechamento da fatura."];
    }
    if (data.statementDueDay === undefined) {
      errors.statementDueDay = ["Informe o dia de vencimento da fatura."];
    }
    if (Object.keys(errors).length > 0) {
      throw new AppError("VALIDATION_ERROR", { fieldErrors: errors });
    }
  }

  let updated: number;
  try {
    updated = await updateAccountRow(supabase, data.accountId, {
      name: data.name,
      institutionName: data.institutionName ?? null,
      openingBalance: isCard
        ? negCents(data.openingBalance)
        : data.openingBalance,
      openingBalanceDate: data.openingBalanceDate,
      creditLimit: isCard ? (data.creditLimit ?? null) : null,
      statementClosingDay: isCard ? (data.statementClosingDay ?? null) : null,
      statementDueDay: isCard ? (data.statementDueDay ?? null) : null,
    });
  } catch (e) {
    throw translate(e);
  }
  // A conta é visível, mas o update não alcançou nenhuma linha: a RLS negou (member).
  if (updated === 0) throw new AppError("FORBIDDEN");
}

/** Idempotente: repetir o mesmo estado é sucesso. */
export async function setActive(
  supabase: Client,
  accountId: string,
  isActive: boolean,
): Promise<void> {
  const current = await selectAccountById(supabase, accountId);
  if (!current) throw new AppError("NOT_FOUND");
  let updated: number;
  try {
    updated = await setAccountActive(supabase, accountId, isActive);
  } catch (e) {
    throw translate(e);
  }
  if (updated === 0) throw new AppError("FORBIDDEN");
}
