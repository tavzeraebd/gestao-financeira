"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { SegmentedControl } from "@/components/shared/segmented-control";
import type { REPORT_CATEGORY_TYPES } from "@/modules/reports/constants";

type CategoryType = (typeof REPORT_CATEGORY_TYPES)[number];

const OPTIONS: { value: CategoryType; label: string }[] = [
  { value: "despesas", label: "Despesas" },
  { value: "receitas", label: "Receitas" },
];

/** `?tipo=despesas|receitas` do relatório por categoria; mantém o período da URL. */
export function ReportCategoryTypeSwitch({ value }: { value: CategoryType }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onValueChange(next: CategoryType) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tipo", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <SegmentedControl
      aria-label="Tipo de lançamento"
      value={value}
      onValueChange={onValueChange}
      options={OPTIONS}
      className="sm:w-auto sm:min-w-64"
    />
  );
}
