/**
 * Lighthouse (acessibilidade e boas práticas) nas telas públicas, móvel e desktop (CA-E8-62).
 * Roteiro de verificação, não código de aplicação: Lighthouse roda por `pnpm dlx` e nunca entra
 * no package.json (ADR-0032 §3). Resultados em test-results/lighthouse/ (ignorado pelo git).
 *
 *   pnpm lighthouse:publico              build de produção + servidor na porta 3300 + auditorias
 *   pnpm lighthouse:publico --sem-build  reaproveita o .next existente
 *
 * Sem Docker nem Supabase: variáveis públicas fictícias (como o playwright.publico.config.ts).
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PORTA = 3300;
const BASE = `http://localhost:${PORTA}`;
const URLS = ["/login", "/cadastro", "/recuperar-senha", "/offline"];
const FORMATOS = ["mobile", "desktop"] as const;
const SAIDA = join(process.cwd(), "test-results", "lighthouse");

const ambiente = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "chave-publica-ficticia-sem-banco",
  APP_URL: BASE,
};

const nextBin = join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

async function aguardar(url: string, ms = 60_000): Promise<void> {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // servidor ainda subindo
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Servidor não respondeu em ${url}`);
}

async function chromePath(): Promise<string | undefined> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const { chromium } = await import("@playwright/test");
  return chromium.executablePath();
}

async function main(): Promise<void> {
  mkdirSync(SAIDA, { recursive: true });
  if (!process.argv.includes("--sem-build")) {
    console.log("> next build");
    execFileSync(process.execPath, [nextBin, "build"], {
      env: ambiente,
      stdio: "inherit",
    });
  }

  const servidor = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(PORTA)],
    {
      env: ambiente,
      stdio: "inherit",
    },
  );
  const encerrar = () => servidor.kill();
  process.on("exit", encerrar);

  const linhas: string[] = [];
  let falhou = false;
  try {
    await aguardar(`${BASE}/login`);
    const chrome = await chromePath();
    for (const formato of FORMATOS) {
      for (const caminho of URLS) {
        const nome = `${formato}${caminho.replace(/\//g, "-")}`;
        const arquivo = join(SAIDA, `${nome}.json`);
        const args = [
          "dlx",
          "lighthouse",
          `${BASE}${caminho}`,
          "--only-categories=accessibility,best-practices",
          "--output=json",
          `--output-path=${join("test-results", "lighthouse", `${nome}.json`)}`,
          "--chrome-flags=--headless=new --no-sandbox",
          "--quiet",
        ];
        if (formato === "desktop") args.push("--preset=desktop");
        console.log(`> lighthouse ${formato} ${caminho}`);
        // shell no Windows concatena os argumentos: o que tem espaço precisa de aspas.
        const citados = args.map((a) =>
          process.platform === "win32" && /s/.test(a) ? `"${a}"` : a,
        );
        const r = spawnSync("pnpm", citados, {
          env: { ...ambiente, ...(chrome ? { CHROME_PATH: chrome } : {}) },
          stdio: ["ignore", "inherit", "inherit"],
          shell: process.platform === "win32",
        });
        if (r.status !== 0) {
          falhou = true;
          linhas.push(
            `${formato.padEnd(8)} ${caminho.padEnd(18)} ERRO (status ${r.status})`,
          );
          continue;
        }
        const rel = JSON.parse(readFileSync(arquivo, "utf8"));
        const nota = (c: string) =>
          Math.round((rel.categories[c]?.score ?? 0) * 100);
        const reprovadas = Object.values(
          rel.audits as Record<
            string,
            { id: string; score: number | null; scoreDisplayMode: string }
          >,
        )
          .filter(
            (a) =>
              a.score !== null &&
              a.score < 1 &&
              a.scoreDisplayMode !== "informative",
          )
          .map((a) => a.id);
        if (nota("accessibility") < 100) falhou = true;
        linhas.push(
          `${formato.padEnd(8)} ${caminho.padEnd(18)} a11y ${nota("accessibility")}  boas-práticas ${nota("best-practices")}  v${rel.lighthouseVersion}  reprovadas: ${reprovadas.join(", ") || "-"}`,
        );
      }
    }
  } finally {
    encerrar();
  }

  console.log("\nResumo Lighthouse (critério: acessibilidade = 100)");
  for (const l of linhas) console.log(l);
  process.exitCode = falhou ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
