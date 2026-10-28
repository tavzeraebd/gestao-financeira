import type { Page } from "@playwright/test";

/** Medições de layout feitas dentro da página (sem dependência de componente). */

export const temRolagemHorizontal = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );

/** Elementos visíveis cuja borda direita ou esquerda sai da viewport (conteúdo cortado). */
export async function elementosForaDaViewport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const largura = document.documentElement.clientWidth;
    const fora: string[] = [];
    for (const el of Array.from(
      document.body.querySelectorAll<HTMLElement>("*"),
    )) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue; // sr-only e vazios
      // Região com rolagem interna ou ancestral que recorta é responsável por si mesma.
      let recortado = false;
      for (
        let p = el.parentElement;
        p && p !== document.body;
        p = p.parentElement
      ) {
        const o = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) {
          recortado = true;
          break;
        }
      }
      if (recortado) continue;
      if (r.right > largura + 1 || r.left < -1) {
        fora.push(
          `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${(el.textContent ?? "").trim().slice(0, 30)}" [${Math.round(r.left)}..${Math.round(r.right)}] > ${largura}`,
        );
      }
    }
    return fora.slice(0, 10);
  });
}

/**
 * Controles interativos visíveis que se sobrepõem parcialmente (nenhum contém o outro).
 *
 * Barras fixas (`position: fixed|sticky`, ex.: BottomNav e cabeçalho) flutuam por cima do
 * conteúdo que rola por baixo delas; isso é desenho, não defeito, e sobrepor o conteúdo que
 * está fora do repouso da rolagem não pode reprovar a tela (falso positivo da CI 40656905334:
 * 113 casos, todos contra a BottomNav, sempre em controles abaixo da dobra). O que a barra NÃO
 * pode é cobrir conteúdo em repouso. Por isso o par barra x conteúdo é avaliado só onde a
 * barra deve estar livre: barra ancorada no topo, com a página no topo; barra ancorada na
 * base, com a página rolada até o fim (o conteúdo precisa ter folga para ela, ex.: `pb-28`).
 * Os demais pares (conteúdo x conteúdo, barra x barra) são avaliados com a página no topo,
 * como antes, e qualquer sobreposição visível entre conteúdos continua reprovando.
 */
export async function controlesSobrepostos(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const SELETOR =
      "a[href], button, input:not([type=hidden]), select, textarea, [role=button]";
    const nome = (e: Element) =>
      `${e.tagName.toLowerCase()}[${(e.getAttribute("aria-label") ?? e.textContent ?? e.getAttribute("name") ?? "").trim().slice(0, 25)}]`;

    const barraDe = (el: HTMLElement): HTMLElement | null => {
      for (
        let p: HTMLElement | null = el;
        p && p !== document.body;
        p = p.parentElement
      ) {
        const pos = getComputedStyle(p).position;
        if (pos === "fixed" || pos === "sticky") return p;
      }
      return null;
    };

    type Item = {
      el: HTMLElement;
      r: DOMRect;
      barra: HTMLElement | null;
      ancora: "topo" | "base" | null;
    };
    const medir = (): Item[] =>
      Array.from(document.querySelectorAll<HTMLElement>(SELETOR))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ el, r }) => {
          const cs = getComputedStyle(el);
          return (
            r.width > 1 &&
            r.height > 1 &&
            cs.visibility !== "hidden" &&
            cs.display !== "none"
          );
        })
        .map(({ el, r }) => {
          const barra = barraDe(el);
          const rb = barra?.getBoundingClientRect();
          return {
            el,
            r,
            barra,
            ancora: rb
              ? rb.top + rb.height / 2 < window.innerHeight / 2
                ? ("topo" as const)
                : ("base" as const)
              : null,
          };
        });

    const rolarPara = (y: number) => {
      window.scrollTo({ top: y, left: 0, behavior: "instant" });
    };
    const sobrepoe = (a: Item, b: Item): string | null => {
      if (a.el.contains(b.el) || b.el.contains(a.el)) return null;
      // Botão embutido no campo (ex.: mostrar senha): irmãos no mesmo invólucro, por desenho.
      const campoEBotao =
        (a.el.tagName === "INPUT" && b.el.tagName === "BUTTON") ||
        (b.el.tagName === "INPUT" && a.el.tagName === "BUTTON");
      if (campoEBotao && a.el.parentElement === b.el.parentElement) return null;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      return w > 2 && h > 2
        ? `${nome(a.el)} x ${nome(b.el)} (${Math.round(w)}x${Math.round(h)})`
        : null;
    };

    const problemas: string[] = [];
    const inicio = window.scrollY;

    // Passo 1: página no topo. Barra x conteúdo só conta para barra ancorada no topo.
    rolarPara(0);
    const noTopo = medir();
    for (let i = 0; i < noTopo.length; i++) {
      for (let j = i + 1; j < noTopo.length; j++) {
        const a = noTopo[i]!;
        const b = noTopo[j]!;
        const umaBarraSo = (a.barra === null) !== (b.barra === null);
        if (umaBarraSo && (a.ancora ?? b.ancora) === "base") continue;
        const achado = sobrepoe(a, b);
        if (achado) problemas.push(achado);
      }
    }

    // Passo 2: página rolada até o fim. Conteúdo x barra ancorada na base não pode se tocar.
    rolarPara(document.documentElement.scrollHeight);
    const noFim = medir();
    for (const barraItem of noFim.filter((i) => i.ancora === "base")) {
      for (const conteudo of noFim.filter((i) => i.barra === null)) {
        const achado = sobrepoe(conteudo, barraItem);
        if (achado) problemas.push(`${achado} [no fim da rolagem]`);
      }
    }

    rolarPara(inicio);
    return problemas.slice(0, 20);
  });
}

export type MedidaDeAlvo = {
  alvo: string;
  largura: number;
  altura: number;
  principal: boolean;
};

/**
 * Tamanho dos controles interativos visíveis. `principal` = campo, botão ou link em bloco dentro
 * de `main` (o piso do projeto é 40px; o de WCAG 2.5.8 é 24px). Links dentro de texto corrido
 * (inline em parágrafo) são exceção do próprio critério.
 */
export async function medirAlvos(page: Page): Promise<MedidaDeAlvo[]> {
  return page.evaluate(() => {
    const itens = Array.from(
      document.querySelectorAll<HTMLElement>(
        "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=menuitem], [role=checkbox], [role=switch], [role=tab]",
      ),
    );
    const saida: MedidaDeAlvo[] = [];
    for (const el of itens) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue; // sr-only (ex.: skip link sem foco)
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const noTextoCorrido =
        el.tagName === "A" &&
        cs.display === "inline" &&
        !!el.closest("p, li, span, small");
      if (noTextoCorrido) continue;
      saida.push({
        alvo: `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? el.getAttribute("name") ?? "").trim().slice(0, 30)}"`,
        largura: Math.round(r.width),
        altura: Math.round(r.height),
        principal: !!el.closest("main"),
      });
    }
    return saida;
  });
}
