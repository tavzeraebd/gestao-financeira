import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CategoryType } from "@/modules/categories/constants";
import { selectCategories } from "@/modules/categories/repository";
import type { CategoryOption, CategoryView } from "@/modules/categories/types";
import { requireMembership } from "@/server/auth";

export async function listCategories(
  opts: { includeArchived?: boolean } = {},
): Promise<CategoryView[]> {
  await requireMembership();
  const supabase = await createClient();
  return selectCategories(supabase, {
    includeArchived: opts.includeArchived ?? false,
  });
}

/** Ativas do tipo, cada pai seguido das suas filhas (ambos por nome). */
export async function listCategoryOptions(
  type: CategoryType,
): Promise<CategoryOption[]> {
  await requireMembership();
  const supabase = await createClient();
  const all = await selectCategories(supabase, {
    includeArchived: false,
    type,
  });
  const toOption = (c: CategoryView): CategoryOption => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    color: c.color,
    icon: c.icon,
  });
  const ids = new Set(all.map((c) => c.id));
  // Filha cujo pai não está na lista (pai arquivado) não some: vai junto dos pais.
  const parents = all.filter(
    (c) => c.parentId === null || !ids.has(c.parentId),
  );
  return parents.flatMap((p) => [
    toOption(p),
    ...all.filter((c) => c.parentId === p.id).map(toOption),
  ]);
}
