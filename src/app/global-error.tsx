"use client";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-xl font-bold">Algo deu errado</h1>
          <p className="text-muted-foreground max-w-sm text-sm">
            O Núcleo encontrou um problema inesperado. Tente novamente; se
            continuar, volte mais tarde.
          </p>
          {error.digest ? (
            <p className="text-muted-foreground text-xs">
              Código do erro: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-ring/50 inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium focus-visible:ring-3 focus-visible:outline-none"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
