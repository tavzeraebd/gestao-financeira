import { expect, test, type Page } from "@playwright/test";

import { sessionFile } from "./helpers/shared-users";

test.use({ storageState: sessionFile("owner") });

const isDark = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains("dark"));

test.describe("Tema (CA-E1-06)", () => {
  test("Escuro aplica .dark, grava nucleo-theme e sobrevive ao reload; Sistema segue o SO", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/configuracoes");
    await expect(
      page.getByRole("heading", { name: "Configurações" }),
    ).toBeVisible();
    expect(await isDark(page)).toBe(false);

    await page.getByRole("button", { name: "Escuro" }).click();
    await expect.poll(() => isDark(page)).toBe(true);
    expect(
      await page.evaluate(() => localStorage.getItem("nucleo-theme")),
    ).toBe("dark");

    await page.reload();
    expect(await isDark(page)).toBe(true);
    await expect(page.getByRole("button", { name: "Escuro" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByRole("button", { name: "Claro" }).click();
    await expect.poll(() => isDark(page)).toBe(false);
    expect(
      await page.evaluate(() => localStorage.getItem("nucleo-theme")),
    ).toBe("light");

    await page.getByRole("button", { name: "Sistema" }).click();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => isDark(page)).toBe(true);
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => isDark(page)).toBe(false);
    expect(
      await page.evaluate(() => localStorage.getItem("nucleo-theme")),
    ).toBe("system");
  });
});

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

test.describe("Layout responsivo (CA-E1-09)", () => {
  test("a partir de lg a sidebar fica expandida", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/inicio");
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await expect(
      sidebar.getByRole("link", { name: "Início", exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByText("Início", { exact: true })).toBeVisible();
    await expect(
      page.locator("nav[aria-label='Navegação principal']"),
    ).toBeHidden();
  });

  test("entre md e lg a sidebar recolhe em ícones e o gatilho expande", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto("/inicio");
    const sidebar = page.locator('[data-slot="sidebar"]');
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");

    const trigger = page.getByRole("button", {
      name: "Recolher ou expandir o menu",
    });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
  });

  test("abaixo de md aparece a navegação inferior com o menu Mais", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/inicio");

    const bottomNav = page.locator("nav[aria-label='Navegação principal']");
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "Início" })).toBeVisible();
    await expect(
      bottomNav.getByRole("link", { name: "Metas" }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="sidebar"]')).toBeHidden();
    expect(await hasHorizontalScroll(page)).toBe(false);

    await bottomNav.getByRole("button", { name: "Mais" }).click();
    const sheet = page.getByRole("dialog", { name: "Mais opções" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: "Configurações" }).click();
    await expect(page).toHaveURL(/\/configuracoes$/);
    await expect(sheet).toBeHidden();
  });

  test("sem rolagem horizontal em 360px nas telas do app", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ["/inicio", "/familia", "/configuracoes"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await hasHorizontalScroll(page), path).toBe(false);
    }
  });
});
