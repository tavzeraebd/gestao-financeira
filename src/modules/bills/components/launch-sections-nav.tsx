import { SubNav } from "@/components/shared/sub-nav";

const SECTIONS = [
  { href: "/transacoes", label: "Lançamentos" },
  { href: "/compromissos", label: "Compromissos" },
  { href: "/recorrencias", label: "Recorrências" },
  { href: "/divisao", label: "Divisão" },
];

/** Navegação entre as seções de lançamentos (topo de /transacoes, /compromissos, /recorrencias e /divisao). */
export function LaunchSectionsNav() {
  return <SubNav items={SECTIONS} aria-label="Seções de lançamentos" />;
}
