import { expect, test, type Browser } from "@playwright/test";

import { loginPelaTela } from "./helpers/login-pelo-formulario";
import { sessionFile, sharedUser } from "./helpers/shared-users";
import { clearMailbox, getLatestLink } from "./helpers/mailpit";
import {
  TEST_PASSWORD,
  createConfirmedUser,
  uniqueEmail,
} from "./helpers/users";

async function gerarConvite(
  page: import("@playwright/test").Page,
  email?: string,
): Promise<string> {
  await page.goto("/familia");
  if (email) await page.getByLabel("E-mail (opcional)").fill(email);
  await page.getByRole("button", { name: "Gerar link de convite" }).click();
  const criado = page.getByTestId("convite-criado");
  await expect(criado).toBeVisible();
  const url = await criado.getByLabel("Link do convite").inputValue();
  return new URL(url).pathname;
}

function contextoComSessao(
  browser: Browser,
  role: "owner" | "member" | "outsider" | "solo",
) {
  return browser.newContext({ storageState: sessionFile(role) });
}

test.describe("Família: convites (dono)", () => {
  test.use({ storageState: sessionFile("owner") });

  test("CA-E2-55: dono gera convite, pessoa nova aceita e aparece na família", async ({
    page,
    browser,
  }, testInfo) => {
    const convidado = await createConfirmedUser(
      `convidado-${testInfo.project.name}`,
      `Fábio ${testInfo.project.name}`,
    );

    const caminho = await gerarConvite(page);
    await expect(page.getByTestId("convite-criado")).toContainText(
      "aparece só desta vez",
    );
    await expect(
      page.getByRole("button", { name: "Copiar link" }),
    ).toBeVisible();

    const semSessao = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const outra = await semSessao.newPage();
    await outra.goto(caminho);
    await expect(
      outra.getByRole("heading", {
        name: "Você foi convidado para uma família no Núcleo",
      }),
    ).toBeVisible();
    await outra.getByRole("link", { name: "Entrar" }).click();
    await loginPelaTela(outra, convidado, /\/convite\/[0-9a-f]{64}$/);

    await expect(
      outra.getByRole("heading", { name: "Convite para a família" }),
    ).toBeVisible();
    await expect(
      outra.getByText(sharedUser("owner").familyName ?? ""),
    ).toBeVisible();
    await expect(outra.getByText("Integrante", { exact: true })).toBeVisible();
    await outra.getByRole("button", { name: "Aceitar convite" }).click();
    await expect(outra).toHaveURL(/\/inicio$/);

    await outra.goto("/familia");
    await expect(outra.getByText(convidado.displayName)).toBeVisible();
    await expect(outra.getByText("(você)")).toBeVisible();

    await page.goto("/familia");
    await expect(page.getByText(convidado.displayName)).toBeVisible();

    // CA-E2-56: convite já usado mostra "já utilizado" para quem não tem família.
    const solo = await contextoComSessao(browser, "solo");
    const soloPage = await solo.newPage();
    await soloPage.goto(caminho);
    await expect(
      soloPage.getByRole("heading", { name: "Este convite já foi utilizado" }),
    ).toBeVisible();

    // Convite revogado mostra "revogado".
    const emailDoSegundo = uniqueEmail("revogar");
    const segundo = await gerarConvite(page, emailDoSegundo);
    await page.reload();
    await page
      .getByRole("button", { name: `Revogar convite para ${emailDoSegundo}` })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revogar convite" })
      .click();
    await expect(page.getByText("Convite revogado.")).toBeVisible();
    await soloPage.goto(segundo);
    await expect(
      soloPage.getByRole("heading", { name: "Este convite foi revogado" }),
    ).toBeVisible();

    await solo.close();
    await semSessao.close();
  });

  test("convite no cadastro: pessoa nova cria conta, confirma pelo e-mail e aceita", async ({
    page,
    browser,
  }, testInfo) => {
    const caminho = await gerarConvite(page);
    const email = uniqueEmail(`convite-cadastro-${testInfo.project.name}`);
    await clearMailbox(email);

    const semSessao = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const outra = await semSessao.newPage();
    await outra.goto(caminho);
    await outra.getByRole("link", { name: "Criar conta" }).click();
    await expect(outra).toHaveURL(
      /\/cadastro\?next=%2Fconvite%2F[0-9a-f]{64}$/,
    );

    await outra.getByLabel("Nome").fill("Gabi Convidada");
    await outra.getByLabel("E-mail").fill(email);
    await outra.getByLabel("Senha", { exact: true }).fill(TEST_PASSWORD);
    await outra.getByRole("button", { name: "Criar conta" }).click();
    await expect(
      outra.getByRole("heading", { name: "Confirme seu e-mail" }),
    ).toBeVisible();

    await outra.goto(await getLatestLink(email));
    await expect(outra).toHaveURL((url) => url.pathname === caminho);
    await outra.getByRole("button", { name: "Aceitar convite" }).click();
    await expect(outra).toHaveURL(/\/inicio$/);

    await outra.goto("/familia");
    await expect(outra.getByText("Gabi Convidada").first()).toBeVisible();
    await expect(outra.getByText("(você)")).toBeVisible();
    await semSessao.close();
  });

  test("CA-E2-56: aceitar convite já usado ou revogado mostra o estado final", async ({
    page,
    browser,
  }, testInfo) => {
    // Já utilizado: duas pessoas abrem o mesmo link; a primeira aceita, a segunda tenta depois.
    const usado = await gerarConvite(page);
    const solo = await contextoComSessao(browser, "solo");
    const soloPage = await solo.newPage();
    await soloPage.goto(usado);
    await expect(
      soloPage.getByRole("button", { name: "Aceitar convite" }),
    ).toBeVisible();

    const primeira = await createConfirmedUser(
      `primeira-${testInfo.project.name}`,
      "Primeira Pessoa",
    );
    const ctxPrimeira = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const pPrimeira = await ctxPrimeira.newPage();
    // Sem sessão, o convite leva ao login e volta para o convite (sem família, o destino padrão é o onboarding).
    await pPrimeira.goto(usado);
    await pPrimeira.getByRole("link", { name: "Entrar" }).click();
    await loginPelaTela(pPrimeira, primeira, /\/convite\/[0-9a-f]{64}$/);
    await pPrimeira.getByRole("button", { name: "Aceitar convite" }).click();
    await expect(pPrimeira).toHaveURL(/\/inicio$/);

    await soloPage.getByRole("button", { name: "Aceitar convite" }).click();
    await expect(
      soloPage.getByRole("heading", { name: "Este convite já foi utilizado" }),
    ).toBeVisible();
    await expect(
      soloPage.getByRole("button", { name: "Aceitar convite" }),
    ).toHaveCount(0);

    // Revogado: a página já estava aberta quando o dono revogou.
    const email = uniqueEmail("revogado-aberto");
    const revogado = await gerarConvite(page, email);
    await soloPage.goto(revogado);
    await expect(
      soloPage.getByRole("button", { name: "Aceitar convite" }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: `Revogar convite para ${email}` })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revogar convite" })
      .click();
    await expect(page.getByText("Convite revogado.")).toBeVisible();

    await soloPage.getByRole("button", { name: "Aceitar convite" }).click();
    await expect(
      soloPage.getByRole("heading", { name: "Este convite foi revogado" }),
    ).toBeVisible();
    await expect(
      soloPage.getByRole("button", { name: "Aceitar convite" }),
    ).toHaveCount(0);

    await ctxPrimeira.close();
    await solo.close();
  });

  test("convite com e-mail diferente é recusado com mensagem clara", async ({
    page,
    browser,
  }) => {
    const caminho = await gerarConvite(page, "so-este@example.test");
    const solo = await contextoComSessao(browser, "solo");
    const soloPage = await solo.newPage();
    await soloPage.goto(caminho);
    await expect(soloPage.getByText(/e-mail específico/)).toBeVisible();
    await soloPage.getByRole("button", { name: "Aceitar convite" }).click();
    await expect(
      soloPage
        .getByRole("alert")
        .filter({ hasText: "emitido para outro e-mail" }),
    ).toBeVisible();
    await solo.close();
  });

  test("e-mail inválido no convite mostra o erro no campo", async ({
    page,
  }) => {
    await page.goto("/familia");
    await page.getByLabel("E-mail (opcional)").fill("isto-nao-e-email");
    await page.getByRole("button", { name: "Gerar link de convite" }).click();
    await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
    await expect(page.getByTestId("convite-criado")).toHaveCount(0);
  });
});

