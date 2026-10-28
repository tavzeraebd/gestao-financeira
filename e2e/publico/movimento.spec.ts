import { expect, test, type Page } from "@playwright/test";

/**
 * CA-E8-28: com prefers-reduced-motion: reduce não há transição nem animação de entrada/saída
 * (inclui o menu de tema, que usa tw-animate-css), nem scroll-behavior: smooth. O `animate-spin`
 * de carregamento é a única exceção e sempre vem com texto.
 */
const TOLERANCIA_S = 0.001;

async function movimentoRestante(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ tolerancia }) => {
      const emS = (lista: string) =>
        lista
          .split(",")
          .map((t) => t.trim())
          .map((t) =>
            t.endsWith("ms") ? parseFloat(t) / 1000 : parseFloat(t),
          );
      const achados: string[] = [];
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>("body *, html"),
      )) {
        if (
          el.classList.contains("animate-spin") ||
          el.closest(".animate-spin")
        )
          continue;
        const cs = getComputedStyle(el);
        const anim =
          cs.animationName !== "none"
            ? Math.max(...emS(cs.animationDuration))
            : 0;
        const trans = Math.max(...emS(cs.transitionDuration));
        const rotulo = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).toString().slice(0, 50)}`;
        if (anim > tolerancia) achados.push(`animação ${anim}s em ${rotulo}`);
        if (trans > tolerancia)
          achados.push(`transição ${trans}s em ${rotulo}`);
      }
      return achados.slice(0, 12);
    },
    { tolerancia: TOLERANCIA_S },
  );
}

test.describe("prefers-reduced-motion (CA-E8-28)", () => {
  test.use({ reducedMotion: "reduce" });

  test("/login: sem transição nem animação e sem scroll suave", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await movimentoRestante(page)).toEqual([]);
    const scroll = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    );
    expect(scroll).not.toBe("smooth");
  });

  test("/login: menu de tema aberto (animação de entrada do tw-animate-css) sem movimento", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Alterar tema" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    expect(await movimentoRestante(page)).toEqual([]);
  });

  test("/offline: sem transição nem animação", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await movimentoRestante(page)).toEqual([]);
  });
});

test.describe("controle negativo (sem a preferência)", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a transição existe: o teste detecta movimento quando ele está lá", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Estilo computado (não depende de animação em curso): o botão de tema, sempre presente,
    // tem transition-duration > 0 sem a preferência. Em polling, para esperar o CSS aplicado.
    const botao = page.getByRole("button", { name: "Alterar tema" });
    await expect(botao).toBeVisible();
    await expect
      .poll(
        () =>
          botao.evaluate((el) => {
            const durs = getComputedStyle(el)
              .transitionDuration.split(",")
              .map((t) => t.trim())
              .map((t) =>
                t.endsWith("ms") ? parseFloat(t) / 1000 : parseFloat(t),
              );
            return Math.max(...durs);
          }),
        { message: "sem a preferência o botão de tema tem transição" },
      )
      .toBeGreaterThan(TOLERANCIA_S);
    // E o detector geral enxerga esse movimento.
    await expect
      .poll(async () => (await movimentoRestante(page)).length, {
        message: "sem a preferência há transições",
      })
      .toBeGreaterThan(0);
  });
});
