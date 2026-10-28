import { expect, test, type Page } from "@playwright/test";

import { auditar, resumir } from "../helpers/a11y";
import { fixarTema } from "../helpers/tema";
import { TEMAS } from "../helpers/viewports";

/**
 * CA-E8-20 (pular para o conteúdo), CA-E8-24 (teclado) e CA-E8-25 (foco visível e não
 * obscurecido) nas telas sem banco.
 */
const ROTAS_COM_MAIN = ["/login", "/cadastro", "/recuperar-senha", "/offline"];
const LIMITE_DE_TABS = 30;

type Foco = {
  descricao: string;
  visivelNaViewport: boolean;
  centroLivre: boolean;
  cobertoPor: string | null;
  contrasteDoAnel: number | null;
  origemDoAnel: string;
};

/** Mede, no elemento focado, se o centro está livre e qual o contraste do indicador de foco. */
async function medirFoco(page: Page): Promise<Foco | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) {
      return null;
    }
    const nomeCurto = (n: Element) =>
      `${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${
        n.getAttribute("aria-label") ? `[${n.getAttribute("aria-label")}]` : ""
      }`;

    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const visivelNaViewport =
      cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
    const topo = visivelNaViewport ? document.elementFromPoint(cx, cy) : null;
    const centroLivre = !!topo && (el.contains(topo) || topo.contains(el));

    // Resolve qualquer cor CSS (oklch, color-mix...) para sRGB por um canvas.
    const ctx = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true })!;
    type Rgba = [number, number, number, number];
    const rgba = (css: string): Rgba => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    type Rgb = [number, number, number];
    const sobre = (c: Rgba, base: Rgb): Rgb => [
      c[0] * c[3] + base[0] * (1 - c[3]),
      c[1] * c[3] + base[1] * (1 - c[3]),
      c[2] * c[3] + base[2] * (1 - c[3]),
    ];
    const lum = ([r, g, b]: Rgb) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const razao = (a: Rgb, b: Rgb) => {
      const [la, lb] = [lum(a), lum(b)];
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };

    // Fundo efetivo atrás do elemento: compõe as camadas de baixo para cima.
    const camadas: Rgba[] = [];
    for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) camadas.push(c);
    }
    let fundo: Rgb = [255, 255, 255];
    for (const c of camadas.reverse()) fundo = sobre(c, fundo);

    const cs = getComputedStyle(el);
    const candidatos: { origem: string; css: string }[] = [];
    if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) {
      candidatos.push({ origem: "outline", css: cs.outlineColor });
    }

    // box-shadow computado: sombras separadas por vírgula no nível zero de parênteses.
    const sombras: string[] = [];
    let nivel = 0;
    let atual = "";
    for (const ch of cs.boxShadow) {
      if (ch === "(") nivel++;
      if (ch === ")") nivel--;
      if (ch === "," && nivel === 0) {
        sombras.push(atual.trim());
        atual = "";
      } else atual += ch;
    }
    if (atual.trim()) sombras.push(atual.trim());
    for (const s of sombras) {
      if (s === "none" || /\binset\b/.test(s)) continue;
      const cor = s.match(/[a-z-]+\([^)]*\)/i)?.[0];
      if (!cor) continue;
      const numeros = s
        .replace(cor, "")
        .trim()
        .split(/\s+/)
        .map((t) => parseFloat(t));
      const espalhamento = numeros[3] ?? 0; // x y blur spread
      if (espalhamento > 0) candidatos.push({ origem: "box-shadow", css: cor });
    }
    candidatos.push({ origem: "border", css: cs.borderTopColor });

    let melhor: number | null = null;
    let origem = "nenhum";
    for (const c of candidatos) {
      const cor = rgba(c.css);
      if (cor[3] === 0) continue;
      const r = razao(sobre(cor, fundo), fundo);
      if (melhor === null || r > melhor) {
        melhor = r;
        origem = c.origem;
      }
    }

    return {
      descricao: nomeCurto(el),
      visivelNaViewport,
      centroLivre,
      cobertoPor: !centroLivre && topo ? nomeCurto(topo) : null,
      contrasteDoAnel: melhor,
      origemDoAnel: origem,
    };
  });
}

const assinaturaDoFoco = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return null;
    return `${a.tagName.toLowerCase()}#${a.id}|${(a.getAttribute("aria-label") ?? a.textContent ?? "").trim().slice(0, 30)}|${a.getAttribute("href") ?? ""}`;
  });

