import { CategoryIcon } from "@/components/shared/category-icon";
import type { CategoryOption } from "@/modules/categories/types";
import type { SelectOption } from "@/modules/transactions/components/option-select";

export function categorySelectOptions(list: CategoryOption[]): SelectOption[] {
  return list.map((category) => ({
    value: category.id,
    label: category.name,
    node: (
      <span
        className={
          category.parentId
            ? "ml-4 flex items-center gap-2"
            : "flex items-center gap-2"
        }
      >
        <CategoryIcon icon={category.icon} color={category.color} size="sm" />
        {category.name}
      </span>
    ),
  }));
}
