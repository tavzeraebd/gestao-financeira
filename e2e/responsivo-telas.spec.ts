import { expect, test } from "@playwright/test";

import {
  novoCaminhoDeSessaoDasRotas,
  semearDadosDasRotas,
} from "./helpers/cenario-rotas";
import {
  controlesSobrepostos,
  elementosForaDaViewport,
  temRolagemHorizontal,
} from "./helpers/layout";
import {
  ROTAS_AUTENTICADAS,
  resolver,
  type IdsDinamicos,
} from "./helpers/rotas";
import { fixarTema } from "./helpers/tema";
import {
  BREAKPOINT_MD,
  TEMAS,
  VIEWPORT_NOMES,
  VIEWPORTS,
} from "./helpers/viewports";

/**
 * @docker — CA-E8-41 (todas as rotas autenticadas com dados, claro e escuro, nos quatro
 * viewports), CA-E8-42 (navegação), CA-E8-43 (diálogos na área útil), CA-E8-44 (campos >= 16px),
 * CA-E8-47 (SubNav). Precisa do Supabase local. Escrito agora, executado com Docker.
 */
const SESSAO_COM_DADOS = novoCaminhoDeSessaoDasRotas("responsivo");
test.use({ storageState: SESSAO_COM_DADOS });

let ids: IdsDinamicos;
test.beforeAll(async ({ browser }, testInfo) => {
  ids = await semearDadosDasRotas(
    browser,
    String(testInfo.project.use.baseURL ?? "http://localhost:3000"),
    SESSAO_COM_DADOS,
  );
});

const ROTAS = ROTAS_AUTENTICADAS.filter((r) => r.padrao !== "/onboarding");

for (const nome of VIEWPORT_NOMES) {
  for (const tema of TEMAS) {
    test.describe(`@docker layout ${nome} · ${tema}`, () => {
      for (const rota of ROTAS) {
        test(`${rota.padrao}`, async ({ page }) => {
          await page.setViewportSize(VIEWPORTS[nome]);
          await fixarTema(page, tema);
          await page.goto(resolver(rota, ids));
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

          expect(await temRolagemHorizontal(page), "rolagem horizontal").toBe(
            false,
          );
          expect(await elementosForaDaViewport(page), "cortado").toEqual([]);
          expect(await controlesSobrepostos(page), "sobreposição").toEqual([]);

          if (VIEWPORTS[nome].width < BREAKPOINT_MD) {
            const pequenos = await page.evaluate(() =>
              Array.from(
                document.querySelectorAll<HTMLElement>(
                  "main input:not([type=hidden]):not([type=checkbox]):not([type=radio]), main select, main textarea",
                ),
              )
                .filter((el) => el.getBoundingClientRect().width > 1)
                .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
                .map((el) => el.getAttribute("name") ?? el.id),
            );
            expect(pequenos, "campo com fonte < 16px (CA-E8-44)").toEqual([]);
          }
        });
      }
    });
  }
}

test.describe("@docker navegação por breakpoint (CA-E8-42)", () => {
  test("abaixo de md: BottomNav com 'Mais'; sino sempre visível", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.v360);
    await page.goto("/inicio");
    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button", { name: /Mais/ })).toBeVisible();
    // O sino é um link (vai a /notificacoes), no cabeçalho; abaixo de md a sidebar não existe.
    await expect(
      page
        .locator("header")
        .first()
        .getByRole("link", { name: /Notificações/ }),
    ).toBeVisible();
  });

  test("md: sidebar em ícones com gatilho; lg+: expandida", async ({
    page,
  }) => {
    // A sidebar é uma lista rotulada "Navegação principal" (não um landmark <nav>: o <nav>
    // com esse nome é só o da BottomNav, abaixo de md); localiza-se pelo slot da sidebar.
    const sidebar = page.locator('[data-slot="sidebar"]');
    await page.setViewportSize(VIEWPORTS.v768);
    await page.goto("/inicio");
    await expect(
      page.getByRole("button", { name: "Recolher ou expandir o menu" }),
    ).toBeVisible();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect(
      sidebar.getByRole("link", { name: "Início", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Navegação principal" }),
    ).toBeHidden();
    await page.setViewportSize(VIEWPORTS.v1280);
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    // Com a sidebar aberta o item "Notificações" do menu também é link: o sino é o do cabeçalho.
    await expect(
      page
        .locator("header")
        .first()
        .getByRole("link", { name: /Notificações/ }),
    ).toBeVisible();
  });
});

test.describe("@docker diálogos na área útil (CA-E8-43)", () => {
  for (const tamanho of [
    { width: 360, height: 640 },
    { width: 360, height: 400 },
  ]) {
    test(`/transacoes/nova ${tamanho.width}x${tamanho.height}: menu "Mais" cabe na viewport`, async ({
      page,
    }) => {
      await page.setViewportSize(tamanho);
      await page.goto("/inicio");
      await page
        .getByRole("navigation", { name: "Navegação principal" })
        .getByRole("button", { name: /Mais/ })
        .click();
      const dialogo = page.getByRole("dialog");
      await expect(dialogo).toBeVisible();
      // O Sheet entra com deslizamento de 200 ms (translate-y); a caixa só vale depois de
      // assentar, então se espera (poll) até caber na área útil. Se nunca couber, falha.
      await expect
        .poll(
          async () => {
            const caixa = await dialogo.boundingBox();
            if (!caixa) return "sem caixa";
            if (caixa.y < -1) return `topo cortado (${Math.round(caixa.y)})`;
            if (caixa.y + caixa.height > tamanho.height + 1)
              return `base cortada (${Math.round(caixa.y + caixa.height)})`;
            return "dentro da área útil";
          },
          { message: "menu 'Mais' dentro da área útil (CA-E8-43)" },
        )
        .toBe("dentro da área útil");
      await page.keyboard.press("Escape");
      await expect(dialogo).toHaveCount(0);
    });
  }
});

test.describe("@docker SubNav e gráficos em 360 (CA-E8-47)", () => {
  test("/relatorios: SubNav rola dentro do trilho, sem rolagem da página", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.v360);
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await temRolagemHorizontal(page)).toBe(false);
  });
});
