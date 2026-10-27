import { randomUUID } from "node:crypto";
import { actAs, type TestUser } from "./session";

// Os arquivos de teste mockam `@/lib/supabase/server` e `next/cache` antes de importar isto.
import { createAccount } from "@/modules/accounts/actions";
import { listCategories } from "@/modules/categories/queries";
import { createTransaction } from "@/modules/transactions/actions";

export const OPENING_DATE = "2026-01-01";

export async function mkAccount(
  user: TestUser,
  name: string,
  over: Partial<Parameters<typeof createAccount>[0]> = {},
): Promise<string> {
  actAs(user);
  const result = await createAccount({
    name,
    type: "checking",
    openingBalance: "0,00",
    openingBalanceDate: OPENING_DATE,
    ...over,
  });
  if (!result.ok) throw new Error(`createAccount falhou: ${result.error.code}`);
  return result.data.id;
}

/** Id de uma categoria padrão (seed) pelo nome e tipo. */
export async function defaultCategoryId(
  user: TestUser,
  type: "income" | "expense",
  name: string,
): Promise<string> {
  actAs(user);
  const found = (await listCategories()).find(
    (c) => c.type === type && c.name === name && c.parentId === null,
  );
  if (!found) throw new Error(`categoria padrão ausente: ${name}`);
  return found.id;
}

export type NewTx = {
  type?: "income" | "expense";
  description?: string;
  amount: string;
  transactionDate: string;
  accountId: string;
  categoryId: string;
  assignedMemberId?: string;
  notes?: string;
};

export async function mkTx(user: TestUser, tx: NewTx): Promise<string> {
  actAs(user);
  const result = await createTransaction({
    type: tx.type ?? "expense",
    description: tx.description ?? "Lançamento de teste",
    idempotencyKey: randomUUID(),
    ...tx,
  });
  if (!result.ok) {
    throw new Error(`createTransaction falhou: ${result.error.code}`);
  }
  return result.data.id;
}
