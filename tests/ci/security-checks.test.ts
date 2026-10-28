import { describe, expect, it } from "vitest";

import {
  avaliarAudit,
  lerDepsIgnore,
  lerGitleaksIgnore,
  verificarCacheProibido,
  verificarCsp,
  verificarDepsIgnoreVencido,
  verificarEnvVersionado,
  verificarHexDeCor,
  verificarInnerHtml,
  verificarSecretKeyEmSrc,
  verificarSegredos,
  verificarTabelaDeAchados,
  verificarWorkflow,
} from "../../scripts/security-checks";

const arq = (caminho: string, conteudo: string) => [{ caminho, conteudo }];
const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
// Montados por concatenação para este arquivo não casar com o próprio gate.
const FALSA_SECRET = "sb_" + "secret_" + "A".repeat(30);
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const JWT_SERVICE = `${b64({ alg: "HS256" })}.${b64({ role: "service_role" })}.assinaturafalsa123`;
const JWT_ANON = `${b64({ alg: "HS256" })}.${b64({ role: "anon" })}.assinaturafalsa123`;

describe("segredos versionados", () => {
  it("reprova chave sb_secret_ com arquivo e linha", () => {
    const r = verificarSegredos(
      arq("a.ts", `ok\nconst k = "${FALSA_SECRET}";`),
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ arquivo: "a.ts", linha: 2 });
  });
  it("reprova JWT service_role e bloco de chave privada", () => {
    const pem = "-----BEGIN " + "RSA PRIVATE KEY-----";
    expect(verificarSegredos(arq("a.ts", `x = "${JWT_SERVICE}"`))).toHaveLength(
      1,
    );
    expect(verificarSegredos(arq("k.pem.txt", pem))).toHaveLength(1);
  });
  it("aprova JWT anon, UUID e texto comum", () => {
    expect(verificarSegredos(arq("a.ts", `x = "${JWT_ANON}"`))).toEqual([]);
    expect(
      verificarSegredos(
        arq("a.ts", "id = '577e64f5-4959-40cb-b678-407cbdd26982'"),
      ),
    ).toEqual([]);
  });
  it("honra o .gitleaksignore por arquivo e linha", () => {
    const ign = lerGitleaksIgnore("# motivo\nabc123:a.ts:generic-api-key:1\n");
    expect(ign).toEqual([{ arquivo: "a.ts", linha: 1 }]);
    expect(verificarSegredos(arq("a.ts", `"${FALSA_SECRET}"`), ign)).toEqual(
      [],
    );
  });
});

describe(".env versionado", () => {
  it("reprova .env e .env.local; aprova .env.example", () => {
    expect(verificarEnvVersionado([".env", "x/.env.local"])).toHaveLength(2);
    expect(verificarEnvVersionado([".env.example", "src/env.ts"])).toEqual([]);
  });
});

describe("SUPABASE_SECRET_KEY em src/", () => {
  it("reprova em src/, aprova em e2e/ e tests/", () => {
    const uso = "process.env.SUPABASE_SECRET_KEY";
    expect(verificarSecretKeyEmSrc(arq("src/lib/x.ts", uso))).toHaveLength(1);
    expect(verificarSecretKeyEmSrc(arq("e2e/helpers/users.ts", uso))).toEqual(
      [],
    );
    expect(verificarSecretKeyEmSrc(arq("tests/integration/h.ts", uso))).toEqual(
      [],
    );
  });
});

