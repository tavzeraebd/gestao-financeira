/**
 * Gate de segurança portátil (ADR-0039 §3): roda no CI e em qualquer máquina com Node 24, sem
 * ferramenta de terceiros instalada (gitleaks, trivy) e sem dependência nova.
 *
 *   pnpm security:check            todas as verificações (inclui `pnpm audit`, precisa de rede)
 *   pnpm security:check --sem-audit  pula o `pnpm audit` (execução offline)
 *
 * Código de saída: 0 = passa; 1 = há achado (arquivo:linha impressos); 2 = incompleto (não foi
 * possível rodar o `pnpm audit` ou ler a lista de arquivos versionados). Incompleto não é sucesso.
 *
 * Não substitui o gate pessoal da fábrica (`~/.claude/factory/security/gate.mjs`), que continua
 * obrigatório antes de relatar sucesso. As funções `verificar*` são puras (recebem os arquivos) e
 * são cobertas por tests/ci/security-checks.test.ts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

export type Arquivo = { caminho: string; conteudo: string };
export type Achado = {
  verificacao: string;
  arquivo: string;
  linha: number;
  mensagem: string;
};
export type ExcecaoDeps = { pacote: string; ate: string; motivo: string };

const ehTeste = (caminho: string) =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(caminho);
const emSrc = (caminho: string) => caminho.startsWith("src/");
const codigoFonte = (caminho: string) =>
  /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(caminho);

function linhas(conteudo: string): string[] {
  return conteudo.split(/\r?\n/);
}

// ---------------------------------------------------------------------------------------------
// (a) segredos versionados
// ---------------------------------------------------------------------------------------------

type PadraoSegredo = { regra: string; regex: RegExp };

const PADROES_SEGREDO: PadraoSegredo[] = [
  { regra: "supabase-secret-key", regex: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { regra: "supabase-access-token", regex: /\bsbp_[a-f0-9]{40}\b/ },
  {
    regra: "private-key",
    regex: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY(?: BLOCK)?-----/,
  },
  { regra: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { regra: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
];

const REGEX_JWT =
  /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;

function jwtServiceRole(trecho: string): boolean {
  for (const m of trecho.matchAll(REGEX_JWT)) {
    try {
      const payload = JSON.parse(
        Buffer.from(m[1] ?? "", "base64url").toString("utf8"),
      );
      if (payload && payload.role === "service_role") return true;
    } catch {
      // não é JWT válido
    }
  }
  return false;
}

/** Linhas ignoradas do `.gitleaksignore`: `[commit:]arquivo:regra:linha`. */
export type IgnoradoGitleaks = { arquivo: string; linha: number };

export function lerGitleaksIgnore(conteudo: string): IgnoradoGitleaks[] {
  const saida: IgnoradoGitleaks[] = [];
  for (const bruta of linhas(conteudo)) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith("#")) continue;
    const partes = linha.split(":");
    // commit:arquivo:regra:linha  ou  arquivo:regra:linha
    const numero = Number(partes[partes.length - 1]);
    const arquivo = partes.length >= 4 ? partes[1] : partes[0];
    if (arquivo && Number.isInteger(numero))
      saida.push({ arquivo, linha: numero });
  }
  return saida;
}

export function verificarSegredos(
  arquivos: Arquivo[],
  ignorados: IgnoradoGitleaks[] = [],
): Achado[] {
  const achados: Achado[] = [];
  for (const { caminho, conteudo } of arquivos) {
    linhas(conteudo).forEach((texto, i) => {
      const numero = i + 1;
      if (ignorados.some((g) => g.arquivo === caminho && g.linha === numero))
        return;
      for (const { regra, regex } of PADROES_SEGREDO) {
        if (regex.test(texto)) {
          achados.push({
            verificacao: "segredos",
            arquivo: caminho,
            linha: numero,
            mensagem: `padrão de segredo (${regra}); remova do repositório e rotacione a chave`,
          });
        }
      }
      if (jwtServiceRole(texto)) {
        achados.push({
          verificacao: "segredos",
          arquivo: caminho,
          linha: numero,
          mensagem:
            "JWT com role service_role versionado; remova e rotacione a chave",
        });
      }
    });
  }
  return achados;
}

