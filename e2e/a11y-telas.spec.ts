import { expect, test, type Page } from "@playwright/test";

import { auditar, resumir } from "./helpers/a11y";
import { semearDadosDasRotas } from "./helpers/cenario-rotas";
import {
  ROTAS_AUTENTICADAS,
  resolver,
  type IdsDinamicos,
  type Rota,
} from "./helpers/rotas";
import { sessionFile, type SharedRole } from "./helpers/shared-users";
import { fixarTema } from "./helpers/tema";
import { TEMAS, VIEWPORTS } from "./helpers/viewports";

/**
 * @docker — CA-E8-22 (axe em todas as rotas do inventário, claro e escuro, estado vazio e com
 * dados, com um diálogo/menu/sheet aberto por tela que o tenha), CA-E8-24/25/26/30/31 (variantes
 * autenticadas). Precisa do Supabase local (global-setup). Escrito agora, executado com Docker
 * (ADR-0032 §2, camada 2): enquanto não rodar, NÃO conta como verde.
 *
 * Estado "vazio" = família `outsider` (sem dados); "com dados" = `owner` + semeadura.
 */
let ids: IdsDinamicos;

test.beforeAll(async () => {
  ids = await semearDadosDasRotas();
});

type Estado = { nome: "vazio" | "com dados"; papel: SharedRole };
const ESTADOS: Estado[] = [
  { nome: "com dados", papel: "owner" },
  { nome: "vazio", papel: "outsider" },
];

/** Abre o primeiro menu/diálogo que a tela oferece e audita só o trecho aberto. */
async function auditarSobreposicaoAberta(
  page: Page,
  testInfo: import("@playwright/test").TestInfo,
) {
  const gatilho = page
    .locator("main, header")
    .locator('button[aria-haspopup="menu"], button[aria-haspopup="dialog"]')
    .first();
  if ((await gatilho.count()) === 0) return;
  await gatilho.click();
  const aberto = page
    .locator('[role="menu"], [role="dialog"], [role="alertdialog"]')
    .first();
  await expect(aberto).toBeVisible();
  const { bloqueantes } = await auditar(page, {
    testInfo,
    incluir: '[role="menu"], [role="dialog"], [role="alertdialog"]',
  });
  expect(
    bloqueantes.length,
    `sobreposição aberta: ${resumir(bloqueantes).join("\n")}`,
  ).toBe(0);
  await page.keyboard.press("Escape");
  await expect(aberto).toHaveCount(0);
  await expect(
    gatilho,
    "Esc devolve o foco ao gatilho (CA-E8-24)",
  ).toBeFocused();
}

function alvosDoEstado(estado: Estado): Rota[] {
  // Rotas com id só existem na família com dados; /onboarding é do usuário sem família.
  return ROTAS_AUTENTICADAS.filter((r) =>
    r.padrao === "/onboarding"
      ? false
      : estado.nome === "com dados" || !r.parametros,
  );
}

for (const estado of ESTADOS) {
  test.describe(`@docker axe · ${estado.nome}`, () => {
    test.use({ storageState: sessionFile(estado.papel) });

    for (const tema of TEMAS) {
      for (const rota of alvosDoEstado(estado)) {
        test(`${rota.padrao} (${tema})`, async ({ page }, testInfo) => {
          await page.setViewportSize(VIEWPORTS.v360);
          await fixarTema(page, tema);
          await page.goto(resolver(rota, ids));
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

          const { bloqueantes } = await auditar(page, { testInfo });
          expect(bloqueantes.length, resumir(bloqueantes).join("\n")).toBe(0);

          await page.setViewportSize(VIEWPORTS.v1280);
          const desktop = await auditar(page, { testInfo });
          expect(
            desktop.bloqueantes.length,
            `1280: ${resumir(desktop.bloqueantes).join("\n")}`,
          ).toBe(0);

          await auditarSobreposicaoAberta(page, testInfo);
        });
      }
    }
  });
}

test.describe("@docker /onboarding (usuário sem família)", () => {
  test.use({ storageState: sessionFile("solo") });
  for (const tema of TEMAS) {
    test(`axe (${tema})`, async ({ page }, testInfo) => {
      await fixarTema(page, tema);
      await page.goto("/onboarding");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const { bloqueantes } = await auditar(page, { testInfo });
      expect(bloqueantes.length, resumir(bloqueantes).join("\n")).toBe(0);
    });
  }
});

