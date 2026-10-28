import { expect, test, type Page } from "@playwright/test";

/**
 * PWA sem banco (ADR-0031). Projeto `pwa`: Chromium 1280, service worker liberado.
 * CA-E8-01, 03, 06, 08, 09 (público), 11, 12.
 */
test.use({ serviceWorkers: "allow" });

const CACHE_RE = /^nucleo-static-.+$/;
/** Lista fechada do worker (src/lib/pwa/constants.ts) + /offline. */
const LISTA_FECHADA = [
  /^\/_next\/static\//,
  /^\/icons\//,
  /^\/favicon\.ico$/,
  /^\/offline$/,
];

function dimensoesPng(corpo: Buffer): { largura: number; altura: number } {
  // Assinatura PNG (8 bytes) + chunk IHDR: largura em 16..19, altura em 20..23.
  expect(corpo.subarray(0, 8).toString("hex"), "assinatura PNG").toBe(
    "89504e470d0a1a0a",
  );
  return { largura: corpo.readUInt32BE(16), altura: corpo.readUInt32BE(20) };
}

/** Espera o worker ativo e controlando a página (recarrega uma vez se preciso). */
async function esperarWorkerControlando(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) {
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  }
}

const estadoDoCache = (page: Page) =>
  page.evaluate(async () => {
    const nomes = await caches.keys();
    const urls: string[] = [];
    for (const nome of nomes) {
      const cache = await caches.open(nome);
      for (const req of await cache.keys()) {
        const u = new URL(req.url);
        urls.push(u.pathname + u.search);
      }
    }
    return { nomes, urls };
  });

test.describe("manifest e ícones (CA-E8-01)", () => {
  test("GET /manifest.webmanifest sem cookie → 200 com os campos do contrato", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m).toMatchObject({
      name: "Núcleo",
      short_name: "Núcleo",
      id: "/",
      start_url: "/inicio",
      scope: "/",
      display: "standalone",
      lang: "pt-BR",
    });
    expect(m.orientation, "WCAG 1.3.4: sem orientation").toBeUndefined();
    expect(m.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icons/icon-192.png",
          sizes: "192x192",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icons/icon-512.png",
          sizes: "512x512",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          purpose: "maskable",
        }),
      ]),
    );
  });

  test("cada ícone responde 200 image/png com a dimensão declarada", async ({
    request,
  }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.icons.length).toBe(3);
    for (const icone of manifest.icons as { src: string; sizes: string }[]) {
      const res = await request.get(icone.src, { maxRedirects: 0 });
      expect(res.status(), icone.src).toBe(200);
      expect(res.headers()["content-type"], icone.src).toContain("image/png");
      const { largura, altura } = dimensoesPng(await res.body());
      expect(`${largura}x${altura}`, icone.src).toBe(icone.sizes);
    }
  });

  test("apple-touch-icon tem 180x180", async ({ page, request }) => {
    await page.goto("/login");
    const href = await page
      .locator("link[rel='apple-touch-icon']")
      .first()
      .getAttribute("href");
    expect(href, "link apple-touch-icon").toBeTruthy();
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
    const { largura, altura } = dimensoesPng(await res.body());
    expect({ largura, altura }).toEqual({ largura: 180, altura: 180 });
  });

  test("o manifest não passa pelo proxy: sem redirecionamento nem cookie (CA-E8-11)", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["set-cookie"]).toBeUndefined();
  });
});

test.describe("<head> de /login (CA-E8-03)", () => {
  test("manifest, theme-color por esquema, viewport cover sem trava de zoom, apple-touch-icon", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.locator("link[rel='manifest']")).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    const temas = await page
      .locator("meta[name='theme-color']")
      .evaluateAll((els) =>
        els.map((e) => ({
          media: e.getAttribute("media"),
          content: e.getAttribute("content"),
        })),
      );
    expect(temas).toHaveLength(2);
    expect(temas.map((t) => t.media).sort()).toEqual([
      "(prefers-color-scheme: dark)",
      "(prefers-color-scheme: light)",
    ]);
    temas.forEach((t) => expect(t.content).toMatch(/^#[0-9a-f]{6}$/i));

    const viewport = await page
      .locator("meta[name='viewport']")
      .getAttribute("content");
    expect(viewport).toContain("viewport-fit=cover");
    expect(viewport).toContain("width=device-width");
    expect(viewport).not.toMatch(/maximum-scale/);
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/);

    await expect(page.locator("link[rel='apple-touch-icon']")).toHaveCount(1);
  });
});

