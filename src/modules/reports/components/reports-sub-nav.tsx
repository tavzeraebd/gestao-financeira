"use client";

import { useSearchParams } from "next/navigation";

import { SubNav } from "@/components/shared/sub-nav";

const SECTIONS = [
  { path: "/relatorios", label: "Visão geral", exact: true },
  { path: "/relatorios/categorias", label: "Categorias" },
  { path: "/relatorios/contas", label: "Contas" },
  { path: "/relatorios/integrantes", label: "Integrantes" },
  { path: "/relatorios/orcamentos", label: "Orçamentos" },
  { path: "/relatorios/metas", label: "Metas" },
];

/** Os links levam `periodo`/`de`/`ate` junto, para o período escolhido valer em toda seção. */
export function ReportsSubNav() {
  const searchParams = useSearchParams();
  const period = new URLSearchParams();
  for (const key of ["periodo", "de", "ate"]) {
    const value = searchParams.get(key);
    if (value) period.set(key, value);
  }
  const query = period.toString();

  return (
    <SubNav
      aria-label="Seções dos relatórios"
      items={SECTIONS.map(({ path, label, exact }) => ({
        href: query ? `${path}?${query}` : path,
        label,
        exact,
      }))}
    />
  );
}
