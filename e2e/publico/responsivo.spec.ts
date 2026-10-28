import { expect, test } from "@playwright/test";

import {
  controlesSobrepostos,
  elementosForaDaViewport,
  medirAlvos,
  temRolagemHorizontal,
} from "../helpers/layout";
import { ROTA_404, ROTAS_PUBLICAS_SEM_BANCO } from "../helpers/rotas";
import { fixarTema } from "../helpers/tema";
import { BREAKPOINT_MD, TEMAS } from "../helpers/viewports";

/**
 * Telas sem banco em cada largura suportada (um projeto por largura).
 * CA-E8-40 (sem rolagem horizontal, h1 visível, nada cortado/sobreposto), CA-E8-26 (alvo),
 * CA-E8-42 (navegação nas públicas), CA-E8-44 (campos ≥ 16px abaixo de md).
 */
const ALVOS = [...ROTAS_PUBLICAS_SEM_BANCO.map((r) => r.padrao), ROTA_404];
const ALVO_MINIMO_WCAG = 24;
const ALVO_MINIMO_PROJETO = 40;

for (const tema of TEMAS) {
  test.describe(`layout · tema ${tema}`, () => {
    for (const rota of ALVOS) {
      test(`${rota}: sem rolagem horizontal, h1 visível, nada cortado nem sobreposto`, async ({
        page,
      }) => {
        await fixarTema(page, tema);
        await page.goto(rota);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        expect(await temRolagemHorizontal(page), "rolagem horizontal").toBe(
          false,
        );
        expect(await elementosForaDaViewport(page), "cortado").toEqual([]);
        expect(await controlesSobrepostos(page), "sobreposição").toEqual([]);
      });
    }
  });
}

test.describe("alvos de toque (CA-E8-26)", () => {
  for (const rota of ALVOS) {
    test(`${rota}: controles ≥ 24px (WCAG 2.5.8) e principais ≥ 40px`, async ({
      page,
    }) => {
      await page.goto(rota);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const alvos = await medirAlvos(page);

      const abaixoDe24 = alvos
        .filter(
          (a) => a.largura < ALVO_MINIMO_WCAG || a.altura < ALVO_MINIMO_WCAG,
        )
        .map((a) => `${a.alvo} ${a.largura}x${a.altura}`);
      expect(abaixoDe24, "abaixo de 24x24").toEqual([]);

      const principaisPequenos = alvos
        .filter((a) => a.principal && a.altura < ALVO_MINIMO_PROJETO)
        .map((a) => `${a.alvo} ${a.largura}x${a.altura}`);
      expect(principaisPequenos, "controle principal abaixo de 40px").toEqual(
        [],
      );
    });
  }
});

test.describe("campos no celular (CA-E8-44)", () => {
  for (const rota of ["/login", "/cadastro", "/recuperar-senha"]) {
    test(`${rota}: font-size dos campos ≥ 16px abaixo de md`, async ({
      page,
    }) => {
      await page.goto(rota);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const largura = page.viewportSize()!.width;
      const campos = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLElement>(
            "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea",
          ),
        ).map((el) => ({
          campo: el.getAttribute("name") ?? el.id,
          tamanho: parseFloat(getComputedStyle(el).fontSize),
        })),
      );
      expect(campos.length).toBeGreaterThan(0);
      if (largura < BREAKPOINT_MD) {
        const pequenos = campos.filter((c) => c.tamanho < 16);
        expect(
          pequenos,
          "campo com fonte < 16px (iOS dá zoom ao focar)",
        ).toEqual([]);
      }
    });
  }
});

test.describe("navegação nas telas públicas (CA-E8-42)", () => {
  test("/login: sem BottomNav nem sidebar; troca de tema sempre acessível", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Alterar tema" }),
    ).toBeVisible();
  });

  test("/login: nenhuma função só em hover (menu de tema abre por clique/toque)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Alterar tema" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitem", { name: "Escuro" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
