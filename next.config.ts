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

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
    ];
  },
};

export default nextConfig;