test.describe("/sw.js (CA-E8-06)", () => {
  test("cabeçalhos do contrato e versão do build no corpo", async ({
    request,
  }) => {
    const res = await request.get("/sw.js", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h["content-type"]).toBe("application/javascript; charset=utf-8");
    expect(h["cache-control"]).toBe("no-cache, no-store, must-revalidate");
    expect(h["content-security-policy"]).toBe(
      "default-src 'self'; script-src 'self'; frame-ancestors 'none'",
    );
    const corpo = await res.text();
    const versao = corpo.match(/const VERSION = "([^"]+)";/)?.[1];
    expect(versao, "const VERSION embutida").toBeTruthy();
    expect(versao).not.toBe("dev"); // build de produção traz o id do build
    expect(corpo).toContain("nucleo-static-");
    expect(h["set-cookie"]).toBeUndefined();
  });
});

test.describe("/offline (CA-E8-11)", () => {
  test("estática: 1 main, 1 h1, noindex, sem cookie, igual com e sem sessão", async ({
    page,
    request,
    context,
  }) => {
    const res = await request.get("/offline", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    expect(res.headers()["set-cookie"]).toBeUndefined();
    const semSessao = await res.text();

    // Cookie de sessão qualquer (formato do @supabase/ssr): o conteúdo não pode mudar.
    const comCookie = await request.get("/offline", {
      maxRedirects: 0,
      headers: { cookie: "sb-127-auth-token=base64-eyJ4IjoxfQ" },
    });
    expect(comCookie.status()).toBe(200);
    const estrutura = (html: string) =>
      html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/\s+/g, " ");
    expect(estrutura(await comCookie.text())).toBe(estrutura(semSessao));

    await context.clearCookies();
    await page.goto("/offline");
    await expect(page.locator("main")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { level: 1, name: "Você está sem conexão" }),
    ).toBeVisible();
    await expect(page.locator("meta[name='robots']")).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(
      page.getByRole("button", { name: "Tentar novamente" }),
    ).toBeVisible();
  });
});

test.describe("worker em ação", () => {
  test("offline mostra /offline em /login e em /inicio e 'Tentar novamente' recarrega (CA-E8-08)", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await esperarWorkerControlando(page);
    await page.waitForFunction(async () => {
      const nomes = await caches.keys();
      for (const n of nomes)
        if (await (await caches.open(n)).match("/offline")) return true;
      return false;
    });

    await context.setOffline(true);

    await page.goto("/login").catch(() => undefined);
    await expect(
      page.getByRole("heading", { level: 1, name: "Você está sem conexão" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Entrar" })).toHaveCount(0);

    await page.goto("/inicio").catch(() => undefined);
    await expect(
      page.getByRole("heading", { level: 1, name: "Você está sem conexão" }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname, "URL original preservada").toBe(
      "/inicio",
    );
    // Nada de dado nenhum na página offline.
    const texto = (await page.locator("body").innerText()).toLowerCase();
    expect(texto).not.toMatch(/r\$|saldo|transaç/);

    await context.setOffline(false);
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    // Sem sessão, /inicio redireciona a /login: o conteúdo offline some e a tela real volta.
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Entrar" }),
    ).toBeVisible();
  });

  test("invariante de cache: só nucleo-static-<versão> e lista fechada (CA-E8-09)", async ({
    page,
  }) => {
    await page.goto("/login");
    await esperarWorkerControlando(page);
    for (const rota of [
      "/cadastro",
      "/recuperar-senha",
      "/offline",
      "/inicio",
      "/auth/confirm",
    ]) {
      await page.goto(rota).catch(() => undefined);
      await page.waitForLoadState("load");
    }
    await page.goto("/login");

    const { nomes, urls } = await estadoDoCache(page);
    expect(nomes.length, `caches: ${nomes.join(",")}`).toBe(1);
    expect(nomes[0]).toMatch(CACHE_RE);
    expect(urls.length, "o pré-cache de /offline aconteceu").toBeGreaterThan(0);
    expect(urls).toContain("/offline");

    const fora = urls.filter(
      (u) =>
        !LISTA_FECHADA.some((re) => re.test(new URL(u, "http://x").pathname)),
    );
    expect(fora, "URLs guardadas fora da lista fechada").toEqual([]);
    // Nenhuma rota de tela (exceto /offline) nem de auth.
    for (const proibida of [
      "/login",
      "/cadastro",
      "/recuperar-senha",
      "/inicio",
      "/auth/",
    ]) {
      expect(
        urls.some((u) => u.startsWith(proibida)),
        `${proibida} no cache`,
      ).toBe(false);
    }
    expect(
      urls.some((u) => /[?&]_rsc=/.test(u)),
      "requisição RSC no cache",
    ).toBe(false);
  });

  test("instalável: Page.getInstallabilityErrors vazio em /login com o worker ativo (CA-E8-12)", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await esperarWorkerControlando(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.enable");
    const resultado = (await cdp.send("Page.getInstallabilityErrors")) as {
      installabilityErrors: { errorId: string; errorArguments: unknown[] }[];
    };
    expect(
      resultado.installabilityErrors,
      JSON.stringify(resultado.installabilityErrors),
    ).toEqual([]);
  });
});
