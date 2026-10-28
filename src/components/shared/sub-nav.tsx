"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type SubNavProps = {
  /** `href` pode ter query string (ela não conta para o item ativo); `exact` só casa a própria rota. */
  items: { href: string; label: string; exact?: boolean }[];
  "aria-label": string;
  className?: string;
};

function isActive(pathname: string, href: string, exact = false): boolean {
  const path = href.split("?")[0] ?? href;
  return pathname === path || (!exact && pathname.startsWith(`${path}/`));
}

export function SubNav({ items, "aria-label": ariaLabel, className }: SubNavProps) {
  const pathname = usePathname();
  return (
    <nav aria-label={ariaLabel} className={cn("max-w-full", className)}>
      <ul className="bg-muted inline-flex max-w-full gap-1 overflow-x-auto rounded-lg p-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring focus-visible:border-ring flex min-h-10 items-center justify-center rounded-md border border-transparent px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
