import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Inventário executável de rotas (contrato da Etapa 8 §3.3). Fonte: `src/app/**\/page.tsx`.
 * Se aparecer um `page.tsx` fora desta lista, a importação deste módulo falha: a rota nova
 * precisa entrar na auditoria de acessibilidade e de responsividade.
 */
export type GrupoRota =
  "publica" | "publica-banco" | "onboarding" | "app" | "fora-da-auditoria";

export type Rota = {
  /** Padrão do Next, como a pasta (`/transacoes/[id]`). */
  padrao: string;
  grupo: GrupoRota;
  /** Chave do id dinâmico em `IdsDinamicos`, quando houver. */
  parametros?: Record<string, keyof IdsDinamicos>;
  /** Roda sem banco, sem sessão (camada 1). */
  semBanco?: boolean;
};

export type IdsDinamicos = {
  transacao: string;
  compromisso: string;
  conta: string;
  meta: string;
  orcamento: string;
  recorrencia: string;
  conviteToken: string;
};

export const ROTAS: Rota[] = [
  // Públicas (sem banco)
  { padrao: "/login", grupo: "publica", semBanco: true },
  { padrao: "/cadastro", grupo: "publica", semBanco: true },
  { padrao: "/recuperar-senha", grupo: "publica", semBanco: true },
  { padrao: "/redefinir-senha", grupo: "publica", semBanco: true },
  { padrao: "/offline", grupo: "publica", semBanco: true },
  // Públicas (com banco)
  {
    padrao: "/convite/[token]",
    grupo: "publica-banco",
    parametros: { token: "conviteToken" },
  },
  // Onboarding
  { padrao: "/onboarding", grupo: "onboarding" },
  // Início e transações
  { padrao: "/inicio", grupo: "app" },
  { padrao: "/transacoes", grupo: "app" },
  { padrao: "/transacoes/nova", grupo: "app" },
  { padrao: "/transacoes/[id]", grupo: "app", parametros: { id: "transacao" } },
  {
    padrao: "/transacoes/[id]/editar",
    grupo: "app",
    parametros: { id: "transacao" },
  },
  // Contas e categorias
  { padrao: "/contas", grupo: "app" },
  { padrao: "/contas/nova", grupo: "app" },
  { padrao: "/contas/[id]/editar", grupo: "app", parametros: { id: "conta" } },
  { padrao: "/categorias", grupo: "app" },
  // Compromissos e recorrências
  { padrao: "/compromissos", grupo: "app" },
  { padrao: "/compromissos/novo", grupo: "app" },
  {
    padrao: "/compromissos/[id]",
    grupo: "app",
    parametros: { id: "compromisso" },
  },
  {
    padrao: "/compromissos/[id]/editar",
    grupo: "app",
    parametros: { id: "compromisso" },
  },
  { padrao: "/recorrencias", grupo: "app" },
  {
    padrao: "/recorrencias/[id]/editar",
    grupo: "app",
    parametros: { id: "recorrencia" },
  },
  // Orçamentos
  { padrao: "/orcamentos", grupo: "app" },
  { padrao: "/orcamentos/novo", grupo: "app" },
  {
    padrao: "/orcamentos/[id]/editar",
    grupo: "app",
    parametros: { id: "orcamento" },
  },
  // Metas e divisão
  { padrao: "/metas", grupo: "app" },
  { padrao: "/metas/nova", grupo: "app" },
  { padrao: "/metas/[id]", grupo: "app", parametros: { id: "meta" } },
  { padrao: "/metas/[id]/editar", grupo: "app", parametros: { id: "meta" } },
  { padrao: "/divisao", grupo: "app" },
  {
    padrao: "/divisao/[transactionId]",
    grupo: "app",
    parametros: { transactionId: "transacao" },
  },
  { padrao: "/divisao/acertos", grupo: "app" },
  { padrao: "/divisao/acertos/novo", grupo: "app" },
  // Planejamento e relatórios
  { padrao: "/planejamento", grupo: "app" },
  { padrao: "/relatorios", grupo: "app" },
  { padrao: "/relatorios/categorias", grupo: "app" },
  { padrao: "/relatorios/contas", grupo: "app" },
  { padrao: "/relatorios/integrantes", grupo: "app" },
  { padrao: "/relatorios/orcamentos", grupo: "app" },
  { padrao: "/relatorios/metas", grupo: "app" },
  // Notificações e família
  { padrao: "/notificacoes", grupo: "app" },
  { padrao: "/familia", grupo: "app" },
  { padrao: "/familia/atividade", grupo: "app" },
  // Configurações
  { padrao: "/configuracoes", grupo: "app" },
  // Fora da auditoria de tela (cobertas pelos critérios de PWA)
  { padrao: "/", grupo: "fora-da-auditoria" },
];

export const ROTAS_PUBLICAS_SEM_BANCO = ROTAS.filter((r) => r.semBanco);
export const ROTAS_AUTENTICADAS = ROTAS.filter(
  (r) => r.grupo === "app" || r.grupo === "onboarding",
);

/** 404: não é `page.tsx`, é `not-found.tsx`; endereço que nunca existe. */
export const ROTA_404 = "/esta-rota-nao-existe-e2e";

/** Substitui `[param]` pelos ids reais. */
export function resolver(rota: Rota, ids: Partial<IdsDinamicos>): string {
  let caminho = rota.padrao;
  for (const [param, chave] of Object.entries(rota.parametros ?? {})) {
    const valor = ids[chave];
    if (!valor) {
      throw new Error(`${rota.padrao}: id "${chave}" não foi semeado.`);
    }
    caminho = caminho.replace(`[${param}]`, encodeURIComponent(valor));
  }
  return caminho;
}

/** Rotas reais (`page.tsx`) sob `src/app`, no formato do Next, sem os grupos `(x)`. */
export function descobrirPaginas(
  raiz = join(process.cwd(), "src", "app"),
): string[] {
  const achadas: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const completo = join(dir, nome);
      if (statSync(completo).isDirectory()) andar(completo);
      else if (nome === "page.tsx") {
        const partes = relative(raiz, dir)
          .split(sep)
          .filter((p) => p && !/^\(.*\)$/.test(p));
        achadas.push("/" + partes.join("/"));
      }
    }
  };
  andar(raiz);
  return achadas.sort();
}

/** Lança se existir `page.tsx` sem entrada em `ROTAS` (e o inverso). */
export function verificarInventario(): void {
  const reais = new Set(descobrirPaginas());
  const listadas = new Set(ROTAS.map((r) => r.padrao));
  const faltando = [...reais].filter((r) => !listadas.has(r));
  const sobrando = [...listadas].filter((r) => !reais.has(r));
  if (faltando.length || sobrando.length) {
    throw new Error(
      `Inventário de rotas desatualizado (e2e/helpers/rotas.ts). ` +
        `page.tsx sem entrada: [${faltando.join(", ")}]; entrada sem page.tsx: [${sobrando.join(", ")}].`,
    );
  }
}

verificarInventario();