// ---------------------------------------------------------------------------------------------
// (a') .env versionado
// ---------------------------------------------------------------------------------------------

export function verificarEnvVersionado(caminhos: string[]): Achado[] {
  return caminhos
    .filter((c) => {
      const base = c.split("/").pop() ?? c;
      return (
        /^\.env(\..+)?$/.test(base) &&
        !/\.(example|sample|template)$/.test(base)
      );
    })
    .map((c) => ({
      verificacao: "env-versionado",
      arquivo: c,
      linha: 1,
      mensagem:
        "arquivo .env versionado (somente .env.example pode ir ao repositório)",
    }));
}

// ---------------------------------------------------------------------------------------------
// (b) SUPABASE_SECRET_KEY fora de src/
// ---------------------------------------------------------------------------------------------

export function verificarSecretKeyEmSrc(arquivos: Arquivo[]): Achado[] {
  const achados: Achado[] = [];
  for (const { caminho, conteudo } of arquivos) {
    if (!emSrc(caminho)) continue;
    linhas(conteudo).forEach((texto, i) => {
      if (texto.includes("SUPABASE_SECRET_KEY")) {
        achados.push({
          verificacao: "secret-key-em-src",
          arquivo: caminho,
          linha: i + 1,
          mensagem:
            "SUPABASE_SECRET_KEY referenciada em src/ (só e2e/ e tests/ podem usá-la)",
        });
      }
    });
  }
  return achados;
}

// ---------------------------------------------------------------------------------------------
// (c) hex de cor fora de globals.css, manifest.ts e do viewport
// ---------------------------------------------------------------------------------------------

const HEX_PERMITIDO = new Set(["src/app/globals.css", "src/app/manifest.ts"]);
const REGEX_HEX_LONGO = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b/;
const REGEX_HEX_CURTO = /#(?:[0-9a-fA-F]{3,4})\b/;
const CONTEXTO_COR = /color|fill|stroke|background|\bbg\b|border|shadow/i;

export function verificarHexDeCor(arquivos: Arquivo[]): Achado[] {
  const achados: Achado[] = [];
  for (const { caminho, conteudo } of arquivos) {
    if (!emSrc(caminho) || !/\.(ts|tsx|css|scss)$/.test(caminho)) continue;
    if (
      HEX_PERMITIDO.has(caminho) ||
      ehTeste(caminho) ||
      caminho.startsWith("src/types/")
    )
      continue;
    let dentroDoViewport = false;
    linhas(conteudo).forEach((texto, i) => {
      if (caminho === "src/app/layout.tsx") {
        if (/export\s+const\s+viewport\b/.test(texto)) dentroDoViewport = true;
        if (dentroDoViewport) {
          if (/^\};?\s*$/.test(texto)) dentroDoViewport = false;
          return;
        }
      }
      const longo = REGEX_HEX_LONGO.test(texto);
      const curto = REGEX_HEX_CURTO.test(texto) && CONTEXTO_COR.test(texto);
      if (longo || curto) {
        achados.push({
          verificacao: "hex-de-cor",
          arquivo: caminho,
          linha: i + 1,
          mensagem:
            "cor em hexadecimal fora de globals.css/manifest.ts/viewport; use o token",
        });
      }
    });
  }
  return achados;
}

// ---------------------------------------------------------------------------------------------
// (d) unstable_cache / use cache ausentes (ADR-0015)
// ---------------------------------------------------------------------------------------------

