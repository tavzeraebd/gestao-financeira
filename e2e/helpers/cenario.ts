import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { loginPelaTela } from "./login-pelo-formulario";
import {
  addMember,
  adminClient,
  createConfirmedUser,
  createUserWithFamily,
  env,
  type TestUser,
} from "./users";

export type Cenario = {
  owner: TestUser;
  familyId: string;
};

/** Família isolada (dono) com categorias padrão mínimas, criada pelo banco local. */
export async function criarCenario(label: string): Promise<Cenario> {
  const owner = await createUserWithFamily(label, "Ana Souza");
  const admin = adminClient();
  const { error } = await admin.from("categories").insert([
    {
      family_id: owner.familyId,
      name: "Mercado",
      type: "expense",
      color: "chart-3",
      icon: "utensils",
      created_by: owner.id,
    },
    {
      family_id: owner.familyId,
      name: "Salário",
      type: "income",
      color: "chart-1",
      icon: "briefcase",
      created_by: owner.id,
    },
  ]);
  if (error) throw new Error(`Falha ao criar categorias: ${error.message}`);
  return { owner, familyId: owner.familyId };
}

export async function criarIntegrante(
  familyId: string,
  label: string,
): Promise<TestUser> {
  const user = await createConfirmedUser(label, "Bruno Lima");
  await addMember(familyId, user, "member");
  return user;
}

export async function criarContaNoBanco(
  c: Cenario,
  nome: string,
  tipo: string = "checking",
  saldo = "0",
): Promise<string> {
  const { data, error } = await adminClient()
    .from("accounts")
    .insert({
      family_id: c.familyId,
      name: nome,
      type: tipo,
      opening_balance: saldo,
      opening_balance_date: "2026-01-01",
      created_by: c.owner.id,
    })
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`Falha ao criar conta: ${error?.message}`);
  return data.id as string;
}

export async function entrar(page: Page, user: TestUser): Promise<void> {
  await page.goto("/login");
  await loginPelaTela(page, user);
}

export async function escolher(
  page: Page,
  campo: string,
  opcao: string,
): Promise<void> {
  await page.getByRole("combobox", { name: campo, exact: true }).click();
  await page.getByRole("option", { name: opcao, exact: true }).click();
  // O popup anterior sai com animação e tem as mesmas opções: espere sumir antes do próximo seletor.
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

export async function lancar(
  page: Page,
  opts: {
    tipo: "Despesa" | "Receita" | "Transferência";
    descricao: string;
    valor: string;
    conta: string;
    destino?: string;
    categoria?: string;
  },
): Promise<void> {
  await page.goto("/transacoes/nova");
  await page.getByRole("radio", { name: opts.tipo }).click();
  await page.getByLabel("Descrição").fill(opts.descricao);
  if (opts.categoria) await escolher(page, "Categoria", opts.categoria);
  await page.getByLabel("Valor").fill(opts.valor);
  if (opts.destino) {
    await escolher(page, "Conta de origem", opts.conta);
    await escolher(page, "Conta de destino", opts.destino);
  } else {
    await escolher(page, "Conta ou cartão", opts.conta);
  }
  await page
    .getByRole("button", { name: `Salvar ${opts.tipo.toLowerCase()}` })
    .click();
  await expect(page).toHaveURL(/\/transacoes$/);
}

/** Valor em reais como aparece na tela (aceita o espaço inseparável). */
export const reais = (v: string) =>
  new RegExp(String.raw`R\$[\s ]` + v.replace(/\./g, String.raw`\.`));

/** Cliente autenticado como o usuário (passa pela RLS e pelos gatilhos, como o app). */
export async function clienteDo(user: TestUser) {
  const client = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`Falha ao entrar no banco: ${error.message}`);
  return client;
}
