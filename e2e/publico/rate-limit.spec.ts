import { expect, test, type Page, type TestInfo } from "@playwright/test";

/**
 * CA-E9-35: a 31ª tentativa de login do mesmo IP (balde auth_ip, 30 por 5 min) responde
 * RATE_LIMITED sem chamar o Auth. Sem banco: o Auth local não existe, então as 30 primeiras
 * falham por outro motivo (nunca por limite). O proxy confia em 1 salto (TRUSTED_PROXY_HOPS):
 * o IP vem da ÚLTIMA entrada de x-forwarded-for e loopback vira "sem IP", por isso cada teste
 * usa um IP público fictício (TEST-NET-3) próprio.
 */
const MENSAGEM_LIMITE = /Muitas tentativas em pouco tempo/;

// Um único viewport: o limite não depende de largura e são ~30 envios por teste.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "v1280", "limite independe do viewport");
  test.slow(); // 31 envios sequenciais disputando CPU com os demais projetos
});

/** IP único por teste, dentro de 203.0.113.0/24 (TEST-NET-3). */
function ipDoTeste(testInfo: TestInfo, base: number): string {
  return `203.0.113.${base + testInfo.repeatEachIndex}`;
}

async function tentarEntrar(page: Page, n: number): Promise<void> {
  await page.getByLabel("E-mail").fill(`tentativa${n}@exemplo.com`);
  await page.getByLabel("Senha", { exact: true }).fill("senha-qualquer-123");
  const resposta = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.request().headers()["next-action"] !== undefined,
    { timeout: 20_000 },
  );
  resposta.catch(() => undefined);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await resposta.catch((e: Error) => {
    throw new Error(`tentativa ${n} sem resposta da action: ${e.message}`);
  });
}

const alerta = (page: Page) => page.getByRole("alert").first();

test("31ª tentativa de login com o mesmo x-forwarded-for → RATE_LIMITED; as 30 anteriores não", async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": ipDoTeste(testInfo, 10),
  });
  await page.goto("/login");

  for (let n = 1; n <= 30; n++) {
    await tentarEntrar(page, n);
    await expect(alerta(page), `tentativa ${n}`).toBeVisible();
    await expect(alerta(page), `tentativa ${n} não limitada`).not.toContainText(
      MENSAGEM_LIMITE,
    );
  }

  await tentarEntrar(page, 31);
  await expect(alerta(page)).toContainText(MENSAGEM_LIMITE);
});

test("IP diferente não é afetado pelo esgotamento de outro", async ({
  page,
  browser,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": ipDoTeste(testInfo, 50),
  });
  await page.goto("/login");
  for (let n = 1; n <= 31; n++) await tentarEntrar(page, n);
  await expect(alerta(page)).toContainText(MENSAGEM_LIMITE);

  const outro = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": ipDoTeste(testInfo, 90) },
  });
  try {
    const p2 = await outro.newPage();
    await p2.goto("/login");
    await tentarEntrar(p2, 1);
    await expect(alerta(p2)).toBeVisible();
    await expect(alerta(p2)).not.toContainText(MENSAGEM_LIMITE);
  } finally {
    await outro.close();
  }
});

test("sem IP confiável (sem x-forwarded-for) o balde por IP é ignorado: 31 tentativas não limitam", async ({
  page,
}) => {
  await page.goto("/login");
  for (let n = 1; n <= 31; n++) await tentarEntrar(page, n);
  await expect(alerta(page)).not.toContainText(MENSAGEM_LIMITE);
});
