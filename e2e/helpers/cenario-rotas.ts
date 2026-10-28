import { clienteDo } from "./cenario";
import type { IdsDinamicos } from "./rotas";
import { sharedUser } from "./shared-users";
import { adminClient } from "./users";

/**
 * Semeia, na família do dono compartilhado (global-setup), uma linha de cada entidade que tem
 * rota dinâmica no inventário, para o QA percorrer telas "com dados". Só roda com Docker
 * (Supabase local). Nomes únicos por execução: a semeadura é repetível.
 */
export async function semearDadosDasRotas(): Promise<IdsDinamicos> {
  const dono = sharedUser("owner");
  const admin = adminClient();
  const sufixo = Math.random().toString(36).slice(2, 8);

  const { data: vinculo, error: erroVinculo } = await admin
    .from("family_members")
    .select("family_id")
    .eq("user_id", dono.id)
    .eq("status", "active")
    .single();
  if (erroVinculo || !vinculo) {
    throw new Error(`Dono sem família: ${erroVinculo?.message}`);
  }
  const familyId = vinculo.family_id as string;
  const base = { family_id: familyId, created_by: dono.id };

  const um = async <T extends { id: string }>(
    tabela: string,
    linha: Record<string, unknown>,
  ): Promise<string> => {
    const { data, error } = await admin
      .from(tabela)
      .insert(linha)
      .select("id")
      .single();
    if (error || !data) throw new Error(`${tabela}: ${error?.message}`);
    return (data as T).id;
  };

  const conta = await um("accounts", {
    ...base,
    name: `Conta A11y ${sufixo}`,
    type: "checking",
    opening_balance: "1000",
    opening_balance_date: "2026-01-01",
  });
  const categoria = await um("categories", {
    ...base,
    name: `Mercado A11y ${sufixo}`,
    type: "expense",
    color: "chart-3",
    icon: "utensils",
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const transacao = await um("transactions", {
    ...base,
    account_id: conta,
    category_id: categoria,
    type: "expense",
    status: "paid",
    amount: 120.5,
    description: `Compra A11y ${sufixo}`,
    transaction_date: hoje,
  });
  const compromisso = await um("transactions", {
    ...base,
    account_id: conta,
    category_id: categoria,
    type: "expense",
    status: "pending",
    amount: 80,
    description: `Conta a pagar A11y ${sufixo}`,
    transaction_date: hoje,
    due_date: hoje,
  });
  const recorrencia = await um("recurrences", {
    ...base,
    account_id: conta,
    category_id: categoria,
    type: "expense",
    amount: 45,
    description: `Assinatura A11y ${sufixo}`,
    frequency: "monthly",
    start_date: hoje,
    next_occurrence_date: hoje,
  });
  const meta = await um("goals", {
    ...base,
    name: `Meta A11y ${sufixo}`,
    target_amount: 5000,
    status: "active",
  });
  const orcamento = await um("budgets", {
    ...base,
    category_id: categoria,
    amount_limit: 900,
    start_month: `${hoje.slice(0, 7)}-01`,
  });

  const cliente = await clienteDo(dono);
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
