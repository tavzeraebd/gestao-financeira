"use client";

import { SlidersHorizontalIcon, XIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

type FiltersPanelProps = {
  children: ReactNode;
  activeCount: number;
  onClear: () => void;
};

/**
 * Filtros: linha que quebra a partir de `md`; abaixo disso, botão "Filtros (n)" que abre uma folha
 * inferior. Os filhos são renderizados uma única vez (sem ids duplicados).
 */
export function FiltersPanel({
  children,
  activeCount,
  onClear,
}: FiltersPanelProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return (
      <div
        role="group"
        aria-label="Filtros"
        className="flex flex-wrap items-end gap-3"
      >
        {children}
        {activeCount > 0 ? (
          <Button type="button" variant="ghost" onClick={onClear}>
            <XIcon aria-hidden="true" data-icon="inline-start" />
            Limpar filtros
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button type="button" variant="outline" className="w-full" />}
      >
        <SlidersHorizontalIcon aria-hidden="true" data-icon="inline-start" />
        Filtros ({activeCount})
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[85dvh] pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader className="flex-row items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>Refine a lista de lançamentos.</SheetDescription>
          </div>
          <SheetClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fechar filtros"
              />
            }
          >
            <XIcon aria-hidden="true" />
          </SheetClose>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4">
          {children}
        </div>
        <SheetFooter className="flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClear}
            disabled={activeCount === 0}
          >
            Limpar
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            Ver resultados
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
