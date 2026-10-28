import "server-only";
import { type ISODate } from "@/lib/dates";
import { fromDbNumeric } from "@/lib/money";
import { dbDate } from "@/lib/supabase/db-values";
import { createClient } from "@/lib/supabase/server";
import {
  toCategoryColor,
  toCategoryIcon,
} from "@/modules/categories/constants";
import { memberDisplayName } from "@/modules/family/domain/member-name";
import {
  canDeleteSettlement,
  canSetSplits,
} from "@/modules/family/permissions";
import type { MemberRef } from "@/modules/goals/types";
import { requireMembership } from "@/server/auth";
import { SETTLEMENTS_PAGE_SIZE } from "./constants";
import { previewEqualSplit } from "./domain/preview";
import {
  rpcMemberBalances,
  selectFamilyMembers,
  selectSettlementsPage,
  selectSharedExpensesPage,
  selectSplitParts,
  selectSplitTransaction,
  type SplitPartRow,
} from "./repository";
import { splitFiltersSchema } from "./schemas";
import type {
  MemberBalances,
  SettlementView,
  SharedExpenseItem,
  SharedExpensesPage,
  SplitDetail,
  SplitPart,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ref(
  m: { id: string; profiles: { display_name: string | null } | null } | null,
): MemberRef | null {
  return m
    ? {
        id: m.id,
        displayName: memberDisplayName(m.profiles?.display_name ?? null),
      }
    : null;
}

/** Partes na ordem `joined_at, id` (a mesma da divisão igual do banco). */
function toParts(rows: SplitPartRow[]): SplitPart[] {
  return rows
    .filter((r) => r.member !== null)
    .sort((a, b) => {
      const x = a.member!;
      const y = b.member!;
      return x.joined_at === y.joined_at
        ? x.id.localeCompare(y.id)
        : x.joined_at.localeCompare(y.joined_at);
    })
    .map((r) => ({
      member: ref(r.member)!,
      amount: fromDbNumeric(r.amount),
    }));
}

export async function listSharedExpenses(
  filters: unknown,
): Promise<SharedExpensesPage> {
  const membership = await requireMembership();
  const supabase = await createClient();
  // O schema é tolerante: passar de novo os filtros já normalizados é idempotente.
  const f = splitFiltersSchema.parse(filters);
  const { rows, total } = await selectSharedExpensesPage(
    supabase,
    f.situacao,
    f.pagina,
    f.por_pagina,
  );
  const items: SharedExpenseItem[] = rows.map((r) => {
    if (!r.category) throw new Error("Despesa dividida sem categoria visível.");
    const parts = toParts(r.parts);
    return {
      id: r.id,
      description: r.description,
      amount: fromDbNumeric(r.amount),
      date: dbDate(r.transaction_date),
      status: r.status === "pending" ? "pending" : "paid",
      payer: ref(r.assigned_member),
      category: {
        id: r.category.id,
        name: r.category.name,
        color: toCategoryColor(r.category.color),
        icon: toCategoryIcon(r.category.icon),
      },
      parts,
      myShare:
        parts.find((p) => p.member.id === membership.memberId)?.amount ?? null,
    };
  });
  return {
    items,
    total,
    page: f.pagina,
    pageSize: f.por_pagina,
    pageCount: Math.max(1, Math.ceil(total / f.por_pagina)),
  };
}

/** `null` para inexistente, de outra família, excluído, transferência ou receita. */
export async function getTransactionSplit(
  transactionId: string,
): Promise<SplitDetail | null> {
  const membership = await requireMembership();
  if (!UUID.test(transactionId)) return null;
  const supabase = await createClient();
  const tx = await selectSplitTransaction(supabase, transactionId);
  if (!tx || tx.type !== "expense") return null;

  const [partRows, members] = await Promise.all([
    selectSplitParts(supabase, transactionId),
    selectFamilyMembers(supabase, membership.familyId),
  ]);
  const parts = toParts(partRows);
  const total = fromDbNumeric(tx.amount);

  let mode: SplitDetail["mode"] = null;
  if (parts.length > 0) {
    const preview = previewEqualSplit(
      total,
      parts.map((p) => p.member.id),
    );
    mode = preview.every((p, i) => p.amount === parts[i]?.amount)
      ? "equal"
      : "amounts";
  }

  const inSplit = new Set(parts.map((p) => p.member.id));
  const candidates = members
    .filter((m) => m.status === "active" || inSplit.has(m.id))
    .map((m) => ({
      id: m.id,
      displayName: memberDisplayName(m.profiles?.display_name ?? null),
      active: m.status === "active",
    }));

  const splittable = tx.status !== "canceled" && tx.reversal_of_id === null;
  return {
    transaction: {
      id: tx.id,
      description: tx.description,
      amount: total,
      status: tx.status,
      date: dbDate(tx.transaction_date) as ISODate,
      payer: ref(tx.assigned_member),
      isPending: tx.status === "pending",
    },
    splittable,
    parts,
    mode,
    candidates,
    canEdit:
      splittable &&
      canSetSplits(membership.role, tx.created_by, membership.userId),
  };
}

export async function getMemberBalances(): Promise<MemberBalances> {
  const membership = await requireMembership();
  const supabase = await createClient();
  const [rows, members] = await Promise.all([
    rpcMemberBalances(supabase),
    selectFamilyMembers(supabase, membership.familyId),
  ]);
  const names = new Map(
    members.map((m) => [
      m.id,
      memberDisplayName(m.profiles?.display_name ?? null),
    ]),
  );
  const toRef = (id: string): MemberRef => ({
    id,
    displayName: names.get(id) ?? memberDisplayName(null),
  });
  return {
    pairs: rows.map((r) => ({
      debtor: toRef(r.debtorId),
      creditor: toRef(r.creditorId),
      amount: r.amount,
    })),
    myMemberId: membership.memberId,
  };
}

export async function listSettlements(
  options: { page?: number } = {},
): Promise<{
  items: SettlementView[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const membership = await requireMembership();
  const supabase = await createClient();
  const page =
    Number.isInteger(options.page) && (options.page ?? 1) >= 1
      ? (options.page as number)
      : 1;
  const { rows, total } = await selectSettlementsPage(
    supabase,
    page,
    SETTLEMENTS_PAGE_SIZE,
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      from: ref(r.from) ?? { id: "", displayName: memberDisplayName(null) },
      to: ref(r.to) ?? { id: "", displayName: memberDisplayName(null) },
      amount: fromDbNumeric(r.amount),
      date: dbDate(r.settlement_date),
      notes: r.notes,
      recordedBy: memberDisplayName(r.creator?.display_name ?? null),
      canDelete: canDeleteSettlement(
        membership.role,
        r.created_by,
        membership.userId,
        membership.memberId,
        r.from?.id ?? "",
        r.to?.id ?? "",
      ),
    })),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / SETTLEMENTS_PAGE_SIZE)),
  };
}
