import "server-only";
import { today } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { asCents, type Cents } from "@/lib/money";
import {
  availableCredit,
  consolidatedBalance,
  openCardDebt,
} from "@/modules/accounts/domain/balances";
import {
  selectAccountById,
  selectAccounts,
  selectBalances,
  selectPendingInstallmentRows,
  totalPendingInstallments,
  type AccountBase,
  type PendingInstallmentRow,
} from "@/modules/accounts/repository";
import type {
  AccountOption,
  AccountsOverview,
  AccountView,
} from "@/modules/accounts/types";
import {
  cardInvoices,
  type CardPurchase,
} from "@/modules/reports/domain/card-invoices";
import { selectCardPurchases } from "@/modules/reports/repository";
import { requireMembership } from "@/server/auth";
import { AppError } from "@/server/errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Agregado acima do inteiro seguro (SEC-18): erro explícito e tratado, não um RangeError cru. */
function asAggregateError(e: unknown): never {
  if (e instanceof RangeError)
    throw new AppError("INTERNAL_ERROR", { cause: e });
  throw e;
}

/** Cartão com fechamento e vencimento definidos (os demais não têm fatura). */
function hasInvoiceTerms(base: AccountBase): boolean {
  return (
    base.type === "credit_card" &&
    base.statementClosingDay !== null &&
    base.statementDueDay !== null
  );
}

/** Compras líquidas só dos cartões com dívida (D8); sem dívida não há o que alocar. */
async function loadCardPurchases(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bases: readonly AccountBase[],
  balances: ReadonlyMap<string, Cents>,
  now: ReturnType<typeof today>,
): Promise<CardPurchase[]> {
  const indebted = bases
    .filter((b) => hasInvoiceTerms(b) && (balances.get(b.id) ?? 0) < 0)
    .map((b) => b.id);
  return selectCardPurchases(supabase, indebted, now);
}

function toView(
  base: AccountBase,
  balances: ReadonlyMap<string, Cents>,
  installments: readonly PendingInstallmentRow[],
  pendingInstallments: ReadonlyMap<string, Cents>,
  purchases: readonly CardPurchase[],
  now: ReturnType<typeof today>,
): AccountView {
  const balance = balances.get(base.id);
  if (balance === undefined) {
    throw new Error("Saldo ausente para conta visível.");
  }
  const closingDay = base.statementClosingDay;
  const dueDay = base.statementDueDay;
  return {
    ...base,
    balance,
    availableCredit: availableCredit(
      base.type,
      base.creditLimit,
      balance,
      pendingInstallments.get(base.id),
    ),
    invoices:
      hasInvoiceTerms(base) && closingDay !== null && dueDay !== null
        ? cardInvoices({
            today: now,
            closingDay,
            dueDay,
            debt: balance < 0 ? asCents(-balance) : asCents(0),
            purchases: purchases.filter((p) => p.accountId === base.id),
            pendingInstallments: installments.filter(
              (i) => i.accountId === base.id,
            ),
          })
        : null,
  };
}

export async function getAccountsOverview(): Promise<AccountsOverview> {
  await requireMembership();
  const supabase = await createClient();
  const now = today();
  const [bases, balances, installments] = await Promise.all([
    selectAccounts(supabase),
    selectBalances(supabase),
    selectPendingInstallmentRows(supabase),
  ]).catch(asAggregateError);
  const purchases = await loadCardPurchases(supabase, bases, balances, now);
  try {
    const pending = totalPendingInstallments(installments);
    const accounts = bases.map((b) =>
      toView(b, balances, installments, pending, purchases, now),
    );
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
  const now = today();
  const [base, balances, installments] = await Promise.all([
    selectAccountById(supabase, id),
    selectBalances(supabase),
    selectPendingInstallmentRows(supabase),
  ]).catch(asAggregateError);
  if (!base) return null;
  const purchases = await loadCardPurchases(supabase, [base], balances, now);
  return toView(
    base,
    balances,
    installments,
    totalPendingInstallments(installments),
    purchases,
    now,
  );
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