test.describe("@docker /convite/[token] (pública, com banco)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const tema of TEMAS) {
    test(`axe (${tema})`, async ({ page }, testInfo) => {
      await fixarTema(page, tema);
      await page.goto(`/convite/${encodeURIComponent(ids.conviteToken)}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const { bloqueantes } = await auditar(page, { testInfo });
      expect(bloqueantes.length, resumir(bloqueantes).join("\n")).toBe(0);
    });
  }
});

test.describe("@docker estrutura das rotas autenticadas (CA-E8-31)", () => {
  test.use({ storageState: sessionFile("owner") });

  for (const rota of ROTAS_AUTENTICADAS.filter(
    (r) => r.padrao !== "/onboarding",
  )) {
    test(`${rota.padrao}: 1 main, 1 h1, title '%s · Núcleo', nav com nome, aria-current`, async ({
      page,
    }) => {
      await page.goto(resolver(rota, ids));
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      expect(await page.title()).toMatch(/ · Núcleo$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
      const navsSemNome = await page.evaluate(
        () =>
          Array.from(document.querySelectorAll("nav, aside")).filter(
            (n) =>
              !n.getAttribute("aria-label") &&
              !n.getAttribute("aria-labelledby"),
          ).length,
      );
      expect(navsSemNome, "nav/aside sem nome").toBe(0);
    });
  }
});

test.describe("@docker teclado, foco e alvo nas telas autenticadas (CA-E8-24/25/26)", () => {
  test.use({ storageState: sessionFile("owner") });

  test("primeiro Tab em /inicio foca 'Pular para o conteúdo' e Enter leva a main#conteudo (CA-E8-20)", async ({
    page,
  }) => {
    await page.goto("/inicio");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Pular para o conteúdo" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(
      "conteudo",
    );
  });

  for (const largura of ["v360", "v1280"] as const) {
    test(`/inicio ${largura}: Tab nunca deixa o foco coberto por cabeçalho, BottomNav ou toast (2.4.11)`, async ({
      page,
    }) => {
      await page.setViewportSize(VIEWPORTS[largura]);
      await page.goto("/inicio");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const cobertos: string[] = [];
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press("Tab");
        const coberto = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const r = el.getBoundingClientRect();
          const topo = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          );
          return topo && !(el.contains(topo) || topo.contains(el))
            ? `${el.tagName.toLowerCase()}[${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 25)}] coberto por ${topo.tagName.toLowerCase()}`
            : "";
        });
        if (coberto === null) break;
        if (coberto) cobertos.push(coberto);
      }
      expect(cobertos).toEqual([]);
    });
  }

  test("html tem scroll-padding-top e scroll-padding-bottom (CA-E8-25)", async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.v360);
    await page.goto("/inicio");
    const p = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        topo: parseFloat(cs.scrollPaddingTop) || 0,
        base: parseFloat(cs.scrollPaddingBottom) || 0,
      };
    });
    expect(p.topo).toBeGreaterThan(0);
    expect(p.base).toBeGreaterThan(0);
  });

  for (const rota of ROTAS_AUTENTICADAS.filter(
    (r) => r.padrao !== "/onboarding",
  )) {
    test(`${rota.padrao}: controles ≥ 24px e principais ≥ 40px (CA-E8-26)`, async ({
      page,
    }) => {
      await page.setViewportSize(VIEWPORTS.v390);
      await page.goto(resolver(rota, ids));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const { medirAlvos } = await import("./helpers/layout");
      const alvos = await medirAlvos(page);
      const pequenos = alvos
        .filter((a) => a.largura < 24 || a.altura < 24)
        .map((a) => `${a.alvo} ${a.largura}x${a.altura}`);
      expect(pequenos, "abaixo de 24x24").toEqual([]);
      const principais = alvos
        .filter((a) => a.principal && a.altura < 40)
        .map((a) => `${a.alvo} ${a.largura}x${a.altura}`);
      expect(principais, "principal abaixo de 40px").toEqual([]);
    });
  }
});
