import type { Browser } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { clienteDo, criarCenario } from "./cenario";
import { loginPelaTela } from "./login-pelo-formulario";
import type { IdsDinamicos } from "./rotas";
import { AUTH_DIR } from "./shared-users";
import { adminClient } from "./users";

/**
 * Caminho único (por carga do módulo, isto é, por worker) do storageState do usuário semeado.
 * `test.use({ storageState })` precisa do caminho na declaração; o `beforeAll` do mesmo worker
 * grava o arquivo nele. Workers e arquivos diferentes nunca compartilham sessão nem família.
 */
export function novoCaminhoDeSessaoDasRotas(rotulo: string): string {
  return join(AUTH_DIR, `rotas-${rotulo}-${randomUUID().slice(0, 8)}.json`);
}

/** Data de hoje em São Paulo (`private.today()` do banco), não em UTC: lançamento efetivado não pode ser futuro. */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/**
 * Semeia, numa FAMÍLIA PRÓPRIA (usuário novo, dono dela; nunca o dono compartilhado do
 * global-setup, cuja cota de convites os specs de família consomem), uma linha de cada entidade que tem
 * rota dinâmica no inventário, para o QA percorrer telas "com dados". Só roda com Docker
 * (Supabase local). Cada chamada cria usuário e família novos (nada depende de execuções
 * anteriores) e exatamente 1 convite, bem abaixo do limite de 20 pendentes. Entra pela tela e
 * grava a sessão em `arquivoSessao` (use `novoCaminhoDeSessaoDasRotas` + `test.use`).
 *
 * Caminho de escrita (mesmo dos outros specs, que passam no CI):
 * - `accounts` e `categories`: secret key (`adminClient`), como `criarContaNoBanco`/`criarCenario`.
 * - `transactions`, `recurrences`, `goals`, `budgets`: cliente autenticado do dono (`clienteDo`),
 *   como o app e como os specs de lançamentos, recorrências e metas. Os gatilhos de transactions e
 *   recurrences chamam `private.*` (execute só para `authenticated`) e os GRANTs de INSERT são por
 *   coluna: `created_by` (default `auth.uid()`), `due_date`, `status` (goals) e
 *   `next_occurrence_date` ficam FORA do grant e vêm do banco. Enviá-los devolve
 *   "permission denied for table ...", mesmo com o usuário autenticado.
 */
export async function semearDadosDasRotas(
  browser: Browser,
  baseURL: string,
  arquivoSessao: string,
): Promise<IdsDinamicos> {
  const sufixo = Math.random().toString(36).slice(2, 8);
  const { owner: dono, familyId } = await criarCenario(`rotas-${sufixo}`);
  const admin = adminClient();

  mkdirSync(AUTH_DIR, { recursive: true });
  // `storageState: undefined` explícito: o Playwright aplica aos novos contextos do worker o
  // `test.use({ storageState })` dos specs (caminho que só existe depois deste seed).
  const contexto = await browser.newContext({
    baseURL,
    storageState: undefined,
  });
  try {
    const pagina = await contexto.newPage();
    await pagina.goto("/login");
    await loginPelaTela(pagina, dono);
    await contexto.storageState({ path: arquivoSessao });
  } finally {
    await contexto.close();
  }

  const cliente = await clienteDo(dono);
  const um = async (
    escritor: "admin" | "dono",
    tabela: string,
    linha: Record<string, unknown>,
  ): Promise<string> => {
    const { data, error } = await (escritor === "admin" ? admin : cliente)
      .from(tabela)
      .insert(linha)
      .select("id")
      .single();
    if (error || !data) throw new Error(`${tabela}: ${error?.message}`);
    return (data as { id: string }).id;
  };

  // Secret key: o `revoke` de 20261024100000/100100 vale só para anon/authenticated; `created_by` explícito.
  const conta = await um("admin", "accounts", {
    family_id: familyId,
    created_by: dono.id,
    name: `Conta A11y ${sufixo}`,
    type: "checking",
    opening_balance: "1000",
    opening_balance_date: "2026-01-01",
  });
  const categoria = await um("admin", "categories", {
    family_id: familyId,
    created_by: dono.id,
    name: `Mercado A11y ${sufixo}`,
    type: "expense",
    color: "chart-3",
    icon: "utensils",
  });

  const hoje = hojeEmSaoPaulo();
  // Sem `created_by`, `due_date` e `next_occurrence_date`: fora dos grants de INSERT, preenchidos pelo banco.
  const transacao = await um("dono", "transactions", {
    family_id: familyId,
    account_id: conta,
    category_id: categoria,
    type: "expense",
    status: "paid",
    amount: 120.5,
    description: `Compra A11y ${sufixo}`,
    transaction_date: hoje,
  });
  // Pendente: o gatilho fixa `due_date = transaction_date` (ADR-0022).
  const compromisso = await um("dono", "transactions", {
    family_id: familyId,
    account_id: conta,
    category_id: categoria,
    type: "expense",
    status: "pending",
    amount: 80,
    description: `Conta a pagar A11y ${sufixo}`,
    transaction_date: hoje,
  });
  const recorrencia = await um("dono", "recurrences", {
    family_id: familyId,
    account_id: conta,
    category_id: categoria,
    type: "expense",
    amount: 45,
    description: `Assinatura A11y ${sufixo}`,
    frequency: "monthly",
    interval_count: 1,
    start_date: hoje,
  });
  // `status` fica fora do grant de INSERT: nasce `active` pelo default.
  const meta = await um("dono", "goals", {
    family_id: familyId,
    name: `Meta A11y ${sufixo}`,
    target_amount: 5000,
    icon: "target",
  });
  const orcamento = await um("dono", "budgets", {
    family_id: familyId,
    category_id: categoria,
    amount_limit: 900,
    start_month: `${hoje.slice(0, 7)}-01`,
  });

  const { data: convite, error: erroConvite } = await cliente.rpc(
    "create_family_invite",
    { p_role: "member" },
  );
  if (erroConvite) throw new Error(`convite: ${erroConvite.message}`);
  const token = (convite as { token: string }[])[0]?.token;
  if (!token) throw new Error("convite sem token");

  return {
    transacao,
    compromisso,
    conta,
    meta,
    orcamento,
    recorrencia,
    conviteToken: token,
  };
}
