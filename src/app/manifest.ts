import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/pwa/constants";

// Hex só aqui e no `viewport` do layout raiz: cópias de --background e --primary (tema claro)
// de globals.css; o teste de manifest compara os valores (CA-E8-02). Sem `orientation` (WCAG 1.3.4).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    lang: "pt-BR",
    dir: "ltr",
    scope: "/",
    start_url: "/inicio",
    display: "standalone",
    categories: ["finance"],
    background_color: "#fafafa",
    theme_color: "#84cc16",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
