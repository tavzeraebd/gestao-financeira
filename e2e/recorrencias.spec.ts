import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  criarCenario,
  criarContaNoBanco,
  clienteDo,
  criarIntegrante,
  entrar,
  type Cenario,
} from "./helpers/cenario";
import { adminClient } from "./helpers/users";

function emDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Série mensal criada direto no banco (o fluxo de criação é de /compromissos/novo). */
async function criarSerie(
  c: Cenario,
  opts: { descricao: string; falha?: string; ativa?: boolean },
): Promise<string> {
  const conta = await criarContaNoBanco(c, "Corrente", "checking", "1000");
  const admin = adminClient();
  const { data: cat } = await admin
    .from("categories")
    .select("id")
    .eq("family_id", c.familyId)
    .eq("name", "Mercado")
    .single();
  // O service_role não grava em `recurrences` (gatilhos invoker): cria pelo cliente do próprio usuário.
  const client = await clienteDo(c.owner);
  const { data, error } = await client
    .from("recurrences")
    .insert({
      family_id: c.familyId,
      type: "expense",
      account_id: conta,
      category_id: cat?.id,
      description: opts.descricao,
      amount: 1200,
      frequency: "monthly",
      interval_count: 1,
      start_date: emDias(5),
      idempotency_key: randomUUID(),
    } as never)
    .select("id")
    .single();
  if (error || !data)
    throw new Error(`Falha ao criar série: ${error?.message}`);
  if (opts.ativa === false) {
    const { error: upd } = await client
      .from("recurrences")
      .update({ is_active: false } as never)
      .eq("id", data.id);
    if (upd) throw new Error(`Falha ao pausar série: ${upd.message}`);
  }
  if (opts.falha === "ACCOUNT_ARCHIVED") {
    // A falha real: arquivar a conta pelo usuário; a próxima materialização registra ACCOUNT_ARCHIVED.
    const { error: arq } = await client
      .from("accounts")
      .update({ is_active: false } as never)
      .eq("id", conta);
    if (arq) throw new Error(`Falha ao arquivar conta: ${arq.message}`);
  }
  return data.id as string;
}

async function semRolagemHorizontal(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("CA-E5-54: pausar, reativar e encerrar a série", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`rec54-${testInfo.project.name}`);
  await criarSerie(c, { descricao: "Aluguel" });
  await entrar(page, c.owner);
  await page.goto("/recorrencias");
  await expect(page.getByRole("heading", { name: "Aluguel" })).toBeVisible();
  await expect(
    page.getByText("Todo mês, dia").filter({ visible: true }),
  ).toBeVisible();
  await semRolagemHorizontal(page);

  await page.getByRole("button", { name: "Pausar Aluguel" }).click();
  await expect(page.getByRole("heading", { name: "Aluguel" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Nenhuma recorrência" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Pausadas" }).click();
  await expect(page.getByText("Pausada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reativar Aluguel" }).click();
  await expect(page.getByRole("heading", { name: "Aluguel" })).toHaveCount(0);

  await page.getByRole("link", { name: "Ativas" }).click();
  await expect(page.getByRole("heading", { name: "Aluguel" })).toBeVisible();
  await page.getByRole("button", { name: "Encerrar Aluguel" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "As próximas ocorrências que você não alterou deixam de existir",
  );
  await page.getByRole("button", { name: "Encerrar série" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Termina em \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
});

test("editar a série mantém a frequência só para leitura", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`rec-ed-${testInfo.project.name}`);
  const id = await criarSerie(c, { descricao: "Internet" });
  await entrar(page, c.owner);
  await page.goto(`/recorrencias/${id}/editar`);
  await expect(
    page
      .getByText("Para mudar a frequência, encerre esta série e crie outra.")
      .filter({ visible: true }),
  ).toBeVisible();
  await page.getByLabel("Descrição").fill("Internet fibra");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page).toHaveURL(/\/recorrencias$/);
  await expect(
    page.getByRole("heading", { name: "Internet fibra" }),
  ).toBeVisible();
});

test("série com conta arquivada mostra Precisa de atenção com o próximo passo", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`rec-at-${testInfo.project.name}`);
  await criarSerie(c, { descricao: "Plano", falha: "ACCOUNT_ARCHIVED" });
  await entrar(page, c.owner);
  await page.goto("/recorrencias");
  await expect(
    page.getByText("Precisa de atenção").filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByText(/Edite a série e escolha outra conta/)
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: "Editar série" })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

test("vazio e permissão: integrante sem autoria não vê ações; outsider recebe não encontrada (CA-E5-60)", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`rec60-${testInfo.project.name}`);
  const id = await criarSerie(c, { descricao: "Seguro" });
  const outro = await criarCenario(`rec60b-${testInfo.project.name}`);

  const member = await criarIntegrante(
    c.familyId,
    `rec60m-${testInfo.project.name}`,
  );
  await entrar(page, member);
  await page.goto("/recorrencias");
  await expect(page.getByRole("heading", { name: "Seguro" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pausar/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Editar série/ })).toHaveCount(
    0,
  );
  await page.goto(`/recorrencias/${id}/editar`);
  await expect(page.getByText(/não encontrada/i).first()).toBeVisible();

  await page.context().clearCookies();
  await entrar(page, outro.owner);
  await page.goto("/recorrencias");
  await expect(
    page.getByRole("heading", { name: "Nenhuma recorrência" }),
  ).toBeVisible();
  await page.goto(`/recorrencias/${id}/editar`);
  await expect(page.getByText(/não encontrada/i).first()).toBeVisible();
});
