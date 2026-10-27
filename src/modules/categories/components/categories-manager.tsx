"use client";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  TagsIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CategoryIcon } from "@/components/shared/category-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/shared/segmented-control";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  safeAction,
  useSessionExpiredRedirect,
} from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  archiveCategory,
  deleteCategory,
  unarchiveCategory,
} from "@/modules/categories/actions";
import { CategoryFormDialog } from "@/modules/categories/components/category-form-dialog";
import type { CategoryType } from "@/modules/categories/constants";
import type { CategoryView } from "@/modules/categories/types";

type CategoriesManagerProps = {
  categories: CategoryView[];
  canManage: boolean;
};

type StatusFilter = "active" | "archived";

export function CategoriesManager({
  categories,
  canManage,
}: CategoriesManagerProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const sessionExpired = useSessionExpiredRedirect();
  const [type, setType] = useState<CategoryType>("expense");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryView | null>(null);
  const [toDelete, setToDelete] = useState<CategoryView | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = categories.filter(
    (c) =>
      c.type === type && (status === "archived") === (c.archivedAt !== null),
  );
  const visibleIds = new Set(visible.map((c) => c.id));
  const roots = visible.filter(
    (c) => !c.parentId || !visibleIds.has(c.parentId),
  );
  const childrenOf = (id: string) => visible.filter((c) => c.parentId === id);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(category: CategoryView) {
    setEditing(category);
    setFormOpen(true);
  }

  function changeStatus(category: CategoryView, kind: "archive" | "unarchive") {
    startTransition(async () => {
      const result = await safeAction(() =>
        kind === "archive"
          ? archiveCategory({ categoryId: category.id })
          : unarchiveCategory({ categoryId: category.id }),
      );
      if (result.ok) {
        toast.success(
          kind === "archive" ? "Categoria arquivada" : "Categoria reativada",
        );
        router.refresh();
        return;
      }
      if (!sessionExpired(result.error)) toast.error(result.error.message);
    });
  }

  function confirmDelete() {
    const category = toDelete;
    if (!category) return;
    startTransition(async () => {
      const result = await safeAction(() =>
        deleteCategory({ categoryId: category.id }),
      );
      if (result.ok) {
        toast.success("Categoria excluída");
        setToDelete(null);
        router.refresh();
        return;
      }
      if (sessionExpired(result.error)) return;
      toast.error(
        result.error.code === "CATEGORY_IN_USE"
          ? "Esta categoria tem lançamentos. Arquive-a para escondê-la dos formulários."
          : result.error.message,
      );
      setToDelete(null);
    });
  }

  function renderRow(category: CategoryView, nested: boolean) {
    return (
      <li
        key={category.id}
        className={nested ? "ml-8 md:ml-10" : undefined}
        data-testid="categoria"
      >
        <div className="flex min-h-14 items-center gap-3 py-2">
          <CategoryIcon icon={category.icon} color={category.color} />
          <p className="min-w-0 flex-1 text-sm font-medium break-words">
            {category.name}
            {category.isDefault ? (
              <Badge variant="secondary" className="ml-2 align-middle">
                Padrão
              </Badge>
            ) : null}
          </p>
          {canManage ? (
            <div className="flex shrink-0 items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Editar ${category.name}`}
                disabled={!hydrated}
                onClick={() => openEdit(category)}
              >
                <PencilIcon aria-hidden="true" />
              </Button>
              {category.archivedAt ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Reativar ${category.name}`}
                  disabled={!hydrated || pending}
                  onClick={() => changeStatus(category, "unarchive")}
                >
                  <ArchiveRestoreIcon aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Arquivar ${category.name}`}
                  disabled={!hydrated || pending}
                  onClick={() => changeStatus(category, "archive")}
                >
                  <ArchiveIcon aria-hidden="true" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Excluir ${category.name}`}
                disabled={!hydrated}
                onClick={() => setToDelete(category)}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={type} onValueChange={(v) => setType(v as CategoryType)}>
          <TabsList
            aria-label="Tipo de categoria"
            className="group-data-horizontal/tabs:h-12"
          >
            <TabsTrigger value="expense" className="px-4">
              Despesas
            </TabsTrigger>
            <TabsTrigger value="income" className="px-4">
              Receitas
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="sm:w-64">
          <SegmentedControl<StatusFilter>
            aria-label="Situação das categorias"
            value={status}
            onValueChange={setStatus}
            options={[
              { value: "active", label: "Ativas" },
              { value: "archived", label: "Arquivadas" },
            ]}
          />
        </div>
      </div>

      {canManage ? (
        <div>
          <Button type="button" onClick={openCreate} disabled={!hydrated}>
            <PlusIcon aria-hidden="true" data-icon="inline-start" />
            Nova categoria
          </Button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={TagsIcon}
          title={
            status === "archived"
              ? "Nenhuma categoria arquivada"
              : "Nenhuma categoria ativa"
          }
          description={
            status === "archived"
              ? "As categorias que você arquivar aparecem aqui e podem ser reativadas."
              : canManage
                ? "Crie uma categoria para organizar seus lançamentos."
                : "Peça a quem administra a família para criar as categorias."
          }
        />
      ) : (
        <ul className="bg-card flex flex-col divide-y rounded-xl border px-4">
          {roots.map((root) => (
            <li key={root.id} className="list-none">
              <ul className="flex flex-col">
                {renderRow(root, false)}
                {childrenOf(root.id).map((child) => renderRow(child, true))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
        defaultType={type}
        categories={categories}
      />

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria é removida de vez. Se ela tiver lançamentos, a
              exclusão não é feita: arquive-a para escondê-la dos formulários.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              Manter categoria
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={pending}
              onClick={confirmDelete}
            >
              Excluir categoria
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
