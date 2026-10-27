import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ISODate } from "@/lib/dates";
import { fromDbNumeric, type Cents } from "@/lib/money";
import { numericParam } from "@/lib/supabase/db-values";
import type { Database } from "@/types/database";
import type { SplitFilter } from "./constants";

type Client = SupabaseClient<Database>;

// Nenhum código do app escreve em `expense_splits`: só leitura aqui; a escrita é a RPC (contrato §0.3).

type MemberEmbed = {
  id: string;
  status?: string;
  joined_at: string;
  profiles: { display_name: string | null } | null;
};

export type SplitPartRow = {
  amount: string;
  member: MemberEmbed | null;
};

export type SharedExpenseRow = {
  id: string;
  description: string;
  amount: string;
  transaction_date: string;
  status: string;
  assigned_member: {
    id: string;
    profiles: { display_name: string | null } | null;
  } | null;
  category: { id: string; name: string; color: string; icon: string } | null;
  parts: SplitPartRow[];
};

const PARTS_EMBED =
  "parts:expense_splits!inner(amount::text, member:family_members!expense_splits_member_fk(id, joined_at, profiles(display_name)))";
const PAYER_EMBED =
  "assigned_member:family_members!transactions_assigned_member_fk(id, profiles(display_name))";
const CATEGORY_EMBED =
  "category:categories!transactions_category_fk(id, name, color, icon)";

const SHARED_COLUMNS = `id, description, amount::text, transaction_date, status, ${PAYER_EMBED}, ${CATEGORY_EMBED}, ${PARTS_EMBED}`;

/** Despesas com divisão, não canceladas nem excluídas; data decrescente. */
export async function selectSharedExpensesPage(
  supabase: Client,
  situacao: SplitFilter,
  page: number,
  size: number,
): Promise<{ rows: SharedExpenseRow[]; total: number }> {
  const run = async (from: number, to: number) => {
    let query = supabase
      .from("transactions")
      .select(SHARED_COLUMNS, { count: "exact" })
      .eq("type", "expense")
      .is("deleted_at", null);
    query =
      situacao === "pendentes"
        ? query.eq("status", "pending")
        : situacao === "pagas"
          ? query.eq("status", "paid")
          : query.in("status", ["pending", "paid"]);
    return query
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
  };

  const first = (page - 1) * size;
  const { data, error, count } = await run(first, first + size - 1);
  if (error) {
    // Página além da última: o PostgREST recusa o intervalo; o total sai de um intervalo mínimo.
    if (error.code === "PGRST103") {
      const probe = await run(0, 0);
      if (probe.error) throw probe.error;
      return { rows: [], total: probe.count ?? 0 };
    }
    throw error;
  }
  return { rows: data as unknown as SharedExpenseRow[], total: count ?? 0 };
}

export type SplitTransactionRow = {
  id: string;
  type: string;
  description: string;
  amount: string;
  transaction_date: string;
  status: string;
  created_by: string;
  reversal_of_id: string | null;
  assigned_member: SharedExpenseRow["assigned_member"];
};

/** `null` para inexistente, de outra família (RLS) ou excluído. */
export async function selectSplitTransaction(
  supabase: Client,
  id: string,
): Promise<SplitTransactionRow | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `id, type, description, amount::text, transaction_date, status, created_by, reversal_of_id, ${PAYER_EMBED}`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as SplitTransactionRow | null;
}

export async function selectSplitParts(
  supabase: Client,
  transactionId: string,
): Promise<SplitPartRow[]> {
  const { data, error } = await supabase
    .from("expense_splits")
    .select(
      "amount::text, member:family_members!expense_splits_member_fk(id, joined_at, profiles(display_name))",
    )
    .eq("transaction_id", transactionId);
  if (error) throw error;
  return data as unknown as SplitPartRow[];
}

/** Todos os vínculos visíveis da família (ativos e ex-integrantes), na ordem `joined_at, id`. */
export async function selectFamilyMembers(
  supabase: Client,
  familyId: string,
): Promise<MemberEmbed[]> {
  const { data, error } = await supabase
    .from("family_members")
    .select("id, status, joined_at, profiles(display_name)")
    .eq("family_id", familyId)
    .order("joined_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data as unknown as MemberEmbed[];
}

export async function rpcSetTransactionSplits(
  supabase: Client,
  input: {
    transactionId: string;
    mode: "equal" | "amounts" | "none";
    shares: { member_id: string; amount?: string }[];
  },
): Promise<void> {
  const { error } = await supabase.rpc("set_transaction_splits", {
    p_transaction_id: input.transactionId,
    p_mode: input.mode,
    p_shares: input.shares,
  });
  if (error) throw error;
}

export async function rpcMemberBalances(
  supabase: Client,
): Promise<{ debtorId: string; creditorId: string; amount: Cents }[]> {
  const { data, error } = await supabase.rpc("member_balances");
  if (error) throw error;
  return data.map((r) => ({
    debtorId: r.debtor_member_id,
    creditorId: r.creditor_member_id,
    amount: fromDbNumeric(r.amount),
  }));
}

// ---- acertos ----

type SettlementMemberEmbed = {
  id: string;
  profiles: { display_name: string | null } | null;
};

export type SettlementRow = {
  id: string;
  amount: string;
  settlement_date: string;
  notes: string | null;
  created_by: string;
  creator: { display_name: string | null } | null;
  from: SettlementMemberEmbed | null;
  to: SettlementMemberEmbed | null;
};

const SETTLEMENT_COLUMNS =
  "id, amount::text, settlement_date, notes, created_by, " +
  "creator:profiles!settlements_created_by_fkey(display_name), " +
  "from:family_members!settlements_from_member_fk(id, profiles(display_name)), " +
  "to:family_members!settlements_to_member_fk(id, profiles(display_name))";

export async function selectSettlementsPage(
  supabase: Client,
  page: number,
  size: number,
): Promise<{ rows: SettlementRow[]; total: number }> {
  const run = (from: number, to: number) =>
    supabase
      .from("settlements")
      .select(SETTLEMENT_COLUMNS, { count: "exact" })
      .is("deleted_at", null)
      .order("settlement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);

  const first = (page - 1) * size;
  const { data, error, count } = await run(first, first + size - 1);
  if (error) {
    if (error.code === "PGRST103") {
      const probe = await run(0, 0);
      if (probe.error) throw probe.error;
      return { rows: [], total: probe.count ?? 0 };
    }
    throw error;
  }
  return { rows: data as unknown as SettlementRow[], total: count ?? 0 };
}

export async function insertSettlement(
  supabase: Client,
  input: {
    familyId: string;
    fromMemberId: string;
    toMemberId: string;
    amount: Cents;
    settlementDate: ISODate;
    notes: string | null;
    idempotencyKey: string;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("settlements")
    .insert({
      family_id: input.familyId,
      from_member_id: input.fromMemberId,
      to_member_id: input.toMemberId,
      amount: numericParam(input.amount),
      settlement_date: input.settlementDate,
      notes: input.notes,
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function selectSettlementIdByIdempotencyKey(
  supabase: Client,
  familyId: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("settlements")
    .select("id")
    .eq("family_id", familyId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Existe e não foi excluído (RLS filtra a família)? */
export async function settlementExists(
  supabase: Client,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("settlements")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Exclusão lógica (o trigger fixa `deleted_at`/`deleted_by`). Devolve as linhas alcançadas. */
export async function softDeleteSettlement(
  supabase: Client,
  id: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("settlements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id");
  if (error) throw error;
  return data.length;
}