export function verificarCacheProibido(arquivos: Arquivo[]): Achado[] {
  const achados: Achado[] = [];
  for (const { caminho, conteudo } of arquivos) {
    if (!emSrc(caminho) || !codigoFonte(caminho) || ehTeste(caminho)) continue;
    linhas(conteudo).forEach((texto, i) => {
      if (
        /\bunstable_cache\b/.test(texto) ||
        /["'`]use cache(?::\s*\w+)?["'`]/.test(texto)
      ) {
        achados.push({
          verificacao: "cache-proibido",
          arquivo: caminho,
          linha: i + 1,
          mensagem:
            "unstable_cache/use cache proibidos (ADR-0015: dado financeiro não é cacheado)",
        });
      }
    });
  }
  return achados;
}

// ---------------------------------------------------------------------------------------------
// (e) dangerouslySetInnerHTML só nos arquivos permitidos
// ---------------------------------------------------------------------------------------------

export const INNER_HTML_PERMITIDO = ["src/app/layout.tsx"];

export function verificarInnerHtml(
  arquivos: Arquivo[],
  permitidos: string[] = INNER_HTML_PERMITIDO,
): Achado[] {
  const achados: Achado[] = [];
  for (const { caminho, conteudo } of arquivos) {
    if (!emSrc(caminho) || !codigoFonte(caminho) || ehTeste(caminho)) continue;
    if (permitidos.includes(caminho)) continue;
    linhas(conteudo).forEach((texto, i) => {
      if (texto.includes("dangerouslySetInnerHTML")) {
        achados.push({
          verificacao: "inner-html",
          arquivo: caminho,
          linha: i + 1,
          mensagem: `dangerouslySetInnerHTML fora da lista permitida (${permitidos.join(", ")})`,
        });
      }
    });
  }
  return achados;
}

// ---------------------------------------------------------------------------------------------
// (f) CSP: sem 'unsafe-inline'/'unsafe-eval' em script-src (src/lib/csp.ts)
// ---------------------------------------------------------------------------------------------

export const CAMINHO_CSP = "src/lib/csp.ts";
const OUTRA_DIRETIVA =
  /\b(?:default|style|img|font|connect|worker|manifest|object|frame|media|child|base|form|navigate)-[a-z-]+|upgrade-insecure/;
const CONDICAO_DEV = /isDev|\bdev\b|development|NODE_ENV/;

/**
 * Heurística por texto: a região do `script-src` vai da linha da diretiva até a linha anterior à
 * próxima diretiva (máx. 8 linhas). `'unsafe-inline'` reprova sempre; `'unsafe-eval'` só passa
 * quando a mesma linha o condiciona a desenvolvimento (CA-E9-50: só em dev).
 */
export function verificarCsp(conteudo: string | null): Achado[] {
  if (conteudo === null) return [];
  const todas = linhas(conteudo);
  const achados: Achado[] = [];
  todas.forEach((texto, i) => {
    if (!/\bscript-src(?:-elem|-attr)?\b/.test(texto)) return;
    for (let j = i; j < Math.min(todas.length, i + 8); j++) {
      const atual = todas[j] ?? "";
      if (j > i && OUTRA_DIRETIVA.test(atual)) break;
      if (/unsafe-inline/.test(atual)) {
        achados.push({
          verificacao: "csp",
          arquivo: CAMINHO_CSP,
          linha: j + 1,
          mensagem: "'unsafe-inline' em script-src",
        });
      }
      if (/unsafe-eval/.test(atual) && !CONDICAO_DEV.test(atual)) {
        achados.push({
          verificacao: "csp",
          arquivo: CAMINHO_CSP,
          linha: j + 1,
          mensagem:
            "'unsafe-eval' em script-src sem condição de desenvolvimento",
        });
      }
    }
  });
  return achados;
}

// ---------------------------------------------------------------------------------------------
// (g) workflows: SHA, permissions, pull_request_target, segredos em PR, timeout, concurrency
// ---------------------------------------------------------------------------------------------

function semComentario(texto: string): string {
  return texto.replace(/(^|\s)#.*$/, "$1");
}

export function verificarWorkflow(caminho: string, conteudo: string): Achado[] {
  const achados: Achado[] = [];
  const adiciona = (linha: number, mensagem: string) =>
    achados.push({
      verificacao: "workflows",
      arquivo: caminho,
      linha,
      mensagem,
    });
  const todas = linhas(conteudo);
  const limpas = todas.map(semComentario);

  // gatilhos
  const dePullRequest = limpas.some(
    (l) =>
      /^\s+pull_request\s*:/.test(l) || /^on\s*:.*\bpull_request\b/.test(l),
  );

  // permissions no topo, somente contents: read
  const idxPerm = limpas.findIndex((l) => /^permissions\s*:/.test(l));
  if (idxPerm === -1) {
    adiciona(1, "workflow sem `permissions:` de topo (use `contents: read`)");
  } else {
    for (let j = idxPerm + 1; j < limpas.length; j++) {
      const l = limpas[j] ?? "";
      if (/^\S/.test(l)) break;
      if (/:\s*write\b/.test(l))
        adiciona(
          j + 1,
          "permissão de escrita no workflow (CA-E9-64: só contents: read)",
        );
    }
    if (/^permissions\s*:\s*write-all/.test(limpas[idxPerm] ?? "")) {
      adiciona(idxPerm + 1, "permissions: write-all");
    }
  }

  // concurrency
  if (!limpas.some((l) => /^concurrency\s*:/.test(l))) {
    adiciona(1, "workflow sem `concurrency:` de topo");
  }

  // jobs e timeout
  const iJobs = limpas.findIndex((l) => /^jobs\s*:/.test(l));
  if (iJobs !== -1) {
    const inicios: { nome: string; linha: number }[] = [];
    for (let j = iJobs + 1; j < limpas.length; j++) {
      const l = limpas[j] ?? "";
      if (/^\S/.test(l)) break;
      const m = l.match(/^ {2}([A-Za-z0-9_-]+)\s*:\s*$/);
      if (m?.[1]) inicios.push({ nome: m[1], linha: j });
    }
    inicios.forEach((job, k) => {
      const fim = inicios[k + 1]?.linha ?? limpas.length;
      const bloco = limpas.slice(job.linha, fim);
      if (!bloco.some((l) => /^ {4}timeout-minutes\s*:/.test(l))) {
        adiciona(job.linha + 1, `job "${job.nome}" sem timeout-minutes`);
      }
    });
  }

  limpas.forEach((l, i) => {
    const numero = i + 1;
    if (/\bpull_request_target\b/.test(l))
      adiciona(numero, "pull_request_target é proibido");
    if (/\bsupabase\s+db\s+push\b/.test(l)) {
      adiciona(
        numero,
        "supabase db push no CI é proibido (migrations de produção são manuais)",
      );
    }
    const uso = l.match(/^\s*-?\s*uses\s*:\s*(\S+)/);
    if (uso?.[1]) {
      const alvo = uso[1];
      if (!alvo.startsWith("./") && !alvo.startsWith("docker://")) {
        if (!/@[0-9a-f]{40}$/.test(alvo)) {
          adiciona(
            numero,
            `ação "${alvo}" não está fixada por SHA de commit completo (40 caracteres)`,
          );
        } else if (!/#\s*v?\d/.test(todas[i] ?? "")) {
          adiciona(
            numero,
            `ação "${alvo}" sem a versão em comentário (# vX.Y.Z)`,
          );
        }
      }
    }
    if (dePullRequest) {
      for (const m of l.matchAll(/\bsecrets\.([A-Za-z0-9_]+)/g)) {
        if (m[1] !== "GITHUB_TOKEN") {
          adiciona(
            numero,
            `secrets.${m[1]} em workflow de pull_request (fork não deve receber segredo)`,
          );
        }
      }
    }
  });

  return achados;
}

export function verificarWorkflows(arquivos: Arquivo[]): Achado[] {
  return arquivos
    .filter((a) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(a.caminho))
    .flatMap((a) => verificarWorkflow(a.caminho, a.conteudo));
}

// ---------------------------------------------------------------------------------------------
// tabela de achados do projeto (sem alto/crítico aberto)
// ---------------------------------------------------------------------------------------------

export const CAMINHO_ACHADOS =
  ".claude/factory/project-memory/security/achados.md";

export function verificarTabelaDeAchados(conteudo: string | null): Achado[] {
  if (conteudo === null) return [];
  const achados: Achado[] = [];
  linhas(conteudo).forEach((texto, i) => {
    const celulas = texto.split("|").map((c) => c.trim());
    // | ID | Severidade | Status | Onde | Achado |
    const [, id, severidade, status] = celulas;
    if (!id || !/^[A-Z]+-\d+$/.test(id)) return;
    const sev = (severidade ?? "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase();
    if (
      (sev === "alta" || sev === "critica") &&
      (status ?? "").toLowerCase() === "aberto"
    ) {
      achados.push({
        verificacao: "achados-abertos",
        arquivo: CAMINHO_ACHADOS,
        linha: i + 1,
        mensagem: `${id} (${severidade}) está aberto; alto/crítico aberto bloqueia a entrega`,
      });
    }
  });
  return achados;
}

// ---------------------------------------------------------------------------------------------
// dependências: .depsignore + pnpm audit
// ---------------------------------------------------------------------------------------------

/** Formato do `.depsignore`: `pacote AAAA-MM-DD # motivo`. */
export function lerDepsIgnore(conteudo: string): ExcecaoDeps[] {
  const saida: ExcecaoDeps[] = [];
  for (const bruta of linhas(conteudo)) {
    const linha = bruta.trim();
    if (!linha || linha.startsWith("#")) continue;
    const [corpo = "", ...motivo] = linha.split("#");
    const m = corpo.trim().match(/^(\S+)\s+(\d{4}-\d{2}-\d{2})$/);
    if (m?.[1] && m[2])
      saida.push({ pacote: m[1], ate: m[2], motivo: motivo.join("#").trim() });
  }
  return saida;
}

export function verificarDepsIgnoreVencido(
  excecoes: ExcecaoDeps[],
  hoje: string,
): Achado[] {
  return excecoes
    .filter((e) => e.ate < hoje)
    .map((e) => ({
      verificacao: "depsignore",
      arquivo: ".depsignore",
      linha: 1,
      mensagem: `exceção de ${e.pacote} venceu em ${e.ate}; atualize o pacote ou renove a decisão`,
    }));
}

type Advisory = {
  module_name?: string;
  severity?: string;
  title?: string;
  github_advisory_id?: string;
};

/** Interpreta a saída `pnpm audit --json`: alto/crítico sem exceção vigente reprova. */
export function avaliarAudit(
  json: string,
  excecoesVigentes: ExcecaoDeps[],
): { achados: Achado[]; ignorados: string[] } | null {
  let dados: { advisories?: Record<string, Advisory> };
  try {
    dados = JSON.parse(json);
  } catch {
    return null;
  }
  if (!dados || typeof dados !== "object") return null;
  const achados: Achado[] = [];
  const ignorados: string[] = [];
  for (const adv of Object.values(dados.advisories ?? {})) {
    if (adv.severity !== "high" && adv.severity !== "critical") continue;
    const nome = adv.module_name ?? "?";
    if (excecoesVigentes.some((e) => e.pacote === nome)) {
      ignorados.push(
        `${nome} (${adv.github_advisory_id ?? adv.title ?? "advisory"})`,
      );
      continue;
    }
    achados.push({
      verificacao: "pnpm-audit",
      arquivo: "pnpm-lock.yaml",
      linha: 1,
      mensagem:
        `${adv.severity}: ${nome} - ${adv.title ?? ""} ${adv.github_advisory_id ?? ""}`.trim(),
    });
  }
  return { achados, ignorados };
}

// ---------------------------------------------------------------------------------------------
// execução
// ---------------------------------------------------------------------------------------------

const EXTENSOES_BINARIAS =
  /\.(png|jpe?g|gif|webp|avif|ico|icns|pdf|woff2?|ttf|otf|eot|zip|gz|mp4|mov|webm)$/i;
const LIMITE_BYTES = 1_000_000;

function lerArquivosVersionados(): {
  caminhos: string[];
  arquivos: Arquivo[];
} | null {
  const r = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (r.status !== 0) return null;
  const caminhos = r.stdout.split("\0").filter(Boolean);
  const arquivos: Arquivo[] = [];
  for (const caminho of caminhos) {
    if (EXTENSOES_BINARIAS.test(caminho) || !existsSync(caminho)) continue;
    try {
      if (statSync(caminho).size > LIMITE_BYTES) continue;
      arquivos.push({ caminho, conteudo: readFileSync(caminho, "utf8") });
    } catch {
      // arquivo sumiu ou ilegível: ignorar
    }
  }
  return { caminhos, arquivos };
}

function lerOpcional(caminho: string): string | null {
  try {
    return readFileSync(caminho, "utf8");
  } catch {
    return null;
  }
}

function rodarAudit(excecoesVigentes: ExcecaoDeps[]) {
  // Comando único com shell: no Windows `pnpm` é um .cmd; evita o aviso DEP0190 de args + shell.
  const r = spawnSync("pnpm audit --json", {
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  // pnpm audit sai com código != 0 quando há advisory; o JSON continua em stdout.
  return avaliarAudit(r.stdout ?? "", excecoesVigentes);
}

export function main(argumentos: string[] = process.argv.slice(2)): number {
  const semAudit = argumentos.includes("--sem-audit");
  const hoje = new Date().toISOString().slice(0, 10);

  const versionados = lerArquivosVersionados();
  if (!versionados) {
    console.error(
      "INCOMPLETO: `git ls-files` falhou (não é um repositório git?).",
    );
    return 2;
  }
  const { caminhos, arquivos } = versionados;

  const gitleaks = lerGitleaksIgnore(lerOpcional(".gitleaksignore") ?? "");
  const excecoes = lerDepsIgnore(lerOpcional(".depsignore") ?? "");
  const vigentes = excecoes.filter((e) => e.ate >= hoje);

  const csp = arquivos.find((a) => a.caminho === CAMINHO_CSP)?.conteudo ?? null;
  const tabela = lerOpcional(CAMINHO_ACHADOS);

  const resultados: { nome: string; achados: Achado[]; nota?: string }[] = [
    {
      nome: "segredos versionados",
      achados: verificarSegredos(arquivos, gitleaks),
    },
    { nome: ".env fora do git", achados: verificarEnvVersionado(caminhos) },
    {
      nome: "SUPABASE_SECRET_KEY fora de src/",
      achados: verificarSecretKeyEmSrc(arquivos),
    },
    {
      nome: "hex de cor só nos arquivos permitidos",
      achados: verificarHexDeCor(arquivos),
    },
    {
      nome: "unstable_cache/use cache ausentes",
      achados: verificarCacheProibido(arquivos),
    },
    {
      nome: "dangerouslySetInnerHTML permitido",
      achados: verificarInnerHtml(arquivos),
    },
    {
      nome: `CSP sem unsafe-inline/eval em script-src (${CAMINHO_CSP})`,
      achados: verificarCsp(csp),
      nota:
        csp === null
          ? "arquivo ainda não existe; verificação não aplicada"
          : undefined,
    },
    { nome: "workflows endurecidos", achados: verificarWorkflows(arquivos) },
    {
      nome: "tabela de achados sem alto/crítico aberto",
      achados: verificarTabelaDeAchados(tabela),
      nota:
        tabela === null
          ? `${CAMINHO_ACHADOS} ausente; verificação não aplicada`
          : undefined,
    },
    {
      nome: "exceções do .depsignore vigentes",
      achados: verificarDepsIgnoreVencido(excecoes, hoje),
    },
  ];

  let incompleto = false;
  if (semAudit) {
    resultados.push({
      nome: "pnpm audit (alto/crítico)",
      achados: [],
      nota: "pulado (--sem-audit)",
    });
  } else {
    const audit = rodarAudit(vigentes);
    if (audit === null) {
      incompleto = true;
      resultados.push({
        nome: "pnpm audit (alto/crítico)",
        achados: [],
        nota: "INCOMPLETO: `pnpm audit --json` não devolveu JSON (sem rede?)",
      });
    } else {
      resultados.push({
        nome: "pnpm audit (alto/crítico)",
        achados: audit.achados,
        nota: audit.ignorados.length
          ? `ignorado por .depsignore vigente: ${audit.ignorados.join(", ")}`
          : undefined,
      });
    }
  }

  let total = 0;
  for (const r of resultados) {
    const estado =
      r.achados.length > 0
        ? "FALHA"
        : r.nota?.startsWith("INCOMPLETO")
          ? "?????"
          : "ok   ";
    console.log(`${estado} ${r.nome}${r.nota ? ` [${r.nota}]` : ""}`);
    for (const a of r.achados) {
      console.log(`      ${a.arquivo}:${a.linha}  ${a.mensagem}`);
      total++;
    }
  }
  console.log("");
  if (total > 0) {
    console.log(`REPROVADO: ${total} achado(s).`);
    return 1;
  }
  if (incompleto) {
    console.log("INCOMPLETO: nem toda verificação pôde rodar; não é sucesso.");
    return 2;
  }
  console.log("PASSA: nenhum achado.");
  return 0;
}

if (import.meta.main) {
  process.exitCode = main();
}
