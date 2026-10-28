import { expect, test, type Page } from "@playwright/test";

/**
 * CSP com nonce (ADR-0037, CA-E9-50..55), sem banco. Violações são coletadas no navegador por
 * `securitypolicyviolation` (instalado antes de qualquer script da página) e pelo console.
 */
const CSP_OFFLINE =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

type Violacao = { diretiva: string; bloqueado: string };

/** Instala o coletor e devolve a lista (viva) de mensagens de CSP vistas no console. */
async function observarViolacoes(page: Page): Promise<string[]> {
  const doConsole: string[] = [];
  page.on("console", (m) => {
    if (/content security policy|refused to/i.test(m.text()))
      doConsole.push(m.text());
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: unknown[] };
    w.__csp = [];
    document.addEventListener(
      "securitypolicyviolation",
      (e) => {
        w.__csp.push({
          diretiva: e.violatedDirective,
          bloqueado: e.blockedURI,
        });
      },
      true,
    );
  });
  return doConsole;
}

const violacoes = (page: Page) =>
  page.evaluate(() => (window as unknown as { __csp: Violacao[] }).__csp ?? []);

function nonceDaCsp(csp: string | undefined): string {
  const nonce = csp?.match(/script-src[^;]*'nonce-([^']+)'/)?.[1];
  expect(nonce, `nonce em script-src de: ${csp}`).toBeTruthy();
  return nonce!;
}

test.describe("nonce e CSP nas telas públicas (CA-E9-50, 51)", () => {
  test("/login: CSP no response com nonce, e todo <script> carrega esse mesmo nonce", async ({
    page,
  }) => {
    const res = await page.goto("/login");
    const csp = res!.headers()["content-security-policy"];
    const nonce = nonceDaCsp(csp);
    expect(csp).toMatch(/script-src [^;]*'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp).toContain("worker-src 'self'");

    const scripts = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script")).map((s) => ({
        nonce: s.nonce,
        src: s.getAttribute("src"),
      })),
    );
    expect(scripts.length, "há scripts na página").toBeGreaterThan(0);
    const diferentes = scripts.filter((s) => s.nonce !== nonce);
    expect(diferentes, "scripts com nonce diferente do cabeçalho").toEqual([]);
  });

  test("o nonce muda a cada requisição", async ({ request }) => {
    const a = await request.get("/login");
    const b = await request.get("/login");
    expect(nonceDaCsp(a.headers()["content-security-policy"])).not.toBe(
      nonceDaCsp(b.headers()["content-security-policy"]),
    );
  });

  test("x-nonce e Content-Security-Policy forjados pelo cliente são ignorados", async ({
    request,
  }) => {
    const res = await request.get("/login", {
      headers: {
        "x-nonce": "forjado",
        "content-security-policy": "script-src 'unsafe-inline'",
      },
    });
    const csp = res.headers()["content-security-policy"];
    expect(csp).not.toContain("forjado");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(await res.text()).not.toContain('nonce="forjado"');
  });

  test("zero securitypolicyviolation ao carregar e navegar entre as telas públicas", async ({
    page,
  }) => {
    const doConsole = await observarViolacoes(page);
    for (const rota of ["/login", "/cadastro", "/recuperar-senha", "/login"]) {
      await page.goto(rota);
      await page.waitForLoadState("networkidle");
      expect(await violacoes(page), `violações em ${rota}`).toEqual([]);
    }
    // Navegação do lado do cliente (sem recarregar o documento).
    await page.goto("/login");
    await page
      .getByRole("link", { name: /criar conta|cadastr/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/cadastro/);
    await page.waitForLoadState("networkidle");
    expect(await violacoes(page), "após navegação no cliente").toEqual([]);
    expect(doConsole, "mensagens de CSP no console").toEqual([]);
  });

  test("hidratação sob CSP: a validação do formulário (JS do cliente) responde", async ({
    page,
  }) => {
    const doConsole = await observarViolacoes(page);
    await page.goto("/login");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.locator("[aria-invalid='true']").first()).toBeVisible();
    expect(await violacoes(page)).toEqual([]);
    expect(doConsole).toEqual([]);
  });

  test("troca de tema funciona sob CSP e persiste (next-themes com nonce)", async ({
    page,
  }) => {
    await observarViolacoes(page);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/login");
    await page.getByRole("button", { name: "Alterar tema" }).click();
    await page.getByRole("menuitem", { name: "Escuro" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(
      await page.evaluate(() => localStorage.getItem("nucleo-theme")),
    ).toBe("dark");
    // O script inline do next-themes (com nonce) reaplica o tema antes da hidratação.
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await violacoes(page)).toEqual([]);
  });
});

test.describe("/offline com CSP fixa (CA-E9-52)", () => {
  test("serve a política fixa, sem nonce e sem a política dinâmica", async ({
    request,
  }) => {
    const res = await request.get("/offline", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const csp = res.headers()["content-security-policy"];
    expect(csp).toContain(CSP_OFFLINE);
    expect(csp).not.toContain("nonce-");
    expect(csp).not.toContain("strict-dynamic");
  });

  test("a página abre sem violação e o botão fica utilizável", async ({
    page,
  }) => {
    const doConsole = await observarViolacoes(page);
    await page.goto("/offline");
    await expect(
      page.getByRole("heading", { level: 1, name: "Você está sem conexão" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await violacoes(page)).toEqual([]);
    expect(doConsole).toEqual([]);
    await expect(
      page.getByRole("button", { name: "Tentar novamente" }),
    ).toBeEnabled();
  });
});

test.describe("service worker sob CSP (CA-E9-53, worker-src 'self')", () => {
  test.use({ serviceWorkers: "allow" });

  test("registra /sw.js, fica ativo e não gera violação", async ({ page }) => {
    const doConsole = await observarViolacoes(page);
    await page.goto("/login");
    const script = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return reg.active?.scriptURL ?? null;
    });
    expect(script, "worker ativo").toMatch(/\/sw\.js$/);
    // Escopo do registro do worker: nenhuma violação de worker-src nem de script-src do /sw.js.
    // (Violações de outras origens, p.ex. style-src-elem, são cobertas pelos testes de zero violação.)
    const doWorker = (await violacoes(page)).filter(
      (v) =>
        v.diretiva.startsWith("worker-src") || v.bloqueado.includes("sw.js"),
    );
    expect(doWorker).toEqual([]);
    expect(doConsole.filter((m) => /worker|sw\.js/i.test(m))).toEqual([]);
  });
});
