import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A-1 (Etapa 8, WCAG 2.4.7/1.4.11): o anel de foco usa `--ring` pleno.
// `ring-ring/50` media 2,04:1 no tema claro (mínimo 3:1).
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(tsx?|css)$/.test(nome) && !nome.includes(".test.") ? [caminho] : [];
  });
}

describe("indicador de foco", () => {
  it("nenhum ring/outline usa o token ring com opacidade", () => {
    const raiz = join(process.cwd(), "src");
    const ofensores = arquivos(raiz).filter((f) =>
      /(ring|outline)-ring\/\d+/.test(readFileSync(f, "utf8")),
    );
    expect(ofensores).toEqual([]);
  });
});
