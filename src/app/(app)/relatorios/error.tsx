"use client";

import { AlertCircleIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Erro dos relatórios: o menu continua visível e a pessoa pode tentar de novo. Só o código (digest). */
export default function RelatoriosErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro nos relatórios", error.digest);
  }, [error.digest]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 py-16 text-center"
    >
      <div className="bg-danger-soft text-danger flex size-12 items-center justify-center rounded-full">
        <AlertCircleIcon aria-hidden="true" className="size-6" />
      </div>
      <h1 className="text-xl font-bold">
        Não foi possível carregar o relatório
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Tente novamente. Se continuar, escolha um período menor ou volte mais
        tarde.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground text-xs">
          Código do erro: <code>{error.digest}</code>
        </p>
      ) : null}
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
