import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { CategoriesManager } from "@/modules/categories/components/categories-manager";
import { listCategories } from "@/modules/categories/queries";
import { can } from "@/modules/family/permissions";
import { requireMembership } from "@/server/auth";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriesPage() {
  const [membership, categories] = await Promise.all([
    requireMembership(),
    listCategories({ includeArchived: true }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categorias"
        description="Como a família organiza receitas e despesas."
      />
      <CategoriesManager
        categories={categories}
        canManage={can(membership.role, "category.manage")}
      />
    </div>
  );
}
