import { buildServiceWorkerSource } from "@/lib/pwa/service-worker";

export const dynamic = "force-static";

// Cabeçalhos de cache e CSP deste caminho ficam em `next.config.ts` (ADR-0031 §6 e §8).
export function GET(): Response {
  return new Response(
    buildServiceWorkerSource(process.env.SW_VERSION ?? "dev"),
    { headers: { "Content-Type": "application/javascript; charset=utf-8" } },
  );
}
