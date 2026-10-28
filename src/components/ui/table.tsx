"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const ROTULO_PADRAO = "Tabela com rolagem horizontal";

/**
 * Contêiner da tabela. Quando o conteúdo é mais largo que a área (celular), vira uma região
 * focável com nome (WCAG 2.1.1, axe `scrollable-region-focusable`): quem usa teclado alcança a
 * rolagem com Tab e as setas. Sem rolagem, não entra na ordem de Tab. O nome vem de `rotulo`,
 * da `caption` da tabela ou do padrão.
 */
function Table({
  className,
  rotulo,
  ...props
}: React.ComponentProps<"table"> & { rotulo?: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [nome, setNome] = React.useState<string | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const medir = () => {
      const rolavel = el.scrollWidth > el.clientWidth;
      const legenda = el.querySelector("caption")?.textContent?.trim();
      setNome(rolavel ? (rotulo ?? (legenda || ROTULO_PADRAO)) : null);
    };
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    const tabela = el.querySelector("table");
    if (tabela) observador.observe(tabela);
    return () => observador.disconnect();
  }, [rotulo]);

  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      className={cn(
        "relative w-full overflow-x-auto",
        nome &&
          "focus-visible:outline-ring focus-visible:outline-2 focus-visible:-outline-offset-2",
      )}
      {...(nome ? { role: "region", tabIndex: 0, "aria-label": nome } : {})}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
