"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {
  categoryIdSchema,
  createCategorySchema,
  updateCategorySchema,
} from "@/modules/categories/schemas";
import {
  archiveCategory as archiveCategoryService,
  createCategory as createCategoryService,
  deleteCategory as deleteCategoryService,
  unarchiveCategory as unarchiveCategoryService,
  updateCategory as updateCategoryService,
} from "@/modules/categories/service";
import { runAction, type ActionResult } from "@/server/action";
import { requireMembership } from "@/server/auth";

// Nenhuma action recebe family_id: a família vem de requireMembership() (ADR-0008).

function revalidateCategories(): void {
  revalidatePath("/categorias", "layout");
  revalidatePath("/transacoes", "layout");
}

export async function createCategory(
  input: z.input<typeof createCategorySchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction({
    module: "categories",
    operation: "createCategory",
    schema: createCategorySchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      const membership = await requireMembership();
      const id = await createCategoryService(supabase, membership, data);
      revalidateCategories();
      return { id };
    },
  });
}

export async function updateCategory(
  input: z.input<typeof updateCategorySchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "categories",
    operation: "updateCategory",
    schema: updateCategorySchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await updateCategoryService(supabase, data);
      revalidateCategories();
      return null;
    },
  });
}

export async function archiveCategory(
  input: z.input<typeof categoryIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "categories",
    operation: "archiveCategory",
    schema: categoryIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await archiveCategoryService(supabase, data.categoryId);
      revalidateCategories();
      return null;
    },
  });
}

export async function unarchiveCategory(
  input: z.input<typeof categoryIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "categories",
    operation: "unarchiveCategory",
    schema: categoryIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await unarchiveCategoryService(supabase, data.categoryId);
      revalidateCategories();
      return null;
    },
  });
}

export async function deleteCategory(
  input: z.input<typeof categoryIdSchema>,
): Promise<ActionResult<null>> {
  return runAction({
    module: "categories",
    operation: "deleteCategory",
    schema: categoryIdSchema,
    input,
    auth: "required",
    handler: async (data, { supabase }) => {
      await requireMembership();
      await deleteCategoryService(supabase, data.categoryId);
      revalidateCategories();
      return null;
    },
  });
}
