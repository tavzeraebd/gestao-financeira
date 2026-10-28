import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import type { AxeResults, Result } from "axe-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Marcas WCAG da ADR-0032 §4 (WCAG 2.2 AA). */
export const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

/** Regras de nome, rótulo, papel e landmark: qualquer violação reprova, seja qual for o impacto. */
const REGRA_ESTRUTURAL =
  /(^|-)(name|label|role|roles|landmark|alt|title|lang)(-|$)|^aria-|^landmark-|^label|^region$/;

export type AchadoAxe = {
  id: string;
  impacto: string;
  descricao: string;
  ajuda: string;
  url: string;
  nos: { alvo: string; html: string; resumo: string }[];
};

export type ResultadoAuditoria = {
  /** Reprova: `serious`/`critical` ou regra de nome/rótulo/papel/landmark. */
  bloqueantes: AchadoAxe[];
  /** `moderate`/`minor` e "incomplete": vão para o log com decisão (ADR-0032 §4). */
  restante: AchadoAxe[];
};

function paraAchado(r: Result): AchadoAxe {
  return {
    id: r.id,
    impacto: r.impact ?? "n/d",
    descricao: r.description,
    ajuda: r.help,
    url: r.helpUrl,
    nos: r.nodes.slice(0, 8).map((n) => ({
      alvo: n.target.join(" "),
      html: n.html.slice(0, 200),
      resumo: (n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 300),
    })),
  };
}

export function classificar(resultados: AxeResults): ResultadoAuditoria {
  const bloqueantes: AchadoAxe[] = [];
  const restante: AchadoAxe[] = [];
  for (const v of resultados.violations) {
    const grave = v.impact === "serious" || v.impact === "critical";
    (grave || REGRA_ESTRUTURAL.test(v.id) ? bloqueantes : restante).push(
      paraAchado(v),
    );
  }
  for (const i of resultados.incomplete) {
    restante.push({
      ...paraAchado(i),
      impacto: `incomplete (${i.impact ?? "n/d"})`,
    });
  }
  return { bloqueantes, restante };
}

/**
 * Espera a página parar de se mexer antes de medir: botões de envio nascem desabilitados até
 * hidratar e animam a cor ao habilitar; axe medido no meio da transição dá contraste falso.
 */
export async function estabilizar(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => !document.querySelector("button[type=submit][disabled]"),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((a) => a.finished.catch(() => undefined)),
    ),
  );
  await page.waitForTimeout(100);
}

/**
 * Audita a página aberta com axe-core (WCAG 2.2 AA). Devolve o que reprova e o que vai para o
 * log; quando recebe `testInfo`, grava o JSON completo em `test-results/a11y/` para a lista de
 * achados de `docs/log-execucao.md`.
 */
export async function auditar(
  page: Page,
  opcoes: {
    testInfo?: TestInfo;
    /** Seletores a excluir (ex.: componente de terceiros já justificado no log). */
    excluir?: string[];
    /** Restringe a auditoria a um trecho (ex.: um diálogo aberto). */
    incluir?: string;
  } = {},
): Promise<ResultadoAuditoria> {
  await estabilizar(page);
  let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  if (opcoes.incluir) builder = builder.include(opcoes.incluir);
  for (const seletor of opcoes.excluir ?? [])
    builder = builder.exclude(seletor);

  const resultados = await builder.analyze();
  const resultado = classificar(resultados);

  if (opcoes.testInfo) {
    const pasta = join(process.cwd(), "test-results", "a11y");
    mkdirSync(pasta, { recursive: true });
    const nome = opcoes.testInfo.titlePath
      .join("__")
      .replace(/[^a-zA-Z0-9À-ÿ._-]+/g, "_")
      .slice(0, 180);
    writeFileSync(
      join(pasta, `${opcoes.testInfo.project.name}__${nome}.json`),
      JSON.stringify(
        {
          url: page.url(),
          projeto: opcoes.testInfo.project.name,
          ...resultado,
        },
        null,
        2,
      ),
    );
  }
  return resultado;
}

/** Texto curto para a mensagem de falha do `expect`. */
export function resumir(achados: AchadoAxe[]): string[] {
  return achados.map(
    (a) =>
      `${a.id} [${a.impacto}] x${a.nos.length}: ${a.nos
        .map((n) => n.alvo)
        .slice(0, 3)
        .join(" | ")}`,
  );
}
