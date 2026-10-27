import { expect, test } from "@playwright/test";

import {
  clienteDo,
  criarCenario,
  criarContaNoBanco,
  criarIntegrante,
  entrar,
} from "./helpers/cenario";
import { createUserWithFamily } from "./helpers/users";

const visivel = (page: import("@playwright/test").Page, texto: string | RegExp) =>
  page.getByText(texto).filter({ visible: true }).first();

/** Semeia a meta pelo cliente do próprio dono (passa pela RLS e pelos gatilhos). */
async function semearMeta(
  c: Awaited<ReturnType<typeof criarCenario>>,
  nome: string,
  valor = "5000.00",
): Promise<string> {
  const { data, error } = await (await clienteDo(c.owner))
    .from("goals")
    .insert({
      family_id: c.familyId,
      name: nome,
      target_amount: valor,
      icon: "plane",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

test("CA-E6-50: criar meta, aportar e retirar; saldo das contas não muda", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`m50-${testInfo.project.name}`);
  await criarContaNoBanco(c, "Corrente", "checking", "1000");
  await entrar(page, c.owner);

  await page.goto("/metas");
  await expect(visivel(page, "Nenhuma meta ainda")).toBeVisible();

  await page.goto("/metas/nova");
  await page.getByLabel("Nome").fill("Viagem");
  await page.getByLabel("Valor da meta").fill("5000");
  await page.getByRole("button", { name: "Salvar meta" }).click();
  await expect(page).toHaveURL(/\/metas\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Viagem" })).toBeVisible();

  await page.goto("/metas");
  const cartao = page.getByTestId("meta").filter({ hasText: "Viagem" });
  await expect(cartao).toContainText("0%");
  await expect(cartao).toContainText("Sem estimativa");
  await cartao.getByRole("link", { name: "Viagem" }).click();

  await page.getByRole("button", { name: "Registrar aporte" }).click();
  await page.getByLabel("Valor").fill("400");
  await page.getByRole("button", { name: "Salvar aporte" }).click();
  await expect(page.getByLabel("Valor")).toHaveCount(0);

  await page.getByRole("button", { name: "Registrar retirada" }).click();
  await page.getByLabel("Valor").fill("100");
  await page.getByRole("button", { name: "Salvar retirada" }).click();
  await expect(page.getByLabel("Valor")).toHaveCount(0);

  const progresso = page.getByTestId("progresso");
  await expect(progresso).toContainText(/R\$\s300,00/);
  await expect(progresso).toContainText("6%");
  await expect(page.getByTestId("estimativa")).toContainText(/90 dias/);

  await page.goto("/contas");
  await expect(page.getByText(/R\$\s1\.000,00/).first()).toBeVisible();
});

test("CA-E6-51: retirada maior que o guardado erra no campo Valor e mantém os dados", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`m51-${testInfo.project.name}`);
  const id = await semearMeta(c, "Reserva");
  await entrar(page, c.owner);
  await page.goto(`/metas/${id}`);
  await page.getByRole("button", { name: "Registrar retirada" }).click();
  await page.getByLabel("Valor").fill("50");
  await page.getByRole("button", { name: "Salvar retirada" }).click();
  await expect(
    page.getByText(/O valor guardado não pode ficar negativo/).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Valor")).toHaveValue("50,00");
});

test("CA-E6-52: pausar, reativar, concluir e meta cancelada sem edição", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`m52-${testInfo.project.name}`);
  const id = await semearMeta(c, "Carro");
  await entrar(page, c.owner);
  await page.goto(`/metas/${id}`);

  await page.getByRole("button", { name: /^Pausar meta/ }).click();
  await expect(visivel(page, "Pausada")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Registrar aporte" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: /^Reativar meta/ }).click();
  await expect(
    page.getByRole("button", { name: "Registrar aporte" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Concluir meta/ }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Concluir meta", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Concluir meta/ }),
  ).toHaveCount(0);
  await page.goto("/metas?situacao=concluidas");
  await expect(page.getByTestId("meta").filter({ hasText: "Carro" })).toBeVisible();

  const id2 = await semearMeta(c, "Casa");
  await page.goto(`/metas/${id2}`);
  await page.getByRole("button", { name: /^Cancelar meta/ }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancelar meta", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Editar meta/ })).toHaveCount(0);
});

test("CA-E6-53: member vê metas sem ações de gestão e registra aporte no próprio nome", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`m53-${testInfo.project.name}`);
  const id = await semearMeta(c, "Viagem");
  const membro = await criarIntegrante(c.familyId, `m53m-${testInfo.project.name}`);
  await entrar(page, membro);

  await page.goto("/metas");
  await expect(page.getByTestId("meta").filter({ hasText: "Viagem" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nova meta" })).toHaveCount(0);

  await page.goto(`/metas/${id}`);
  await expect(page.getByRole("button", { name: /^Pausar meta/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Registrar aporte" }).click();
  await expect(page.getByLabel("Integrante")).toBeDisabled();
  await page.getByLabel("Valor").fill("20");
  await page.getByRole("button", { name: "Salvar aporte" }).click();
  await expect(page.getByLabel("Valor")).toHaveCount(0);

  await page.goto("/metas/nova");
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
});

test("CA-E6-58: em 390x844 a lista vira cartões, a barra tem Metas e não há rolagem horizontal", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`m58-${testInfo.project.name}`);
  await semearMeta(c, "Viagem");
  await entrar(page, c.owner);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/metas");
  await expect(page.getByTestId("meta").first()).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(nav.getByRole("link", { name: "Metas" })).toBeVisible();
  const rolagem = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(rolagem).toBe(false);
});

test("CA-E6-60: outsider em /metas/<id de outra família> vê página não encontrada", async ({
  page,
}, testInfo) => {
  const c = await criarCenario(`m60-${testInfo.project.name}`);
  const id = await semearMeta(c, "Viagem");
  const outro = await createUserWithFamily(`m60o-${testInfo.project.name}`, "Outro");
  await entrar(page, outro);
  await page.goto(`/metas/${id}`);
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
});
