import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  toCategoryColor,
  toCategoryIcon,
  type CategoryType,
} from "@/modules/categories/constants";
import type { CategoryView } from "@/modules/categories/types";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

const COLUMNS =
  "id, name, type, color, icon, parent_id, is_default, archived_at";

function toType(value: string): CategoryType {
  if (value !== "income" && value !== "expense") {
    throw new Error("Tipo de categoria desconhecido no banco.");
  }
  return value;
}

function toView(row: {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  parent_id: string | null;
  is_default: boolean;
  archived_at: string | null;
}): CategoryView {
  return {
    id: row.id,
    name: row.name,
    type: toType(row.type),
    color: toCategoryColor(row.color),
    icon: toCategoryIcon(row.icon),
    parentId: row.parent_id,
    isDefault: row.is_default,
    archivedAt: row.archived_at,
  };
}

export async function selectCategories(
  supabase: Client,
  opts: { includeArchived: boolean; type?: CategoryType },
): Promise<CategoryView[]> {
  let query = supabase.from("categories").select(COLUMNS);
  if (!opts.includeArchived) query = query.is("archived_at", null);
  if (opts.type) query = query.eq("type", opts.type);
  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw error;
  return data.map(toView);
}

export async function selectCategoryById(
  supabase: Client,
  id: string,
): Promise<CategoryView | null> {
  const { data, error } = await supabase
    .from("categories")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toView(data) : null;
}

export async function insertCategory(
  supabase: Client,
  input: {
    familyId: string;
    name: string;
    type: CategoryType;
    color: string;
    icon: string;
    parentId: string | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from("categories")
    .insert({
      family_id: input.familyId,
      name: input.name,
      type: input.type,
      color: input.color,
      icon: input.icon,
      parent_id: input.parentId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Devolve quantas linhas o update alcançou (0 = a RLS negou). */
export async function updateCategoryRow(
  supabase: Client,
  id: string,
  patch: {
    name?: string;
    color?: string;
    icon?: string;
    parent_id?: string | null;
    archived_at?: string | null;
  },
): Promise<number> {
  const { data, error } = await supabase
    .from("categories")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}

export async function deleteCategoryRow(
  supabase: Client,
  id: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return data.length;
}
