import { expect, test, type Page } from "@playwright/test";

import { sessionFile } from "./helpers/shared-users";

const CELULAR = { width: 390, height: 844 };
const ALVO_MINIMO = 40;

async function conferirCelular(page: Page, path: string) {
  await page.setViewportSize(CELULAR);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const rolagemHorizontal = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(rolagemHorizontal, `${path}: rolagem horizontal`).toBe(false);

  // Controles principais: campos, botões e links dentro de <main> (ou do formulário).
  const pequenos = await page.evaluate((minimo) => {
    const raiz = document.querySelector("main") ?? document.body;
    const controles = raiz.querySelectorAll<HTMLElement>(
      "input:not([type=hidden]), button, a[href]",
    );
    return Array.from(controles)
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .filter(({ box }) => Math.round(box.height) < minimo)
      .map(
        ({ el, box }) =>
          `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(box.height)}px`,
      );
  }, ALVO_MINIMO);
  expect(pequenos, `${path}: controles abaixo de ${ALVO_MINIMO}px`).toEqual([]);
}

test.describe("CA-E2-59: telas públicas em 390x844", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ["/login", "/cadastro", "/recuperar-senha"]) {
    test(path, async ({ page }) => {
      await conferirCelular(page, path);
    });
  }
});

test.describe("CA-E2-59: onboarding em 390x844", () => {
  test.use({ storageState: sessionFile("solo") });

  test("/onboarding", async ({ page }) => {
    await conferirCelular(page, "/onboarding");
  });
});