describe("hex de cor", () => {
  it("reprova hex em componente", () => {
    const r = verificarHexDeCor(
      arq("src/components/a.tsx", 'const c = "#ff0000";'),
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ linha: 1 });
  });
  it("reprova hex curto em contexto de cor", () => {
    expect(
      verificarHexDeCor(arq("src/a.ts", 'const color = "#f00";')),
    ).toHaveLength(1);
  });
  it("aprova globals.css, manifest.ts, testes, âncoras e o viewport do layout", () => {
    expect(
      verificarHexDeCor(arq("src/app/globals.css", "--a: #fafafa;")),
    ).toEqual([]);
    expect(
      verificarHexDeCor(arq("src/app/manifest.ts", 'theme_color: "#84cc16"')),
    ).toEqual([]);
    expect(verificarHexDeCor(arq("src/a.test.ts", 'x("#ff0000")'))).toEqual([]);
    expect(
      verificarHexDeCor(arq("src/a.tsx", '<a href="#add">ir</a>')),
    ).toEqual([]);
    const layout = [
      "export const viewport = {",
      '  themeColor: [{ color: "#fafafa" }],',
      "};",
      'const outro = "#123456";',
    ].join("\n");
    const r = verificarHexDeCor(arq("src/app/layout.tsx", layout));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ linha: 4 });
  });
});

describe("unstable_cache / use cache", () => {
  it("reprova unstable_cache e a diretiva use cache", () => {
    expect(
      verificarCacheProibido(arq("src/a.ts", "unstable_cache(fn)")),
    ).toHaveLength(1);
    expect(
      verificarCacheProibido(arq("src/a.ts", '"use cache";')),
    ).toHaveLength(1);
  });
  it("aprova código sem cache", () => {
    expect(
      verificarCacheProibido(
        arq("src/a.ts", "const cached = 1; // cache local"),
      ),
    ).toEqual([]);
  });
});

describe("dangerouslySetInnerHTML", () => {
  const uso = "<div dangerouslySetInnerHTML={{ __html: x }} />";
  it("reprova fora da lista", () => {
    expect(verificarInnerHtml(arq("src/components/a.tsx", uso))).toHaveLength(
      1,
    );
  });
  it("aprova no arquivo permitido", () => {
    expect(verificarInnerHtml(arq("src/app/layout.tsx", uso))).toEqual([]);
  });
});

describe("CSP (script-src)", () => {
  it("reprova 'unsafe-inline' em script-src", () => {
    const csp = `const d = [\n  "script-src 'self' 'unsafe-inline'",\n  "object-src 'none'",\n];`;
    const r = verificarCsp(csp);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ linha: 2 });
  });
  it("reprova 'unsafe-eval' sem condição de dev", () => {
    expect(verificarCsp(`"script-src 'self' 'unsafe-eval'"`)).toHaveLength(1);
  });
  it("aprova nonce + strict-dynamic e unsafe-eval só em dev; ignora outras diretivas", () => {
    const csp = [
      "const d = [",
      "  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? \" 'unsafe-eval'\" : \"\"}`,",
      "  `style-src 'self' 'unsafe-inline'`,",
      "];",
    ].join("\n");
    expect(verificarCsp(csp)).toEqual([]);
  });
  it("arquivo ausente não gera achado", () => {
    expect(verificarCsp(null)).toEqual([]);
  });
});

