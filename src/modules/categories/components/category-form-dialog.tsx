"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Radio } from "@base-ui/react/radio";
import { AlertCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";

import {
  CATEGORY_ICON_COMPONENTS,
  CategoryIcon,
} from "@/components/shared/category-icon";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { safeAction, useFailureHandler } from "@/hooks/use-action-failure";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { createCategory, updateCategory } from "@/modules/categories/actions";
import {
  CATEGORY_ICON_LABELS,
  CATEGORY_TYPE_LABELS,
} from "@/modules/categories/components/category-labels";
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  type CategoryColor,
  type CategoryIconName,
  type CategoryType,
} from "@/modules/categories/constants";
import { createCategorySchema } from "@/modules/categories/schemas";
import type { CategoryView } from "@/modules/categories/types";
import { LabeledField } from "@/modules/transactions/components/labeled-field";
import { OptionSelect } from "@/modules/transactions/components/option-select";

type CategoryFormValues = {
  name: string;
  type: CategoryType;
  color: CategoryColor;
  icon: CategoryIconName;
  parentId: string;
};

// Classes literais: o Tailwind não enxerga nomes montados em tempo de execução.
const SWATCH: Record<CategoryColor, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
  "chart-6": "bg-chart-6",
};

const FIELDS = ["name", "type", "color", "icon", "parentId"] as const;

const choiceClass =
  "focus-visible:ring-ring/50 data-checked:ring-foreground flex size-10 cursor-pointer items-center justify-center rounded-lg border border-transparent outline-none transition-colors focus-visible:ring-3 data-checked:ring-2";

type CategoryFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criar. */
  category: CategoryView | null;
  defaultType: CategoryType;
  /** Todas as categorias (para escolher o pai). */
  categories: CategoryView[];
};

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  defaultType,
  categories,
}: CategoryFormDialogProps) {
  // Recria o formulário a cada abertura/categoria, sem efeito para limpar o estado.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <CategoryFormBody
          key={category?.id ?? "nova"}
          onClose={() => onOpenChange(false)}
          category={category}
          defaultType={defaultType}
          categories={categories}
        />
      ) : null}
    </Dialog>
  );
}

