/** Constantes do PWA (ADR-0031). A lista fechada abaixo é a fonte da verdade do service worker. */

export const APP_NAME = "Núcleo";
export const APP_DESCRIPTION = "Sua família no controle do dinheiro.";

export const SW_PATH = "/sw.js";
export const OFFLINE_PATH = "/offline";

/** Prefixo do cache; o nome completo é `nucleo-static-<versão do build>`. */
export const STATIC_CACHE_PREFIX = "nucleo-static-";

/** Estáticos públicos (arquivos com hash ou sem dado algum): cache-first. */
export const STATIC_PREFIXES = ["/_next/static/", "/icons/"];
export const STATIC_EXACT = ["/favicon.ico"];

/** Caminhos que o worker nunca intercepta. */
export const BYPASS_PREFIXES = [
  "/auth/",
  "/_next/image",
  "/_next/data",
  "/sw.js",
  "/manifest.webmanifest",
];
