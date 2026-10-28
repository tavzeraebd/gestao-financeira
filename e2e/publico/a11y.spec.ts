import { expect, test } from "@playwright/test";

import { auditar, resumir } from "../helpers/a11y";
import { ROTA_404, ROTAS_PUBLICAS_SEM_BANCO } from "../helpers/rotas";
import { fixarTema, temaAplicado } from "../helpers/tema";
import { TEMAS } from "../helpers/viewports";

/**
 * CA-E8-21 (axe, WCAG 2.2 AA) e CA-E8-31 (estrutura) nas telas sem banco, nos quatro viewports
 * (um projeto por largura) e nos dois temas. Reprova: serious/critical e regras de
 * nome/rótulo/papel/landmark. O restante vai para test-results/a11y/ (log de achados).
 */
const ALVOS = [...ROTAS_PUBLICAS_SEM_BANCO.map((r) => r.padrao), ROTA_404];

for (const tema of TEMAS) {
  test.describe(`axe · tema ${tema}`, () => {
    for (const rota of ALVOS) {
      test(`${rota}`, async ({ page }, testInfo) => {
        await fixarTema(page, tema);
        await page.goto(rota);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await temaAplicado(page), "tema aplicado").toBe(tema);

        const { bloqueantes } = await auditar(page, { testInfo });
        expect(bloqueantes.length, resumir(bloqueantes).join("\n")).toBe(0);
      });
    }
  });
}

test.describe("estrutura (CA-E8-31)", () => {
  for (const rota of ALVOS) {
    test(`${rota}: lang, title, 1 main, 1 h1, sem salto de título`, async ({
      page,
    }) => {
      await page.goto(rota);
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      // 404 do Next: o `not-found.tsx` não é envolvido por `main`; o contrato exige 1 main.
      await expect(page.locator("main")).toHaveCount(1);

      const titulo = await page.title();
      expect(titulo.trim(), "title não vazio").not.toBe("");

      const niveis = await page.evaluate(() =>
        Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((h) =>
          Number(h.tagName[1]),
        ),
      );
      niveis.forEach((nivel, i) => {
        if (i > 0) {
          expect(
            nivel - (niveis[i - 1] ?? 0),
            `salto de título ${niveis.join(",")}`,
          ).toBeLessThanOrEqual(1);
        }
      });
    });
  }

  test("title único por rota, no modelo '%s · Núcleo'", async ({ page }) => {
    const titulos = new Map<string, string>();
    for (const rota of [
      "/login",
      "/cadastro",
      "/recuperar-senha",
      "/offline",
    ]) {
      await page.goto(rota);
      const titulo = await page.title();
      expect(titulo, `${rota}: modelo "%s · Núcleo"`).toMatch(/ · Núcleo$/);
      expect(
        titulos.has(titulo),
        `${rota} repete o title de ${titulos.get(titulo)}`,
      ).toBe(false);
      titulos.set(titulo, rota);
    }
  });
});