test.describe("pular para o conteúdo (CA-E8-20)", () => {
  for (const rota of ROTAS_COM_MAIN) {
    test(`${rota}: primeiro Tab foca o link, visível só com foco; Enter leva a main#conteudo`, async ({
      page,
    }) => {
      await page.goto(rota);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const link = page.getByRole("link", { name: "Pular para o conteúdo" });
      await expect(link).toHaveCount(1);
      // Antes do foco: sr-only, sem área visível.
      const antes = await link.boundingBox();
      expect(
        !antes || antes.width <= 1 || antes.height <= 1,
        "visível sem foco",
      ).toBe(true);

      await page.keyboard.press("Tab");
      await expect(link).toBeFocused();
      const depois = await link.boundingBox();
      expect(depois, "visível com foco").not.toBeNull();
      expect(depois!.height, "alvo ≥ 40px").toBeGreaterThanOrEqual(40);
      expect(depois!.x).toBeGreaterThanOrEqual(0);
      expect(depois!.y).toBeGreaterThanOrEqual(0);

      await page.keyboard.press("Enter");
      const destino = await page.evaluate(() => {
        const a = document.activeElement;
        return {
          id: a?.id ?? null,
          tag: a?.tagName.toLowerCase() ?? null,
          tabindex: a?.getAttribute("tabindex") ?? null,
        };
      });
      expect(destino).toEqual({ id: "conteudo", tag: "main", tabindex: "-1" });
    });
  }
});

test.describe("foco visível e não obscurecido (CA-E8-25)", () => {
  for (const tema of TEMAS) {
    for (const rota of ROTAS_COM_MAIN) {
      test(`${rota} (${tema}): cada parada do Tab tem anel ≥ 3:1 e centro livre`, async ({
        page,
      }, testInfo) => {
        await fixarTema(page, tema);
        await page.goto(rota);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (rota !== "/offline") {
          // espera hidratar (os botões de envio nascem desabilitados)
          await expect(
            page.getByRole("button", {
              name: /^(Entrar|Criar conta|Enviar link)$/,
            }),
          ).toBeEnabled();
        }

        const paradas: Foco[] = [];
        const vistos = new Set<string>();
        for (let i = 0; i < LIMITE_DE_TABS; i++) {
          await page.keyboard.press("Tab");
          await page.waitForTimeout(280); // transição do anel
          const assinatura = await assinaturaDoFoco(page);
          if (assinatura === null || vistos.has(assinatura)) break;
          vistos.add(assinatura);
          const foco = await medirFoco(page);
          if (foco) paradas.push(foco);
        }
        expect(paradas.length, "ao menos duas paradas").toBeGreaterThan(1);

        const problemas: string[] = [];
        for (const p of paradas) {
          if (!p.visivelNaViewport) {
            problemas.push(`${p.descricao}: centro fora da viewport`);
          } else if (!p.centroLivre) {
            problemas.push(
              `${p.descricao}: centro coberto por ${p.cobertoPor}`,
            );
          }
          if (p.contrasteDoAnel === null || p.contrasteDoAnel < 3) {
            problemas.push(
              `${p.descricao}: anel ${p.contrasteDoAnel?.toFixed(2) ?? "ausente"}:1 (${p.origemDoAnel}) < 3:1`,
            );
          }
        }
        await testInfo.attach("paradas-de-foco", {
          body: JSON.stringify(paradas, null, 2),
          contentType: "application/json",
        });
        expect(problemas, problemas.join("\n")).toEqual([]);
      });
    }
  }
});

test.describe("teclado sem armadilha (CA-E8-24)", () => {
  for (const rota of ROTAS_COM_MAIN) {
    test(`${rota}: Tab percorre, Shift+Tab volta, sem prender o foco`, async ({
      page,
    }) => {
      await page.goto(rota);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const ordem: string[] = [];
      for (let i = 0; i < LIMITE_DE_TABS; i++) {
        await page.keyboard.press("Tab");
        const d = await assinaturaDoFoco(page);
        if (d === null || ordem.includes(d)) break;
        ordem.push(d);
      }
      expect(ordem.length).toBeGreaterThan(1);
      expect(
        ordem.length,
        "não terminou dentro do limite: armadilha de foco?",
      ).toBeLessThan(LIMITE_DE_TABS);
      // Ordem inversa: de um ponto conhecido (3a parada), Shift+Tab volta para a 2a.
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const n = Math.min(ordem.length, 3); // /offline tem só duas paradas
      for (let i = 0; i < n; i++) await page.keyboard.press("Tab");
      expect(await assinaturaDoFoco(page)).toBe(ordem[n - 1]);
      await page.keyboard.press("Shift+Tab");
      expect(await assinaturaDoFoco(page)).toBe(ordem[n - 2]);
    });
  }

  test("/login: menu de tema abre com Enter, Esc fecha e devolve o foco ao gatilho", async ({
    page,
  }) => {
    await page.goto("/login");
    const gatilho = page.getByRole("button", { name: "Alterar tema" });
    await gatilho.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    for (const nome of ["Claro", "Escuro", "Sistema"]) {
      await expect(page.getByRole("menuitem", { name: nome })).toBeVisible();
    }
    const resultado = await auditar(page, { incluir: "[role=menu]" });
    expect(
      resultado.bloqueantes.length,
      resumir(resultado.bloqueantes).join("\n"),
    ).toBe(0);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(gatilho).toBeFocused();
  });

  test("/login: escolhe Escuro só com teclado e aplica .dark", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Alterar tema" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.getByRole("menuitem", { name: "Escuro" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
