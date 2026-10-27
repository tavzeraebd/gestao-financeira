"use client";

import { AlertCircleIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Erro dentro do shell do app: o menu continua visível. Mostra só o código (digest). */
export default function AppErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro de renderização", error.digest);
  }, [error.digest]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 py-16 text-center"
    >
      <div className="bg-danger-soft text-danger flex size-12 items-center justify-center rounded-full">
        <AlertCircleIcon aria-hidden="true" className="size-6" />
      </div>
      <h1 className="text-xl font-bold">Algo deu errado</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        Não foi possível carregar esta tela. Tente novamente; se o problema
        continuar, volte mais tarde.
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
