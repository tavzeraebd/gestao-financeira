import { expect, test } from "@playwright/test";

import {
  elementosForaDaViewport,
  temRolagemHorizontal,
} from "../helpers/layout";
import { ROTA_404, ROTAS_PUBLICAS_SEM_BANCO } from "../helpers/rotas";
import { VIEWPORT_REFLOW } from "../helpers/viewports";

/**
 * CA-E8-32: reflow a 320px (WCAG 1.4.10), 200% de zoom (640x400 CSS px equivale a 1280x800 a
 * 200%) e espaçamento de texto de WCAG 1.4.12. Roda uma vez (projeto v1280): fixa o próprio
 * viewport.
 */
const ALVOS = [...ROTAS_PUBLICAS_SEM_BANCO.map((r) => r.padrao), ROTA_404];

const ESPACAMENTO_1412 = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

const verificarLayout = async (
  page: import("@playwright/test").Page,
  rotulo: string,
) => {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await temRolagemHorizontal(page),
    `${rotulo}: rolagem horizontal`,
  ).toBe(false);
  expect(
    await elementosForaDaViewport(page),
    `${rotulo}: conteúdo cortado`,
  ).toEqual([]);
};

/** Elementos que recortam o próprio conteúdo (overflow hidden/clip) e perderam texto. */
const textoRecortado = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const perdas: string[] = [];
    for (const el of Array.from(
      document.body.querySelectorAll<HTMLElement>("*"),
    )) {
      const cs = getComputedStyle(el);
      if (!/(hidden|clip)/.test(cs.overflowX + cs.overflowY)) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue; // sr-only
      if (
        el.scrollHeight > el.clientHeight + 1 ||
        el.scrollWidth > el.clientWidth + 1
      ) {
        perdas.push(
          `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} ${el.scrollWidth}x${el.scrollHeight} em ${el.clientWidth}x${el.clientHeight}`,
        );
      }
    }
    return perdas.slice(0, 10);
  });

test.describe("reflow a 320px (1.4.10)", () => {
  test.use({ viewport: VIEWPORT_REFLOW });
  for (const rota of ALVOS) {
    test(`${rota}`, async ({ page }) => {
      await page.goto(rota);
      await verificarLayout(page, rota);
    });
  }
});

test.describe("zoom de 200% (1.4.4)", () => {
  test.use({ viewport: { width: 640, height: 400 } });
  for (const rota of ALVOS) {
    test(`${rota}`, async ({ page }) => {
      await page.goto(rota);
      await verificarLayout(page, rota);
    });
  }
});

test.describe("espaçamento de texto (1.4.12)", () => {
  for (const largura of [VIEWPORT_REFLOW.width, 1280]) {
    test.describe(`${largura}px`, () => {
      // `addStyleTag` injeta <style> sem nonce, o que a CSP (ADR-0037) bloqueia; este teste mede
      // espaçamento de texto, não CSP (coberta em csp.spec.ts).
      test.use({
        viewport: { width: largura, height: 800 },
        bypassCSP: true,
      });
      for (const rota of [...ALVOS]) {
        test(`${rota}: nada cortado nem com rolagem horizontal`, async ({
          page,
        }) => {
          await page.goto(rota);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await page.addStyleTag({ content: ESPACAMENTO_1412 });
          await verificarLayout(page, `${rota} @${largura}`);
          expect(
            await textoRecortado(page),
            "texto recortado por overflow",
          ).toEqual([]);
        });
      }
    });
  }
});
