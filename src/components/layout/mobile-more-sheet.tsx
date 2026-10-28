"use client";

import { LogOutIcon, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";

import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { isNavItemActive, navItems } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { signOut } from "@/modules/auth/actions";

const itemClass =
  "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring";

export function MobileMoreSheet({
  triggerClassName,
}: {
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  const moreItems = navItems.filter((item) => item.mobile === "more");
  const moreActive = moreItems.some((item) => isNavItemActive(item, pathname));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-current={moreActive ? "page" : undefined}
        className={triggerClassName}
      >
        <MoreHorizontalIcon aria-hidden="true" className="size-5" />
        <span>Mais</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader>
            <SheetTitle>Mais opções</SheetTitle>
            <SheetDescription>
              Outras áreas e ações da sua conta.
            </SheetDescription>
          </SheetHeader>
          <nav aria-label="Mais opções" className="flex flex-col gap-1 px-2">
            {moreItems.map((item) => {
              const { href, label, icon: Icon } = item;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={
                    isNavItemActive(item, pathname) ? "page" : undefined
                  }
                  className={itemClass}
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {label}
                </Link>
              );
            })}
            <button
              type="button"
              disabled={pending}
              className={cn(itemClass, "disabled:opacity-50")}
              onClick={() =>
                startTransition(async () => {
                  await signOut();
                })
              }
            >
              <LogOutIcon aria-hidden="true" className="size-5" />
              Sair
            </button>
          </nav>
          <div className="flex items-center justify-between gap-2 px-4">
            <span className="text-muted-foreground text-sm">Aparência</span>
            <ThemeToggle />
          </div>
          <div className="px-4 pb-4">
            <SheetClose
              render={<Button variant="outline" className="w-full" />}
            >
              Fechar
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