function CategoryFormBody({
  onClose,
  category,
  defaultType,
  categories,
}: {
  onClose: () => void;
  category: CategoryView | null;
  defaultType: CategoryType;
  categories: CategoryView[];
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = category !== null;

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(
      createCategorySchema,
    ) as unknown as Resolver<CategoryFormValues>,
    defaultValues: {
      name: category?.name ?? "",
      type: category?.type ?? defaultType,
      color: category?.color ?? "chart-1",
      icon: category?.icon ?? "ellipsis",
      parentId: category?.parentId ?? "",
    },
  });

  const type = useWatch({ control: form.control, name: "type" });
  const hasChildren = isEdit
    ? categories.some((c) => c.parentId === category.id && !c.archivedAt)
    : false;

  const showGeneral = useCallback(
    (message: string) => setFormError(message),
    [],
  );
  const fields = useMemo(() => FIELDS, []);
  const handleFailure = useFailureHandler(form.setError, fields, showGeneral);

  const parentOptions = useMemo(
    () =>
      categories
        .filter(
          (c) =>
            c.type === type &&
            c.parentId === null &&
            c.archivedAt === null &&
            c.id !== category?.id,
        )
        .map((c) => ({
          value: c.id,
          label: c.name,
          node: (
            <span className="flex items-center gap-2">
              <CategoryIcon icon={c.icon} color={c.color} size="sm" />
              {c.name}
            </span>
          ),
        })),
    [categories, type, category?.id],
  );

  const onSubmit = form.handleSubmit(() => {
    // O resolver devolve valores já convertidos (Cents); a action recebe o texto digitado.
    const values = form.getValues();
    if (pending) return;
    setFormError(null);
    startTransition(async () => {
      const result = category
        ? await safeAction(() =>
            updateCategory({
              categoryId: category.id,
              name: values.name,
              color: values.color,
              icon: values.icon,
              parentId: hasChildren ? null : values.parentId || null,
            }),
          )
        : await safeAction(() =>
            createCategory({
              name: values.name,
              type: values.type,
              color: values.color,
              icon: values.icon,
              parentId: values.parentId,
            }),
          );
      if (result.ok) {
        toast.success(isEdit ? "Categoria atualizada" : "Categoria criada");
        onClose();
        router.refresh();
        return;
      }
      handleFailure(result.error);
    });
  });

  return (
    <DialogContent
      showCloseButton={false}
      className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>
          {isEdit ? "Editar categoria" : "Nova categoria"}
        </DialogTitle>
        <DialogDescription>
          {isEdit
            ? "O tipo da categoria não muda depois de criada."
            : "Escolha o nome, a cor e o ícone que aparecem nos lançamentos."}
        </DialogDescription>
      </DialogHeader>
      <form
        method="post"
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-5"
      >
        {formError ? (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>Não foi possível salvar</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <LabeledField
          control={form.control}
          name="name"
          id="categoria-nome"
          label="Nome"
        >
          {(f) => (
            <Input
              id={f.id}
              name={f.name}
              ref={f.ref}
              value={f.value}
              onChange={(event) => f.onChange(event.target.value)}
              onBlur={f.onBlur}
              placeholder="Ex.: Pets"
              autoComplete="off"
              aria-invalid={f.invalid}
              aria-describedby={f.describedBy}
            />
          )}
        </LabeledField>

        {isEdit ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Tipo: </span>
            {CATEGORY_TYPE_LABELS[category.type]}
          </p>
        ) : (
          <SegmentedControl<CategoryType>
            aria-label="Tipo da categoria"
            value={type}
            onValueChange={(next) => {
              form.setValue("type", next);
              form.setValue("parentId", "");
            }}
            options={[
              {
                value: "expense",
                label: CATEGORY_TYPE_LABELS.expense,
                tone: "expense",
              },
              {
                value: "income",
                label: CATEGORY_TYPE_LABELS.income,
                tone: "income",
              },
            ]}
          />
        )}

        <Controller
          name="color"
          control={form.control}
          render={({ field, fieldState }) => (
            <FieldSet>
              <FieldLegend variant="label">Cor</FieldLegend>
              <RadioGroup
                value={field.value}
                onValueChange={(next) => field.onChange(next)}
                aria-label="Cor"
                className="flex flex-wrap gap-2"
              >
                {CATEGORY_COLORS.map((color, index) => (
                  <Radio.Root
                    key={color}
                    value={color}
                    aria-label={`Cor ${index + 1}`}
                    className={choiceClass}
                  >
                    <span
                      aria-hidden="true"
                      className={cn("block size-6 rounded-full", SWATCH[color])}
                    />
                  </Radio.Root>
                ))}
              </RadioGroup>
              {fieldState.invalid ? (
                <FieldError errors={[fieldState.error]} />
              ) : null}
            </FieldSet>
          )}
        />

        <Controller
          name="icon"
          control={form.control}
          render={({ field, fieldState }) => {
            return (
              <FieldSet>
                <FieldLegend variant="label">Ícone</FieldLegend>
                <RadioGroup
                  value={field.value}
                  onValueChange={(next) => field.onChange(next)}
                  aria-label="Ícone"
                  className="grid grid-cols-6 gap-2"
                >
                  {CATEGORY_ICONS.map((icon) => {
                    const Icon = CATEGORY_ICON_COMPONENTS[icon];
                    return (
                      <Radio.Root
                        key={icon}
                        value={icon}
                        aria-label={`Ícone ${CATEGORY_ICON_LABELS[icon]}`}
                        className={cn(
                          choiceClass,
                          "bg-muted text-foreground data-checked:bg-card",
                        )}
                      >
                        <Icon aria-hidden="true" className="size-5" />
                      </Radio.Root>
                    );
                  })}
                </RadioGroup>
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : null}
              </FieldSet>
            );
          }}
        />

        {hasChildren ? null : (
          <LabeledField
            control={form.control}
            name="parentId"
            id="categoria-pai"
            label="Subcategoria de (opcional)"
          >
            {(f) => (
              <OptionSelect
                id={f.id}
                value={f.value}
                onValueChange={f.onChange}
                onBlur={f.onBlur}
                options={parentOptions}
                emptyLabel="Nenhuma (categoria principal)"
                invalid={f.invalid}
                describedBy={f.describedBy}
              />
            )}
          </LabeledField>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={pending} disabled={!hydrated}>
            {isEdit ? "Salvar alterações" : "Criar categoria"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
