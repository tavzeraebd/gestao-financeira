"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { MobileMoreSheet } from "@/components/layout/mobile-more-sheet";
import { isNavItemActive, navItems } from "@/config/navigation";

const itemClass =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:text-primary-text";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="bg-card fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch">
        {navItems
          .filter((item) => item.mobile === "primary")
          .map((item) => {
            const { href, label, icon: Icon } = item;
            const active = isNavItemActive(item, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={itemClass}
              >
                <Icon aria-hidden="true" className="size-5" />
                <span>{label}</span>
              </Link>
            );
          })}
        <MobileMoreSheet triggerClassName={itemClass} />
      </div>
    </nav>
  );
}
