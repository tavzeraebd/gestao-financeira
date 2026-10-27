import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbNumeric, type Cents } from "@/lib/money";
import { dbDate, numericParam } from "@/lib/supabase/db-values";
import { toAccountType } from "@/modules/accounts/constants";
import type { AccountView } from "@/modules/accounts/types";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/** Montantes só com `::text` (contrato §3.2). */
const COLUMNS =
  "id, name, type, institution_name, is_active, opening_balance::text, opening_balance_date, credit_limit::text, statement_closing_day, statement_due_day";

export type AccountBase = Omit<AccountView, "balance" | "availableCredit">;

function toBase(row: {
  id: string;
  name: string;
  type: string;
  institution_name: string | null;
  is_active: boolean;
  opening_balance: string;
  opening_balance_date: string;
  credit_limit: string | null;
  statement_closing_day: number | null;
  statement_due_day: number | null;
}): AccountBase {
  return {
    id: row.id,
    name: row.name,
    type: toAccountType(row.type),
    institutionName: row.institution_name,
    isActive: row.is_active,
    openingBalance: fromDbNumeric(row.opening_balance),
    openingBalanceDate: dbDate(row.opening_balance_date),
    creditLimit:
      row.credit_limit === null ? null : fromDbNumeric(row.credit_limit),
    statementClosingDay: row.statement_closing_day,
    statementDueDay: row.statement_due_day,
  };
}

export async function selectAccounts(supabase: Client): Promise<AccountBase[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select(COLUMNS)
    .order("name", { ascending: true });
  if (error) throw error;
  return data.map(toBase);
}

export async function selectAccountById(
  supabase: Client,
  id: string,
): Promise<AccountBase | null> {
  const { data, error } = await supabase
    .from("accounts")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toBase(data) : null;
}

/** D1 para todas as contas visíveis (função `account_balances`, saldo em `text`). */
export async function selectBalances(
  supabase: Client,
): Promise<Map<string, Cents>> {
  const { data, error } = await supabase.rpc("account_balances", {});
  if (error) throw error;
  return new Map(data.map((r) => [r.account_id, fromDbNumeric(r.balance)]));
}

export type AccountWrite = {
  name: string;
  institutionName: string | null;
  openingBalance: Cents;
  openingBalanceDate: string;
  creditLimit: Cents | null;
  statementClosingDay: number | null;
  statementDueDay: number | null;
};

function toColumns(input: AccountWrite) {
  return {
    name: input.name,
    institution_name: input.institutionName,
    opening_balance: numericParam(input.openingBalance),
    opening_balance_date: input.openingBalanceDate,
    credit_limit:
      input.creditLimit === null ? null : numericParam(input.creditLimit),
    statement_closing_day: input.statementClosingDay,
    statement_due_day: input.statementDueDay,
  };
}

export async function insertAccount(
  supabase: Client,
  input: AccountWrite & { familyId: string; type: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      ...toColumns(input),
      family_id: input.familyId,
      type: input.type,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Devolve quantas linhas o update alcançou (0 = a RLS negou). */
export async function updateAccountRow(
  supabase: Client,
  id: string,
  input: AccountWrite,
): Promise<number> {
  const { data, error } = await supabase
    .from("accounts")
    .update(toColumns(input))
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}

export async function setAccountActive(
  supabase: Client,
  id: string,
  isActive: boolean,
): Promise<number> {
  const { data, error } = await supabase
    .from("accounts")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}
