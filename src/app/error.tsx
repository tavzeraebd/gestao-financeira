"use client";

import { AlertCircleIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Só o digest (identificador) vai para o console; a mensagem original pode ter detalhes internos.
    console.error("Erro de renderização", error.digest);
  }, [error.digest]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
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
