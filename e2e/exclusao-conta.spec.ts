import { expect, test, type Locator, type Page } from "@playwright/test";

import { auditar, resumir } from "./helpers/a11y";
import { criarCenario, criarIntegrante, entrar } from "./helpers/cenario";
import {
  TEST_PASSWORD,
  addMember,
  adminClient,
  createConfirmedUser,
  createUserWithFamily,
  type TestUser,
} from "./helpers/users";

/**
 * Exclusão da própria conta (ADR-0038, CA-E9-44/47/48). Cada teste cria o PRÓPRIO usuário e a PRÓPRIA
 * família: a conta é destruída no fim, então nunca se usa o dono compartilhado (`shared-users`).
 * Desktop e 390 px vêm dos projetos do Playwright.
 */

const REGIAO = "Excluir conta";

function regiao(page: Page) {
  return page.getByRole("region", { name: REGIAO });
}

async function abrirDialogo(page: Page) {
  await page.goto("/configuracoes");
  await regiao(page)
    .getByRole("button", { name: "Excluir minha conta" })
    .click();
  const dialogo = page.getByRole("alertdialog", { name: "Excluir sua conta?" });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

async function confirmar(
  dialogo: Locator,
  senha: string,
  confirmacao = "EXCLUIR",
) {
  await dialogo.getByLabel("Senha", { exact: true }).fill(senha);
  await dialogo.getByLabel("Digite EXCLUIR para confirmar").fill(confirmacao);
  await dialogo
    .getByRole("button", { name: "Excluir conta definitivamente" })
    .click();
}

async function conferirSaidaParaLogin(page: Page, usuario: TestUser) {
  await expect(page).toHaveURL(/\/login\?conta=excluida$/, {
    timeout: 30_000,
  });
  await expect(page.getByRole("status")).toContainText(
    "Sua conta foi excluída.",
  );

  // Voltar com o botão do navegador não mostra dado: toda rota privada redireciona ao login.
  await page.goto("/configuracoes");
  await expect(page).toHaveURL(/\/login\?next=%2Fconfiguracoes$/);
  await page.evaluate(() => history.back());
  await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
  await expect(page.getByText(usuario.displayName)).toHaveCount(0);

  // A senha antiga não entra mais.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(usuario.email);
  await page.getByLabel("Senha", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos" }),
  ).toBeVisible();
}

async function perfil(userId: string) {
  const { data, error } = await adminClient()
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .single();
  if (error) throw new Error(`Falha ao ler o perfil: ${error.message}`);
  return data as { display_name: string; avatar_url: string | null };
}

async function statusDoVinculo(familyId: string, userId: string) {
  const { data, error } = await adminClient()
    .from("family_members")
    .select("status")
    .eq("family_id", familyId)
    .eq("user_id", userId)
    .single();
  if (error) throw new Error(`Falha ao ler o vínculo: ${error.message}`);
  return (data as { status: string }).status;
}

async function familiaExiste(familyId: string) {
  const { data, error } = await adminClient()
    .from("families")
    .select("id")
    .eq("id", familyId);
  if (error) throw new Error(`Falha ao ler a família: ${error.message}`);
  return (data ?? []).length > 0;
}

test.describe("@docker Excluir conta pela interface (CA-E9-44, CA-E9-47)", () => {
  test("integrante: sai da família, perfil anonimizado, a família segue", async ({
    page,
  }, testInfo) => {
    const rotulo = testInfo.project.name;
    const c = await criarCenario(`ex-membro-${rotulo}`);
    const membro = await criarIntegrante(c.familyId, `ex-membro-u-${rotulo}`);

    await entrar(page, membro);
    await page.goto("/configuracoes");
    await expect(regiao(page)).toContainText("Você sai da família");
    await expect(regiao(page)).toContainText("continua com a família");

    const dialogo = await abrirDialogo(page);
    await confirmar(dialogo, membro.password);
    await conferirSaidaParaLogin(page, membro);

    expect(await statusDoVinculo(c.familyId, membro.id)).toBe("left");
    expect((await perfil(membro.id)).display_name).toBe("Conta excluída");
    expect(await familiaExiste(c.familyId)).toBe(true);
    expect(await statusDoVinculo(c.familyId, c.owner.id)).toBe("active");
  });

  test("administrador: mesmo resultado do integrante", async ({
    page,
  }, testInfo) => {
    const rotulo = testInfo.project.name;
    const c = await criarCenario(`ex-admin-${rotulo}`);
    const admin = await createConfirmedUser(
      `ex-admin-u-${rotulo}`,
      "Carla Admin",
    );
    await addMember(c.familyId, admin, "admin");

    await entrar(page, admin);
    const dialogo = await abrirDialogo(page);
    await confirmar(dialogo, admin.password);
    await conferirSaidaParaLogin(page, admin);

    expect(await statusDoVinculo(c.familyId, admin.id)).toBe("left");
    expect((await perfil(admin.id)).display_name).toBe("Conta excluída");
    expect(await familiaExiste(c.familyId)).toBe(true);
  });

  test("dono com outros integrantes: bloqueado, com orientação e link para a família", async ({
    page,
  }, testInfo) => {
    const rotulo = testInfo.project.name;
    const c = await criarCenario(`ex-dono-outros-${rotulo}`);
    await criarIntegrante(c.familyId, `ex-dono-outros-m-${rotulo}`);

    await entrar(page, c.owner);
    await page.goto("/configuracoes");

    await expect(regiao(page)).toContainText("Transfira a propriedade antes");
    await expect(
      regiao(page).getByRole("button", { name: "Excluir minha conta" }),
    ).toHaveCount(0);
    await regiao(page).getByRole("link", { name: "Ir para Família" }).click();
    await expect(page).toHaveURL(/\/familia$/);

    expect(await familiaExiste(c.familyId)).toBe(true);
    expect(await statusDoVinculo(c.familyId, c.owner.id)).toBe("active");
    expect((await perfil(c.owner.id)).display_name).not.toBe("Conta excluída");
  });

  test("dono sozinho: a família inteira e os dados são apagados", async ({
    page,
  }, testInfo) => {
    const rotulo = testInfo.project.name;
    const c = await criarCenario(`ex-dono-so-${rotulo}`);

    await entrar(page, c.owner);
    await page.goto("/configuracoes");
    await expect(regiao(page)).toContainText(
      "Você é a única pessoa da família",
    );
    await expect(regiao(page)).toContainText(
      "todos os dados dela serão apagados",
    );

    const dialogo = await abrirDialogo(page);
    await expect(dialogo).toContainText(
      "ela e todos os dados dela serão apagados",
    );
    await confirmar(dialogo, c.owner.password);
    await conferirSaidaParaLogin(page, c.owner);

    expect(await familiaExiste(c.familyId)).toBe(false);
    const { data } = await adminClient()
      .from("categories")
      .select("id")
      .eq("family_id", c.familyId);
    expect(data ?? []).toHaveLength(0);
    expect((await perfil(c.owner.id)).display_name).toBe("Conta excluída");
  });

  test("senha errada e confirmação errada: erros nos campos, foco e nada muda", async ({
    page,
  }, testInfo) => {
    const user = await createUserWithFamily(
      `ex-erros-${testInfo.project.name}`,
      "Dora Teste",
    );
    await entrar(page, user);
    const dialogo = await abrirDialogo(page);
    const campoSenha = dialogo.getByLabel("Senha", { exact: true });
    const campoConfirmacao = dialogo.getByLabel(
      "Digite EXCLUIR para confirmar",
    );

    // Vazio: o cliente valida, foca o primeiro campo e liga o erro por aria-describedby.
    await dialogo
      .getByRole("button", { name: "Excluir conta definitivamente" })
      .click();
    await expect(dialogo.getByText("Informe sua senha.")).toBeVisible();
    await expect(campoSenha).toBeFocused();
    await expect(campoSenha).toHaveAttribute("aria-invalid", "true");
    await expect(campoSenha).toHaveAttribute(
      "aria-describedby",
      "excluir-conta-senha-erro",
    );

    // Confirmação em minúsculas não vale.
    await confirmar(dialogo, TEST_PASSWORD, "excluir");
    await expect(
      dialogo.getByText("Digite EXCLUIR para confirmar.", { exact: true }),
    ).toBeVisible();
    await expect(campoConfirmacao).toBeFocused();

    // Senha errada: mensagem do servidor no campo da senha, sem detalhe técnico.
    await campoSenha.fill("senha-errada-9");
    await campoConfirmacao.fill("EXCLUIR");
    await dialogo
      .getByRole("button", { name: "Excluir conta definitivamente" })
      .click();
    const erro = dialogo.getByText(/E-mail ou senha incorretos/);
    await expect(erro).toBeVisible({ timeout: 30_000 });
    await expect(campoSenha).toBeFocused();
    await expect(campoSenha).toHaveValue("");
    await expect(campoSenha).toHaveAttribute(
      "aria-describedby",
      "excluir-conta-senha-erro",
    );
    await expect(dialogo).not.toContainText(/stack|supabase|postgres|rpc/i);

    // Cancelar fecha e nada foi excluído.
    await dialogo.getByRole("button", { name: "Manter minha conta" }).click();
    await expect(dialogo).toHaveCount(0);
    expect(await familiaExiste(user.familyId)).toBe(true);
    expect((await perfil(user.id)).display_name).toBe("Dora Teste");
  });

  test("acessibilidade da seção e do diálogo aberto (axe) e foco devolvido ao fechar", async ({
    page,
  }, testInfo) => {
    const user = await createUserWithFamily(
      `ex-a11y-${testInfo.project.name}`,
      "Eli Teste",
    );
    await entrar(page, user);
    await page.goto("/configuracoes");
    await expect(regiao(page)).toBeVisible();

    const secao = await auditar(page, { testInfo });
    expect(
      secao.bloqueantes.length,
      resumir(secao.bloqueantes).join("\n"),
    ).toBe(0);

    const gatilho = regiao(page).getByRole("button", {
      name: "Excluir minha conta",
    });
    const alturaGatilho = await gatilho.boundingBox();
    expect(alturaGatilho?.height ?? 0).toBeGreaterThanOrEqual(40);

    const dialogo = await abrirDialogo(page);
    const aberto = await auditar(page, {
      testInfo,
      incluir: '[role="alertdialog"]',
    });
    expect(
      aberto.bloqueantes.length,
      resumir(aberto.bloqueantes).join("\n"),
    ).toBe(0);

    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);
    await expect(gatilho).toBeFocused();
  });
});

test.describe("Login: aviso de conta excluída (CA-E9-48)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("?conta=excluida mostra o aviso e mantém o formulário", async ({
    page,
  }) => {
    await page.goto("/login?conta=excluida");
    await expect(page.getByRole("status")).toContainText(
      "Sua conta foi excluída.",
    );
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Entrar", exact: true }),
    ).toBeVisible();
  });

  test("outros valores de ?conta= são ignorados", async ({ page }) => {
    await page.goto("/login?conta=x");
    await expect(page.getByText("Sua conta foi excluída.")).toHaveCount(0);
    await page.goto("/login");
    await expect(page.getByText("Sua conta foi excluída.")).toHaveCount(0);
  });

  test("convive com o aviso de sessão expirada", async ({ page }) => {
    await page.goto("/login?conta=excluida&motivo=sessao_expirada");
    await expect(page.getByText("Sua conta foi excluída.")).toBeVisible();
    await expect(page.getByText("Sua sessão expirou.")).toBeVisible();
  });
});
