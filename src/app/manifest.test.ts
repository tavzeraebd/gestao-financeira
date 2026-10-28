// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const root = process.cwd();
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");

/** Valor de `--<token>` dentro do bloco do seletor (`:root` ou `.dark`). */
function token(selector: string, name: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `bloco ${selector}`).toBeGreaterThan(-1);
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);
  const match = block.match(
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`),
  );
  expect(match, `--${name} em ${selector}`).not.toBeNull();
  return match![1]!.toLowerCase();
}

describe("manifest (CA-E8-01)", () => {
  const m = manifest();

  it("declara identidade, escopo e exibição", () => {
    expect(m).toMatchObject({
      id: "/",
      name: "Núcleo",
      short_name: "Núcleo",
      lang: "pt-BR",
      dir: "ltr",
      scope: "/",
      start_url: "/inicio",
      display: "standalone",
      categories: ["finance"],
    });
    expect(m.description).toBeTruthy();
  });

  it("não trava a orientação (WCAG 1.3.4)", () => {
    expect(m).not.toHaveProperty("orientation");
  });

  it("tem ícones 192 e 512 (any) e 512 (maskable) em /icons/", () => {
    expect(m.icons).toEqual([
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
  });
});

describe("cores do PWA iguais aos tokens de globals.css (CA-E8-02)", () => {
  const m = manifest();

  it("manifest: background_color = --background e theme_color = --primary (claro)", () => {
    expect(m.background_color).toBe(token(":root", "background"));
    expect(m.theme_color).toBe(token(":root", "primary"));
  });

  it("viewport: themeColor claro = --background claro e escuro = --background escuro", () => {
    const light = layout.match(
      /media:\s*"\(prefers-color-scheme: light\)",\s*color:\s*"(#[0-9a-fA-F]+)"/,
    );
    const dark = layout.match(
      /media:\s*"\(prefers-color-scheme: dark\)",\s*color:\s*"(#[0-9a-fA-F]+)"/,
    );
    expect(light?.[1]?.toLowerCase()).toBe(token(":root", "background"));
    expect(dark?.[1]?.toLowerCase()).toBe(token(".dark", "background"));
  });

  it("viewport não tem maximumScale nem userScalable (WCAG 1.4.4) e usa viewportFit cover", () => {
    expect(layout).toContain('viewportFit: "cover"');
    expect(layout).not.toMatch(/maximumScale|userScalable/);
  });
});
