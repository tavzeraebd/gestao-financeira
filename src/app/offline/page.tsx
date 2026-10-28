import { WifiOffIcon } from "lucide-react";
import type { Metadata } from "next";

import { ReloadButton } from "@/components/pwa/reload-button";
import { Logo } from "@/components/shared/logo";
import { SkipLink } from "@/components/shared/skip-link";

// Página servida pelo service worker quando a rede cai (ADR-0031). Estática e pública:
// sem sessão, sem Supabase, sem dado de usuário. Fora de (app) e (public) de propósito.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Sem conexão",
  robots: { index: false },
};

export default function OfflinePage() {
  return (
    <>
      <SkipLink />
      <main
        id="conteudo"
        tabIndex={-1}
        className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center outline-none"
      >
        <Logo variant="full" className="[&_svg]:size-10 [&>span]:text-3xl" />
        <div className="bg-primary-soft-strong text-primary-text flex size-12 items-center justify-center rounded-full">
          <WifiOffIcon aria-hidden="true" className="size-6" />
        </div>
        <h1 className="text-xl font-bold">Você está sem conexão</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          O Núcleo precisa de internet para mostrar os dados da sua família. Por
          segurança, nenhum dado financeiro fica guardado neste aparelho.
          Verifique a conexão e tente de novo.
        </p>
        <ReloadButton />
      </main>
    </>
  );
}
