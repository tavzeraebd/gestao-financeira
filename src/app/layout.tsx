import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/pwa/constants";
import { cn } from "@/lib/utils";
import { fontSans } from "@/styles/fonts";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
};

// Sem escala máxima nem bloqueio de zoom (WCAG 1.4.4). Hex só aqui e em manifest.ts: cópias de
// --background (claro e escuro) de globals.css, conferidas por teste (CA-E8-02).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Nonce da CSP (ADR-0037): gerado pelo proxy em cada requisição; ler os cabeçalhos torna a rota dinâmica.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={cn("font-sans", fontSans.variable)}
    >
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <ThemeProvider nonce={nonce}>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