describe("workflows", () => {
  const bom = [
    "name: x",
    "on:",
    "  pull_request:",
    "permissions:",
    "  contents: read",
    "concurrency:",
    "  group: g",
    "jobs:",
    "  a:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 5",
    "    steps:",
    `      - uses: actions/checkout@${SHA} # v7.0.1`,
    "      - run: echo ok",
  ].join("\n");

  it("aprova um workflow endurecido", () => {
    expect(verificarWorkflow(".github/workflows/x.yml", bom)).toEqual([]);
  });
  it("reprova ação sem SHA e ação sem a versão em comentário", () => {
    const semSha = bom.replace(`@${SHA} # v7.0.1`, "@v4");
    expect(verificarWorkflow("w.yml", semSha).map((a) => a.linha)).toEqual([
      13,
    ]);
    const semVersao = bom.replace(" # v7.0.1", "");
    expect(verificarWorkflow("w.yml", semVersao)).toHaveLength(1);
  });
  it("reprova pull_request_target (mas não quando só está em comentário)", () => {
    expect(
      verificarWorkflow(
        "w.yml",
        bom.replace("pull_request:", "pull_request_target:"),
      ),
    ).not.toEqual([]);
    expect(
      verificarWorkflow("w.yml", `${bom}\n# pull_request_target é proibido`),
    ).toEqual([]);
  });
  it("reprova permissions ausente, de escrita, job sem timeout e sem concurrency", () => {
    expect(
      verificarWorkflow(
        "w.yml",
        bom.replace("permissions:\n  contents: read\n", ""),
      ),
    ).toHaveLength(1);
    expect(
      verificarWorkflow(
        "w.yml",
        bom.replace("contents: read", "contents: write"),
      ),
    ).toHaveLength(1);
    expect(
      verificarWorkflow("w.yml", bom.replace("    timeout-minutes: 5\n", "")),
    ).toHaveLength(1);
    expect(
      verificarWorkflow("w.yml", bom.replace("concurrency:\n  group: g\n", "")),
    ).toHaveLength(1);
  });
  it("reprova segredo (exceto GITHUB_TOKEN) em workflow de pull_request e db push", () => {
    const com = (linha: string) => `${bom}\n      - run: ${linha}`;
    expect(
      verificarWorkflow("w.yml", com("echo ${{ secrets.PROD_KEY }}")),
    ).toHaveLength(1);
    expect(
      verificarWorkflow("w.yml", com("echo ${{ secrets.GITHUB_TOKEN }}")),
    ).toEqual([]);
    expect(
      verificarWorkflow("w.yml", com("pnpm exec supabase db push")),
    ).toHaveLength(1);
  });
});

describe("tabela de achados", () => {
  const tabela = (sev: string, status: string) =>
    `| ID | Severidade | Status | Onde | Achado |\n|---|---|---|---|---|\n| SEC-1 | ${sev} | ${status} | x | y |`;
  it("reprova alta/crítica aberta", () => {
    expect(verificarTabelaDeAchados(tabela("alta", "aberto"))).toHaveLength(1);
    expect(verificarTabelaDeAchados(tabela("crítica", "aberto"))).toHaveLength(
      1,
    );
  });
  it("aprova baixa/média abertas, alta corrigida/aceita e arquivo ausente", () => {
    expect(verificarTabelaDeAchados(tabela("baixa", "aberto"))).toEqual([]);
    expect(verificarTabelaDeAchados(tabela("média", "aberto"))).toEqual([]);
    expect(verificarTabelaDeAchados(tabela("alta", "corrigido"))).toEqual([]);
    expect(verificarTabelaDeAchados(tabela("alta", "aceito"))).toEqual([]);
    expect(verificarTabelaDeAchados(null)).toEqual([]);
  });
});

describe(".depsignore e pnpm audit", () => {
  const excecoes = lerDepsIgnore("# c\ntypescript 2026-11-27 # motivo\n");
  it("lê pacote, data e motivo", () => {
    expect(excecoes).toEqual([
      { pacote: "typescript", ate: "2026-11-27", motivo: "motivo" },
    ]);
  });
  it("reprova exceção vencida e aprova a vigente", () => {
    expect(verificarDepsIgnoreVencido(excecoes, "2026-11-28")).toHaveLength(1);
    expect(verificarDepsIgnoreVencido(excecoes, "2026-10-28")).toEqual([]);
  });
  const audit = (severity: string, modulo = "foo") =>
    JSON.stringify({
      advisories: { 1: { module_name: modulo, severity, title: "t" } },
    });
  it("reprova alto/crítico, ignora baixo e honra exceção vigente", () => {
    expect(avaliarAudit(audit("high"), [])?.achados).toHaveLength(1);
    expect(avaliarAudit(audit("critical"), [])?.achados).toHaveLength(1);
    expect(avaliarAudit(audit("low"), [])?.achados).toEqual([]);
    const r = avaliarAudit(audit("high", "typescript"), excecoes);
    expect(r?.achados).toEqual([]);
    expect(r?.ignorados).toHaveLength(1);
  });
  it("saída que não é JSON é incompleta (null)", () => {
    expect(avaliarAudit("ERR_PNPM_AUDIT_BAD_RESPONSE", [])).toBeNull();
  });
});
