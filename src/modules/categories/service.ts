import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  deleteCategoryRow,
  insertCategory,
  selectCategoryById,
  updateCategoryRow,
} from "@/modules/categories/repository";
import type {
  createCategorySchema,
  updateCategorySchema,
} from "@/modules/categories/schemas";
import type { Membership } from "@/modules/family/types";
import { AppError, isConstraintViolation } from "@/server/errors";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

const NAME_KEY = "categories_family_name_active_key";

function translateName(e: unknown): unknown {
  return isConstraintViolation(e, "23505", NAME_KEY)
    ? new AppError("NAME_TAKEN", { cause: e })
    : e;
}

async function requireVisible(supabase: Client, id: string) {
  const current = await selectCategoryById(supabase, id);
  if (!current) throw new AppError("NOT_FOUND");
  return current;
}

/** O update de uma linha visível que não alcança nenhuma linha é a RLS negando (member). */
function requireUpdated(count: number): void {
  if (count === 0) throw new AppError("FORBIDDEN");
}

export async function createCategory(
  supabase: Client,
  membership: Membership,
  data: z.output<typeof createCategorySchema>,
): Promise<string> {
  try {
    return await insertCategory(supabase, {
      familyId: membership.familyId,
      name: data.name,
      type: data.type,
      color: data.color,
      icon: data.icon,
      parentId: data.parentId ?? null,
    });
  } catch (e) {
    throw translateName(e);
  }
}

export async function updateCategory(
  supabase: Client,
  data: z.output<typeof updateCategorySchema>,
): Promise<void> {
  await requireVisible(supabase, data.categoryId);
  try {
    requireUpdated(
      await updateCategoryRow(supabase, data.categoryId, {
        name: data.name,
        color: data.color,
        icon: data.icon,
        parent_id: data.parentId,
      }),
    );
  } catch (e) {
    throw translateName(e);
  }
}

/** Idempotente: arquivar uma categoria já arquivada preserva a data original. */
export async function archiveCategory(
  supabase: Client,
  categoryId: string,
): Promise<void> {
  const current = await requireVisible(supabase, categoryId);
  requireUpdated(
    await updateCategoryRow(supabase, categoryId, {
      archived_at: current.archivedAt ?? new Date().toISOString(),
    }),
  );
}

export async function unarchiveCategory(
  supabase: Client,
  categoryId: string,
): Promise<void> {
  await requireVisible(supabase, categoryId);
  try {
    requireUpdated(
      await updateCategoryRow(supabase, categoryId, { archived_at: null }),
    );
  } catch (e) {
    throw translateName(e);
  }
}

export async function deleteCategory(
  supabase: Client,
  categoryId: string,
): Promise<void> {
  await requireVisible(supabase, categoryId);
  try {
    requireUpdated(await deleteCategoryRow(supabase, categoryId));
  } catch (e) {
    // Categoria referenciada por lançamento (inclusive excluído) ou por subcategoria.
    if (isConstraintViolation(e, "23503")) {
      throw new AppError("CATEGORY_IN_USE", { cause: e });
    }
    throw e;
  }
}
