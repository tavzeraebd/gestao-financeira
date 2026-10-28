import Link from "next/link";

import { cn } from "@/lib/utils";

type SituationTabsProps = {
  items: { href: string; label: string; active: boolean }[];
  "aria-label": string;
};

/** Abas por link (estado na URL): a página inteira é renderizada no servidor para a aba escolhida. */
export function SituationTabs({
  items,
  "aria-label": ariaLabel,
}: SituationTabsProps) {
  return (
    <nav aria-label={ariaLabel} className="max-w-full">
      <ul className="bg-muted inline-flex max-w-full gap-1 overflow-x-auto rounded-lg p-1">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "focus-visible:ring-ring focus-visible:border-ring flex min-h-10 items-center justify-center rounded-md border border-transparent px-4 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                item.active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
