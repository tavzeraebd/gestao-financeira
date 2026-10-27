import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Cents } from "@/lib/money";
import {
  availableCredit,
  consolidatedBalance,
  openCardDebt,
} from "@/modules/accounts/domain/balances";
import {
  selectAccountById,
  selectAccounts,
  selectBalances,
  type AccountBase,
} from "@/modules/accounts/repository";
import type {
  AccountOption,
  AccountsOverview,
  AccountView,
} from "@/modules/accounts/types";
import { requireMembership } from "@/server/auth";
import { AppError } from "@/server/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Agregado acima do inteiro seguro (SEC-18): erro explícito e tratado, não um RangeError cru. */
function asAggregateError(e: unknown): never {
  if (e instanceof RangeError)
    throw new AppError("INTERNAL_ERROR", { cause: e });
  throw e;
}

function toView(
  base: AccountBase,
  balances: ReadonlyMap<string, Cents>,
): AccountView {
  const balance = balances.get(base.id);
  if (balance === undefined) {
    throw new Error("Saldo ausente para conta visível.");
  }
  return {
    ...base,
    balance,
    availableCredit: availableCredit(base.type, base.creditLimit, balance),
  };
}

export async function getAccountsOverview(): Promise<AccountsOverview> {
  await requireMembership();
  const supabase = await createClient();
  const [bases, balances] = await Promise.all([
    selectAccounts(supabase),
    selectBalances(supabase),
  ]).catch(asAggregateError);
  try {
    const accounts = bases.map((b) => toView(b, balances));
    return {
      accounts,
      consolidatedBalance: consolidatedBalance(accounts),
      openCardDebt: openCardDebt(accounts),
    };
  } catch (e) {
    return asAggregateError(e);
  }
}

export async function getAccount(id: string): Promise<AccountView | null> {
  await requireMembership();
  // Id que não é uuid não existe (evita o erro 22P02 do Postgres).
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const [base, balances] = await Promise.all([
    selectAccountById(supabase, id),
    selectBalances(supabase),
  ]).catch(asAggregateError);
  return base ? toView(base, balances) : null;
}

export async function listAccountOptions(): Promise<AccountOption[]> {
  await requireMembership();
  const supabase = await createClient();
  const bases = await selectAccounts(supabase);
  return bases.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    isActive: b.isActive,
  }));
}