test.describe("Família: outra família e integrante", () => {
  test("CA-E2-56: usuário de outra família não vê a família alheia", async ({
    browser,
  }) => {
    const outsider = sharedUser("outsider");
    const owner = sharedUser("owner");
    const contexto = await contextoComSessao(browser, "outsider");
    const page = await contexto.newPage();

    await page.goto("/familia");
    await expect(
      page.getByText(outsider.familyName ?? "").first(),
    ).toBeVisible();
    await expect(page.getByText(owner.familyName ?? "")).toHaveCount(0);
    await expect(page.getByText(owner.displayName)).toHaveCount(0);
    await page.goto("/inicio");
    await expect(page.getByText(owner.familyName ?? "")).toHaveCount(0);
    await contexto.close();
  });

  test("CA-E2-57: integrante não vê convites nem formulário de convite", async ({
    browser,
  }) => {
    const owner = sharedUser("owner");
    const contexto = await contextoComSessao(browser, "member");
    const page = await contexto.newPage();

    await page.goto("/familia");
    await expect(
      page.getByRole("heading", { name: "Família", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(owner.displayName)).toBeVisible();
    await expect(
      page.getByText("Integrante", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText("(você)")).toBeVisible();
    await expect(page.getByText("Convidar alguém")).toHaveCount(0);
    await expect(page.getByText("Convites pendentes")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Gerar link de convite" }),
    ).toHaveCount(0);
    await contexto.close();
  });
});

test.describe("Família: gestão de integrantes (Etapa 7)", () => {
  test("CA-E7-56/59: integrante vê só 'Sair da família' e sem menu de ações", async ({
    browser,
  }) => {
    const contexto = await contextoComSessao(browser, "member");
    const page = await contexto.newPage();
    await page.goto("/familia");

    await expect(
      page.getByRole("button", { name: "Sair da família" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Ações para / }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ver atividade" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: /^Editar/ })).toHaveCount(0);

    // Cancelar a confirmação não tira ninguém da família.
    await page.getByRole("button", { name: "Sair da família" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(
      "Você perde o acesso aos dados desta família",
    );
    await page.getByRole("button", { name: "Ficar na família" }).click();
    await expect(page).toHaveURL(/\/familia$/);
    await contexto.close();
  });

  test("CA-E7-55/59: dono vê as ações do integrante e a orientação para sair", async ({
    browser,
  }) => {
    const member = sharedUser("member");
    const contexto = await contextoComSessao(browser, "owner");
    const page = await contexto.newPage();
    await page.goto("/familia");

    await expect(
      page.getByText("Para sair, transfira a propriedade antes."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Ações para ${member.displayName}` })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Transferir propriedade" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Remover da família" }),
    ).toBeVisible();

    // A confirmação aparece e cancelar não muda nada.
    await page.getByRole("menuitem", { name: "Remover da família" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(
      "perde o acesso aos dados da família na hora",
    );
    await page.getByRole("button", { name: "Manter na família" }).click();
    // O diálogo sai com animação e repete o nome do integrante: espere sumir antes de conferir.
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByText(member.displayName)).toBeVisible();

    await page.getByRole("button", { name: /^Editar/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Nome da família" }),
    ).toBeVisible();
    await contexto.close();
  });
});
