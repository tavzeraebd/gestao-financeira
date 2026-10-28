import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, type ISODate } from "@/lib/dates";
import type { Database } from "@/types/database";
import type { AuditAction } from "./constants";
import type { AuditEventRow } from "./types";

type Client = SupabaseClient<Database>;

const COLUMNS =
  "id, created_at, actor_user_id, action, entity_type, entity_id, metadata, " +
  "actor:profiles!audit_events_actor_user_id_fkey(display_name)";

type DbRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  actor: { display_name: string | null } | null;
};

/** America/Sao_Paulo não tem horário de verão desde 2019: o dia civil começa à meia-noite de -03:00. */
const DAY_START = "T00:00:00-03:00";

function toRow(row: DbRow): AuditEventRow {
  return {
    id: row.id,
    createdAt: row.created_at,
    actorUserId: row.actor_user_id,
    actorName: row.actor?.display_name ?? null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
  };
}

/**
 * Página de `audit_events` (RLS: só owner/admin da família). O grupo vira lista exata de ações do catálogo
 * (`in`), nunca `like` com texto vindo da URL.
 */
export async function selectAuditPage(
  supabase: Client,
  opts: {
    actions: readonly AuditAction[] | null;
    de?: ISODate;
    ate?: ISODate;
    page: number;
    size: number;
  },
): Promise<{ items: AuditEventRow[]; total: number }> {
  const run = (from: number, to: number) => {
    let query = supabase
      .from("audit_events")
      .select(COLUMNS, { count: "exact" });
    if (opts.actions) query = query.in("action", [...opts.actions]);
    if (opts.de) query = query.gte("created_at", `${opts.de}${DAY_START}`);
    if (opts.ate) {
      query = query.lt("created_at", `${addDays(opts.ate, 1)}${DAY_START}`);
    }
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);
  };

  const first = (opts.page - 1) * opts.size;
  const { data, error, count } = await run(first, first + opts.size - 1);
  if (error) {
    // Página além da última: o PostgREST recusa o intervalo; o total sai de um intervalo mínimo.
    if (error.code === "PGRST103") {
      const probe = await run(0, 0);
      if (probe.error) throw probe.error;
      return { items: [], total: probe.count ?? 0 };
    }
    throw error;
  }
  return { items: (data as unknown as DbRow[]).map(toRow), total: count ?? 0 };
}

/** Nomes por vínculo (`family_members.id`) numa única consulta; perfil ilegível vem `null`. */
export async function selectMemberNames(
  supabase: Client,
  memberIds: readonly string[],
): Promise<Map<string, string | null>> {
  if (memberIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("family_members")
    .select("id, profiles(display_name)")
    .in("id", [...memberIds]);
  if (error) throw error;
  const rows = data as unknown as {
    id: string;
    profiles: { display_name: string | null } | null;
  }[];
  return new Map(rows.map((r) => [r.id, r.profiles?.display_name ?? null]));
}
