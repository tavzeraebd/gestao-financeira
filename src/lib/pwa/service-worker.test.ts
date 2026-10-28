// @vitest-environment node
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { BYPASS_PREFIXES, STATIC_CACHE_PREFIX } from "./constants";
import { buildServiceWorkerSource } from "./service-worker";

const ORIGIN = "https://nucleo.test";
const VERSION = "abc123";
const CACHE_NAME = `${STATIC_CACHE_PREFIX}${VERSION}`;

type Handler = (event: unknown) => void;
type FakeRequest = {
  method: string;
  url: string;
  mode: string;
  headers: Headers;
};
type FetchImpl = (input: unknown, init?: unknown) => Promise<Response>;

function makeResponse(
  body = "ok",
  init: ResponseInit & { type?: ResponseType } = {},
): Response {
  const { type, ...rest } = init;
  const response = new Response(body, { status: 200, ...rest });
  Object.defineProperty(response, "type", { value: type ?? "basic" });
  return response;
}

function makeRequest(
  path: string,
  options: {
    method?: string;
    mode?: string;
    headers?: Record<string, string>;
    origin?: string;
  } = {},
): FakeRequest {
  return {
    method: options.method ?? "GET",
    url: new URL(path, options.origin ?? ORIGIN).href,
    mode: options.mode ?? "no-cors",
    headers: new Headers(options.headers),
  };
}

function keyOf(input: unknown): string {
  const raw = typeof input === "string" ? input : (input as FakeRequest).url;
  return new URL(raw, ORIGIN).href;
}

