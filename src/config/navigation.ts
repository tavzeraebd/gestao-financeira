import {
  ArrowLeftRightIcon,
  BellIcon,
  CalculatorIcon,
  ChartColumnIcon,
  HomeIcon,
  PiggyBankIcon,
  SettingsIcon,
  TargetIcon,
  TagsIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  mobile: "primary" | "more";
  /** Prefixos extras que também deixam o item ativo (ex.: Compromissos sob Transações). */
  activePrefixes?: string[];
};

/** Item ativo: a própria rota (e subrotas) ou um dos `activePrefixes`. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.activePrefixes ?? [])].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export const navItems: NavItem[] = [
  { href: "/inicio", label: "Início", icon: HomeIcon, mobile: "primary" },
  {
    href: "/transacoes",
    label: "Transações",
    icon: ArrowLeftRightIcon,
    mobile: "primary",
    activePrefixes: ["/compromissos", "/recorrencias", "/divisao"],
  },
  { href: "/contas", label: "Contas", icon: WalletIcon, mobile: "primary" },
  {
    href: "/orcamentos",
    label: "Orçamentos",
    icon: PiggyBankIcon,
    mobile: "more",
  },
  { href: "/metas", label: "Metas", icon: TargetIcon, mobile: "primary" },
  {
    href: "/planejamento",
    label: "Planejamento",
    icon: CalculatorIcon,
    mobile: "more",
  },
  {
    href: "/relatorios",
    label: "Relatórios",
    icon: ChartColumnIcon,
    mobile: "more",
  },
  { href: "/familia", label: "Família", icon: UsersIcon, mobile: "more" },
  {
    href: "/notificacoes",
    label: "Notificações",
    icon: BellIcon,
    mobile: "more",
  },
  { href: "/categorias", label: "Categorias", icon: TagsIcon, mobile: "more" },
  {
    href: "/configuracoes",
    label: "Configurações",
    icon: SettingsIcon,
    mobile: "more",
  },
];
