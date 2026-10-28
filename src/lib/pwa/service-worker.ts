import {
  BYPASS_PREFIXES,
  OFFLINE_PATH,
  STATIC_CACHE_PREFIX,
  STATIC_EXACT,
  STATIC_PREFIXES,
} from "./constants";

/**
 * Gera o texto do service worker (ES2020, sem `import`), com a versão do build embutida.
 *
 * O worker é um artefato de plataforma: não passa pelo bundler, então nasce de texto gerado
 * (assim não existe `.js` de aplicação, e o gerador é testável em sandbox). ADR-0031.
 *
 * Invariante: o worker só guarda estáticos públicos da lista fechada e `/offline`. Navegação,
 * RSC, Server Actions, `/auth/**` e qualquer dado de usuário passam direto pela rede.
 */
export function buildServiceWorkerSource(version: string): string {
  const constants = [
    `const VERSION = ${JSON.stringify(version)};`,
    `const CACHE_PREFIX = ${JSON.stringify(STATIC_CACHE_PREFIX)};`,
    `const CACHE_NAME = CACHE_PREFIX + VERSION;`,
    `const OFFLINE_PATH = ${JSON.stringify(OFFLINE_PATH)};`,
    `const STATIC_PREFIXES = ${JSON.stringify(STATIC_PREFIXES)};`,
    `const STATIC_EXACT = ${JSON.stringify(STATIC_EXACT)};`,
    `const BYPASS_PREFIXES = ${JSON.stringify(BYPASS_PREFIXES)};`,
  ].join("\n");

  return `"use strict";
// Núcleo — service worker (ADR-0031). Gerado por src/lib/pwa/service-worker.ts.
${constants}

function isCacheable(response) {
  if (response.status !== 200 || response.type !== "basic") return false;
  const control = response.headers.get("Cache-Control") || "";
  return !/no-store|private/i.test(control);
}

function startsWithAny(path, prefixes) {
  return prefixes.some(function (prefix) {
    return path.startsWith(prefix) || path === prefix.replace(/\\/$/, "");
  });
}

function isStaticPath(path) {
  return STATIC_EXACT.indexOf(path) !== -1 || STATIC_PREFIXES.some(function (prefix) {
    return path.startsWith(prefix);
  });
}

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  const page = await fetch(OFFLINE_PATH, { cache: "reload", credentials: "omit" });
  if (!isCacheable(page)) {
    throw new Error("Falha ao guardar " + OFFLINE_PATH);
  }
  const html = await page.clone().text();
  await cache.put(OFFLINE_PATH, page);

  const found = html.replace(/&amp;/g, "&").match(/\\/_next\\/static\\/[^"'\\s<>\\\\)]+/g) || [];
  const assets = Array.from(new Set(found));
  await Promise.allSettled(
    assets.map(async function (path) {
      const response = await fetch(path, { credentials: "omit" });
      if (isCacheable(response)) await cache.put(path, response);
    }),
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (isCacheable(response)) {
    try {
      await cache.put(request, response.clone());
    } catch (_error) {
      // Cache cheio ou indisponível: a resposta de rede segue valendo.
    }
  }
  return response;
}

async function navigate(request) {
  try {
    return await fetch(request);
  } catch (_error) {
    const offline = await caches.match(OFFLINE_PATH);
    if (offline) return offline;
    return new Response("Sem conexão", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME;
            })
            .map(function (key) {
              return caches.delete(key);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    request.headers.has("range") ||
    request.headers.has("next-action") ||
    request.headers.has("rsc") ||
    url.searchParams.has("_rsc") ||
    startsWithAny(url.pathname, BYPASS_PREFIXES)
  ) {
    return;
  }
  if (isStaticPath(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
  }
});
`;
}
