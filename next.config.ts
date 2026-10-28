import { createHash } from "node:crypto";
import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const noReferrerHeaders = [{ key: "Referrer-Policy", value: "no-referrer" }];

const serviceWorkerHeaders = [
  { key: "Content-Type", value: "application/javascript; charset=utf-8" },
  { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
  },
];

// Identifica o build: todo deploy muda os bytes de /sw.js e o navegador instala o worker novo
// (ADR-0031 §6). Calculado uma vez, para `generateBuildId` e `SW_VERSION` coincidirem.
// O hash evita expor o SHA do commit em `/sw.js` e no nome do cache (SEC-29).
const commit = process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT;
const buildId = commit
  ? createHash("sha256").update(commit).digest("hex").slice(0, 12)
  : Date.now().toString(36);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  generateBuildId: () => buildId,
  env: { SW_VERSION: buildId },
  // O `next dev` imprimia os argumentos de Server Actions, senha inclusive (SEC-11, ADR-0017).
  logging: { serverFunctions: false },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Regras posteriores sobrescrevem as anteriores para a mesma chave.
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/convite/:path*", headers: noReferrerHeaders },
      { source: "/auth/:path*", headers: noReferrerHeaders },
      { source: "/sw.js", headers: serviceWorkerHeaders },
    ];
  },
};

export default nextConfig;
