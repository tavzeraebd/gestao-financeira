import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { NotificationType } from "./constants";
import type { NotificationRow } from "./types";

type Client = SupabaseClient<Database>;

const COLUMNS = "id, type, entity_type, entity_id, data, created_at, read_at";

type DbRow = {
  id: string;
  type: string;
  entity_type: string;
  entity_id: string;
  data: unknown;
  created_at: string;
  read_at: string | null;
};

function toRow(row: DbRow): NotificationRow {
  return {
    id: row.id,
    type: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    data: row.data,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

/** `refresh_notifications()`: quantas criou. Sem parâmetros: usuário e família vêm do banco. */
export async function rpcRefreshNotifications(
  supabase: Client,
): Promise<number> {
  const { data, error } = await supabase.rpc("refresh_notifications");
  if (error) throw error;
  return data;
}

/** Página (mais recentes primeiro) dos tipos pedidos; a RLS restringe ao próprio usuário. */
export async function selectNotificationPage(
  supabase: Client,
  types: readonly NotificationType[],
  page: number,
  size: number,
): Promise<{ items: NotificationRow[]; total: number }> {
  const run = (from: number, to: number) =>
    supabase
      .from("notifications")
      .select(COLUMNS, { count: "exact" })
      .in("type", [...types])
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to);

  const first = (page - 1) * size;
  const { data, error, count } = await run(first, first + size - 1);
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

/** Não lidas do usuário (count `head`, com RLS). */
export async function countUnreadNotifications(
  supabase: Client,
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Marca como lida e devolve a linha; `null` = a RLS não alcançou (inexistente ou alheia, sem distinção).
 * O trigger mantém `read_at` já preenchido: repetir é inofensivo.
 */
export async function markNotificationRead(
  supabase: Client,
  id: string,
): Promise<NotificationRow | null> {
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLUMNS);
  if (error) throw error;
  const row = (data as unknown as DbRow[])[0];
  return row ? toRow(row) : null;
}

/** Marca todas as não lidas do usuário; devolve quantas. */
export async function markAllNotificationsReadRows(
  supabase: Client,
): Promise<number> {
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .select("id");
  if (error) throw error;
  return data.length;
}
