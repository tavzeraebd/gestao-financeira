import { expect, test } from "@playwright/test";

import { criarCenario, criarContaNoBanco, entrar } from "./helpers/cenario";

// D4: navegação por setas no calendário do DatePicker (filtro "De" em /transacoes).
test("DatePicker: setas movem o foco entre dias; PageDown muda de mês; Esc devolve o foco", async ({
  page,
}, testInfo) => {
  // O filtro só existe com ao menos uma conta: o dono compartilhado não tem.
  const c = await criarCenario(`dp-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "100");
  await entrar(page, c.owner);
  await page.goto("/transacoes");
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /^Filtros/ }).click();
  }
  const gatilho = page.locator("#filtro-de:visible");
  await gatilho.click();

  const grade = page.getByRole("grid");
  await expect(grade).toBeVisible();

  // Põe o foco em um dia (o teclado só navega a partir de um dia focado).
  const hoje = grade.getByRole("button", { name: /^Hoje,/ });
  await hoje.focus();
  const nomeInicial = await hoje.getAttribute("aria-label");

  await page.keyboard.press("ArrowRight");
  const focado = page.locator(":focus");
  await expect(focado).toHaveAttribute("aria-label", /\d/);
  await expect(focado).not.toHaveAttribute("aria-label", nomeInicial ?? "");
  await expect(grade.locator(":focus")).toHaveCount(1);

  const mesAntes = await page
    .locator(
      "[role=status], .rdp-caption_label, [data-slot=calendar] [aria-live]",
    )
    .first()
    .textContent()
    .catch(() => null);

  await page.keyboard.press("PageDown");
  await expect(grade.locator(":focus")).toHaveCount(1);
  if (mesAntes) {
    await expect(
      page
        .locator(
          "[role=status], .rdp-caption_label, [data-slot=calendar] [aria-live]",
        )
        .first(),
    ).not.toHaveText(mesAntes);
  }

  await page.keyboard.press("Escape");
  await expect(grade).toBeHidden();
  await expect(gatilho).toBeFocused();
});