function createSandbox(fetchImpl: FetchImpl, version = VERSION) {
  const handlers: Record<string, Handler> = {};
  const stores = new Map<string, Map<string, Response>>();
  const puts: string[] = [];
  const skipWaiting = vi.fn();
  const claim = vi.fn(() => Promise.resolve());

  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return Promise.resolve({
      put: (input: unknown, response: Response) => {
        puts.push(
          new URL(keyOf(input)).pathname + new URL(keyOf(input)).search,
        );
        store.set(keyOf(input), response);
        return Promise.resolve();
      },
      match: (input: unknown) => {
        const hit = store.get(keyOf(input));
        return Promise.resolve(hit ? hit.clone() : undefined);
      },
    });
  };

  const caches = {
    open,
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
    match: (input: unknown) => {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(input));
        if (hit) return Promise.resolve(hit.clone());
      }
      return Promise.resolve(undefined);
    },
  };

  const self = {
    location: { origin: ORIGIN },
    skipWaiting,
    clients: { claim },
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
  };

  const fetchSpy = vi.fn(fetchImpl);
  runInNewContext(buildServiceWorkerSource(version), {
    self,
    caches,
    fetch: fetchSpy,
    URL,
    Response,
    Promise,
    Set,
    Array,
  });

  function lifecycle(type: "install" | "activate"): Promise<unknown> {
    let pending: Promise<unknown> = Promise.resolve();
    handlers[type]?.({
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    return pending;
  }

  function dispatchFetch(request: FakeRequest): {
    responded: Promise<Response> | null;
  } {
    let responded: Promise<Response> | null = null;
    handlers.fetch?.({
      request,
      respondWith: (promise: Promise<Response>) => {
        responded = promise;
      },
    });
    return { responded };
  }

  return {
    stores,
    puts,
    skipWaiting,
    claim,
    fetchSpy,
    lifecycle,
    dispatchFetch,
  };
}

const offlineHtml =
  '<html><link href="/_next/static/css/app.css?dpl=1&amp;x=2" rel="stylesheet"/>' +
  '<script src="/_next/static/chunks/a.js"></script>' +
  '<script>self.x=["/_next/static/chunks/b.js"]</script>' +
  '<script src="/_next/static/chunks/a.js"></script></html>';

function onlineFetch(): FetchImpl {
  return (input) => {
    const path = new URL(keyOf(input)).pathname;
    if (path === "/offline") return Promise.resolve(makeResponse(offlineHtml));
    return Promise.resolve(makeResponse(`corpo de ${path}`));
  };
}

describe("buildServiceWorkerSource", () => {
  it("embute a versão e muda de texto quando a versão muda", () => {
    const a = buildServiceWorkerSource("v1");
    const b = buildServiceWorkerSource("v2");
    expect(a).toContain('const VERSION = "v1";');
    expect(b).toContain('const VERSION = "v2";');
    expect(a).not.toBe(b);
  });

  it("não usa import/export e é JavaScript válido", () => {
    const source = buildServiceWorkerSource(VERSION);
    expect(source).not.toMatch(/^\s*(import|export)\s/m);
    expect(() => runInNewContext(`(function(){${source}\n})`)).not.toThrow();
  });

  it("neutraliza versão com aspas ou quebra de linha", () => {
    const hostile = String.raw`x"; globalThis.pwned = 1; //` + "\n";
    const handlers: Record<string, Handler> = {};
    const context: Record<string, unknown> = {
      pwned: 0,
      self: {
        location: { origin: ORIGIN },
        addEventListener: (t: string, h: Handler) => (handlers[t] = h),
      },
      caches: {},
      URL,
    };
    runInNewContext(buildServiceWorkerSource(hostile), context);
    expect(context.pwned).toBe(0);
    expect(Object.keys(handlers).sort()).toEqual([
      "activate",
      "fetch",
      "install",
    ]);
  });
});

describe("fetch: o que o worker não intercepta (CA-E8-04)", () => {
  const ignored: [string, FakeRequest][] = [
    ["POST", makeRequest("/inicio", { method: "POST", mode: "navigate" })],
    ["PUT estático", makeRequest("/icons/icon-192.png", { method: "PUT" })],
    [
      "Server Action",
      makeRequest("/transacoes", { headers: { "Next-Action": "abc" } }),
    ],
    ["?_rsc=", makeRequest("/inicio?_rsc=1abc", { mode: "navigate" })],
    ["cabeçalho RSC", makeRequest("/inicio", { headers: { RSC: "1" } })],
    ["/_next/image", makeRequest("/_next/image?url=%2Ficons%2Fa.png&w=64")],
    ["/_next/data", makeRequest("/_next/data/abc/inicio.json")],
    [
      "/auth/confirm",
      makeRequest("/auth/confirm?token=x", { mode: "navigate" }),
    ],
    ["/sw.js", makeRequest("/sw.js")],
    ["/manifest.webmanifest", makeRequest("/manifest.webmanifest")],
    [
      "Range em estático",
      makeRequest("/_next/static/media/v.mp4", {
        headers: { Range: "bytes=0-1" },
      }),
    ],
    [
      "outra origem (estático)",
      makeRequest("/_next/static/chunks/a.js", { origin: "https://cdn.test" }),
    ],
    [
      "outra origem (navegação)",
      makeRequest("/inicio", {
        mode: "navigate",
        origin: "https://outro.test",
      }),
    ],
    ["API (GET não navegação)", makeRequest("/api/qualquer")],
    ["imagem fora da lista", makeRequest("/logo.png")],
  ];

  it.each(ignored)(
    "%s: não chama respondWith nem guarda nada",
    (_, request) => {
      const sandbox = createSandbox(onlineFetch());
      const { responded } = sandbox.dispatchFetch(request);
      expect(responded).toBeNull();
      expect(sandbox.puts).toEqual([]);
      expect(sandbox.fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("cobre todos os BYPASS_PREFIXES do contrato", () => {
    for (const prefix of BYPASS_PREFIXES) {
      const sandbox = createSandbox(onlineFetch());
      const { responded } = sandbox.dispatchFetch(
        makeRequest(`${prefix}${prefix.endsWith("/") ? "x" : ""}`, {
          mode: "navigate",
        }),
      );
      expect(responded, prefix).toBeNull();
    }
  });
});

describe("fetch: estáticos públicos, cache-first (CA-E8-04)", () => {
  it.each(["/_next/static/chunks/a.js", "/icons/icon-192.png", "/favicon.ico"])(
    "%s: busca na rede, guarda e depois serve do cache",
    async (path) => {
      const sandbox = createSandbox(onlineFetch());

      const first = sandbox.dispatchFetch(makeRequest(path));
      expect(first.responded).not.toBeNull();
      expect(await (await first.responded)!.text()).toBe(`corpo de ${path}`);
      expect(sandbox.puts).toEqual([path]);
      expect(sandbox.stores.get(CACHE_NAME)?.size).toBe(1);

      sandbox.fetchSpy.mockClear();
      const second = sandbox.dispatchFetch(makeRequest(path));
      expect(await (await second.responded)!.text()).toBe(`corpo de ${path}`);
      expect(sandbox.fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["404", () => makeResponse("x", { status: 404 })],
    ["500", () => makeResponse("x", { status: 500 })],
    ["206", () => makeResponse("x", { status: 206 })],
    ["tipo cors", () => makeResponse("x", { type: "cors" })],
    ["tipo opaque", () => makeResponse("x", { type: "opaque" })],
    [
      "Cache-Control: no-store",
      () => makeResponse("x", { headers: { "Cache-Control": "no-store" } }),
    ],
    [
      "Cache-Control: private",
      () =>
        makeResponse("x", {
          headers: { "Cache-Control": "private, max-age=0" },
        }),
    ],
  ])("não guarda resposta %s, mas a entrega", async (_, build) => {
    const sandbox = createSandbox(() => Promise.resolve(build()));
    const { responded } = sandbox.dispatchFetch(
      makeRequest("/_next/static/chunks/a.js"),
    );
    const response = await responded!;
    expect(await response.text()).toBe("x");
    expect(sandbox.puts).toEqual([]);
  });
});

describe("fetch: navegação, rede primeiro e sem guardar (CA-E8-04, CA-E8-05)", () => {
  it("online: passa a resposta e não guarda nada", async () => {
    const sandbox = createSandbox(onlineFetch());
    const { responded } = sandbox.dispatchFetch(
      makeRequest("/inicio", { mode: "navigate" }),
    );
    expect(await (await responded!).text()).toBe("corpo de /inicio");
    expect(sandbox.puts).toEqual([]);
    expect(sandbox.stores.size).toBe(0);
  });

  it.each([401, 403, 404, 500, 503])(
    "resposta HTTP %i passa intacta e não vira /offline",
    async (status) => {
      const sandbox = createSandbox(() =>
        Promise.resolve(makeResponse("do servidor", { status })),
      );
      await sandbox.lifecycle("install").catch(() => {});
      const { responded } = sandbox.dispatchFetch(
        makeRequest("/transacoes", { mode: "navigate" }),
      );
      const response = await responded!;
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("do servidor");
    },
  );

  it("redirecionamento passa intacto", async () => {
    const redirect = new Response(null, {
      status: 302,
      headers: { Location: "/login" },
    });
    const sandbox = createSandbox(() => Promise.resolve(redirect));
    const { responded } = sandbox.dispatchFetch(
      makeRequest("/inicio", { mode: "navigate" }),
    );
    const response = await responded!;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    expect(sandbox.puts).toEqual([]);
  });

  it("falha de rede: responde /offline do cache", async () => {
    let online = true;
    const sandbox = createSandbox((input) =>
      online || keyOf(input).endsWith("/offline")
        ? onlineFetch()(input)
        : Promise.reject(new TypeError("Failed to fetch")),
    );
    await sandbox.lifecycle("install");
    online = false;
    const { responded } = sandbox.dispatchFetch(
      makeRequest("/inicio", { mode: "navigate" }),
    );
    expect(await (await responded!).text()).toBe(offlineHtml);
  });

  it("falha de rede sem /offline no cache: 503 em texto", async () => {
    const sandbox = createSandbox(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    const { responded } = sandbox.dispatchFetch(
      makeRequest("/inicio", { mode: "navigate" }),
    );
    const response = await responded!;
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(await response.text()).toBe("Sem conexão");
  });
});

describe("install e activate (CA-E8-10)", () => {
  it("install: skipWaiting, /offline com cache reload e sem credenciais, ativos do HTML", async () => {
    const sandbox = createSandbox(onlineFetch());
    await sandbox.lifecycle("install");

    expect(sandbox.skipWaiting).toHaveBeenCalledTimes(1);
    expect(sandbox.fetchSpy.mock.calls[0]).toEqual([
      "/offline",
      { cache: "reload", credentials: "omit" },
    ]);
    expect([...sandbox.puts].sort()).toEqual(
      [
        "/offline",
        "/_next/static/css/app.css?dpl=1&x=2",
        "/_next/static/chunks/a.js",
        "/_next/static/chunks/b.js",
      ].sort(),
    );
    for (const [, init] of sandbox.fetchSpy.mock.calls) {
      expect(init).toMatchObject({ credentials: "omit" });
    }
  });

  it("install: falha de um ativo não rejeita a instalação", async () => {
    const sandbox = createSandbox((input) =>
      keyOf(input).endsWith("b.js")
        ? Promise.reject(new TypeError("Failed to fetch"))
        : onlineFetch()(input),
    );
    await expect(sandbox.lifecycle("install")).resolves.toBeUndefined();
    expect(sandbox.puts).toContain("/offline");
    expect(sandbox.puts).not.toContain("/_next/static/chunks/b.js");
  });

  it("install: falha ao buscar /offline rejeita a instalação", async () => {
    const sandbox = createSandbox(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    await expect(sandbox.lifecycle("install")).rejects.toThrow();
  });

  it("install: /offline com erro HTTP ou no-store rejeita a instalação", async () => {
    const erro = createSandbox(() =>
      Promise.resolve(makeResponse("x", { status: 500 })),
    );
    await expect(erro.lifecycle("install")).rejects.toThrow();

    const noStore = createSandbox(() =>
      Promise.resolve(
        makeResponse("x", { headers: { "Cache-Control": "no-store" } }),
      ),
    );
    await expect(noStore.lifecycle("install")).rejects.toThrow();
    expect(noStore.puts).toEqual([]);
  });

  it("activate: apaga só nucleo-static-* de outra versão e chama clients.claim", async () => {
    const sandbox = createSandbox(onlineFetch());
    sandbox.stores.set(`${STATIC_CACHE_PREFIX}antiga`, new Map());
    sandbox.stores.set(`${STATIC_CACHE_PREFIX}outra`, new Map());
    sandbox.stores.set(CACHE_NAME, new Map());
    sandbox.stores.set("de-terceiros", new Map());

    await sandbox.lifecycle("activate");

    expect([...sandbox.stores.keys()].sort()).toEqual(
      [CACHE_NAME, "de-terceiros"].sort(),
    );
    expect(sandbox.claim).toHaveBeenCalledTimes(1);
  });
});

describe("invariante de cache (CA-E8-05)", () => {
  const inventory = [
    "/login",
    "/cadastro",
    "/recuperar-senha",
    "/redefinir-senha",
    "/offline",
    "/convite/abc",
    "/onboarding",
    "/inicio",
    "/transacoes",
    "/transacoes/nova",
    "/transacoes/1/editar",
    "/contas",
    "/categorias",
    "/compromissos",
    "/recorrencias",
    "/orcamentos",
    "/metas",
    "/divisao",
    "/divisao/acertos",
    "/planejamento",
    "/relatorios",
    "/relatorios/categorias",
    "/notificacoes",
    "/familia",
    "/familia/atividade",
    "/configuracoes",
    "/auth/confirm",
    "/",
  ];

  function isAllowed(entry: string): boolean {
    const path = entry.split("?")[0] ?? "";
    return (
      path === "/offline" ||
      path === "/favicon.ico" ||
      path.startsWith("/_next/static/") ||
      path.startsWith("/icons/")
    );
  }

  // Gerador pseudoaleatório determinístico (sem dependência nova).
  function rng(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  it("cache.put só recebe URL da lista fechada, qualquer que seja o pedido", async () => {
    const rand = rng(42);
    const pick = <T>(list: readonly T[]): T =>
      list[Math.floor(rand() * list.length)] as T;
    const randomPath = () =>
      "/" +
      Array.from({ length: 1 + Math.floor(rand() * 3) }, () =>
        Math.floor(rand() * 1e6).toString(36),
      ).join("/");
    const paths = [
      ...inventory,
      "/_next/static/chunks/x.js",
      "/_next/static/../../inicio",
      "/icons/icon-512.png",
      "/favicon.ico",
      "/_next/image?url=a",
      "/_next/data/x/inicio.json",
      "/sw.js",
      "/manifest.webmanifest",
    ];
    const responses: (() => Response)[] = [
      () => makeResponse("a"),
      () => makeResponse("a", { status: 401 }),
      () => makeResponse("a", { status: 500 }),
      () => makeResponse("a", { type: "cors" }),
      () => makeResponse("a", { headers: { "Cache-Control": "private" } }),
      () => makeResponse("a", { headers: { "Cache-Control": "no-store" } }),
    ];

    const sandbox = createSandbox((input) =>
      keyOf(input).endsWith("/offline")
        ? Promise.resolve(makeResponse(offlineHtml))
        : Promise.resolve(pick(responses)()),
    );
    await sandbox.lifecycle("install");

    for (let i = 0; i < 400; i += 1) {
      const path = rand() < 0.3 ? randomPath() : pick(paths);
      const { responded } = sandbox.dispatchFetch(
        makeRequest(path, {
          method: pick(["GET", "GET", "GET", "POST", "PUT", "DELETE"]),
          mode: pick(["navigate", "no-cors", "cors", "same-origin"]),
          headers: rand() < 0.2 ? { RSC: "1" } : undefined,
          origin: rand() < 0.1 ? "https://outro.test" : ORIGIN,
        }),
      );
      if (responded) await responded.catch(() => {});
    }

    expect(sandbox.puts.length).toBeGreaterThan(0);
    for (const entry of sandbox.puts) {
      expect(isAllowed(entry), entry).toBe(true);
    }
    // A navegação de uma rota privada nunca entra no cache, nem com resposta 200.
    for (const store of sandbox.stores.values()) {
      for (const key of store.keys()) {
        expect(isAllowed(new URL(key).pathname), key).toBe(true);
      }
    }
  });
});
