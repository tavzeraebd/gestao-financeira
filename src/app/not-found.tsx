import { SearchXIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { SkipLink } from "@/components/shared/skip-link";

export default function NotFound() {
  return (
    <>
      <SkipLink />
      <main
        id="conteudo"
        tabIndex={-1}
        className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center outline-none"
      >
        <div className="bg-primary-soft-strong text-primary-text flex size-12 items-center justify-center rounded-full">
          <SearchXIcon aria-hidden="true" className="size-6" />
        </div>
        <h1 className="text-xl font-bold">Página não encontrada</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          O endereço pode ter mudado ou não existir. Volte para o início e
          continue de lá.
        </p>
        <Link href="/inicio" className={buttonVariants()}>
          Ir para o início
        </Link>
      </main>
    </>
  );
}
