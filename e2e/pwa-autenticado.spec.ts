import { expect, test, type Page } from "@playwright/test";

import { loginPelaTela } from "./helpers/login-pelo-formulario";
import { sharedUser } from "./helpers/shared-users";

/**
 * @docker — CA-E8-09 com sessão e troca de usuário no mesmo navegador (AB-117): depois de navegar
 * por telas de (app), sair e entrar com outro usuário, o cache contém só `nucleo-static-<versão>`
 * e URLs da lista fechada ou /offline. Service worker liberado só aqui. Precisa do Supabase local.
 */
test.use({
  serviceWorkers: "allow",
  storageState: { cookies: [], origins: [] },
});

const LISTA_FECHADA = [
  /^\/_next\/static\//,
  /^\/icons\//,
  /^\/favicon\.ico$/,
  /^\/offline$/,
];

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

async function conferirInvariante(page: Page, quando: string) {
  const { nomes, urls } = await estadoDoCache(page);
  expect(nomes.length, `${quando}: caches ${nomes.join(",")}`).toBe(1);
  expect(nomes[0]).toMatch(/^nucleo-static-.+$/);
  const fora = urls.filter(
    (u) =>
      !LISTA_FECHADA.some((re) => re.test(new URL(u, "http://x").pathname)),
  );
  expect(fora, `${quando}: fora da lista fechada`).toEqual([]);
  for (const privada of [
    "/inicio",
    "/transacoes",
    "/relatorios",
    "/familia",
    "/configuracoes",
  ]) {
    expect(
      urls.some((u) => u.startsWith(privada)),
      `${quando}: ${privada} no cache`,
    ).toBe(false);
  }
}

test("@docker cache sem dados de (app) após navegar, sair e entrar com outro usuário (AB-117)", async ({
  page,
}) => {
  await page.goto("/login");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();

  await loginPelaTela(page, sharedUser("owner"));
  for (const rota of ["/inicio", "/transacoes", "/relatorios", "/familia"]) {
    await page.goto(rota);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await conferirInvariante(page, "dono");

  await page.getByRole("button", { name: /^Menu de / }).click();
  await page.getByRole("menuitem", { name: /Sair/ }).click();
  await expect(page).toHaveURL(/\/login/);

  await loginPelaTela(page, sharedUser("outsider"));
  for (const rota of ["/inicio", "/transacoes", "/relatorios", "/familia"]) {
    await page.goto(rota);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await conferirInvariante(page, "outra família");
});

test("@docker offline com sessão ativa mostra /offline e nenhum dado financeiro", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await loginPelaTela(page, sharedUser("owner"));
  await page.goto("/transacoes");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await context.setOffline(true);
  await page.goto("/transacoes").catch(() => undefined);
  await expect(
    page.getByRole("heading", { level: 1, name: "Você está sem conexão" }),
  ).toBeVisible();
  expect((await page.locator("body").innerText()).toLowerCase()).not.toMatch(
    /r\$/,
  );
  await context.setOffline(false);
});
