import { expect, test, type Browser } from "@playwright/test";

import { loginPelaTela } from "./helpers/login-pelo-formulario";
import { clearMailbox, getLatestLink } from "./helpers/mailpit";
import {
  TEST_PASSWORD,
  createUserWithFamily,
  uniqueEmail,
} from "./helpers/users";

const NOVA_SENHA = "Outra-senha-2";

function paginaSemSessao(browser: Browser) {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}

test("CA-E2-50: cadastro, confirmação por e-mail, onboarding e início vazio", async ({
  page,
}, testInfo) => {
  const email = uniqueEmail(`cadastro-${testInfo.project.name}`);

  await page.goto("/cadastro");
  await page.getByLabel("Nome").fill("Ana Teste");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();

  // Compilação a frio e suíte em paralelo: com carga passa de 10 s.
  await expect(
    page.getByRole("heading", { name: "Confirme seu e-mail" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(`Enviamos um link de confirmação para`),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reenviar confirmação" }),
  ).toBeVisible();

  const link = await getLatestLink(email);
  await page.goto(link);

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "Crie sua família" }),
  ).toBeVisible();
  await expect(page.getByText(/aceite por lá/)).toBeVisible();
  await page.getByLabel("Nome da família").fill("Família Teste");
  await page.getByRole("button", { name: "Criar família" }).click();

  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole("heading", { name: "Olá, Ana!" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Cadastre sua primeira conta" }),
  ).toBeVisible();
  await expect(page.getByText(/R\$|\d+,\d{2}/)).toHaveCount(0);
});

test("CA-E2-51: senha errada mostra erro genérico, mantém o e-mail e impede duplo envio", async ({
  page,
}) => {
  const user = await createUserWithFamily("senha-errada");
  let envios = 0;
  await page.route("**/login", async (route) => {
    if (route.request().method() === "POST") {
      envios += 1;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill("senha-errada-9");
  const entrar = page.getByRole("button", { name: "Entrar", exact: true });
  await entrar.click();

  await expect(entrar).toBeDisabled();
  await expect(entrar).toHaveAttribute("aria-busy", "true");

  const alerta = page
    .getByRole("alert")
    .filter({ hasText: "E-mail ou senha incorretos" });
  await expect(alerta).toBeVisible();
  expect(envios).toBe(1);
  await expect(page.getByLabel("E-mail")).toHaveValue(user.email);
  await expect(page.getByLabel("Senha", { exact: true })).toHaveValue("");
  await expect(entrar).toBeEnabled();
});

test("CA-E2-51: Enter repetido não envia o login duas vezes", async ({
  page,
}) => {
  const user = await createUserWithFamily("enter-duplo");
  let envios = 0;
  await page.route("**/login", async (route) => {
    if (route.request().method() === "POST") {
      envios += 1;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.continue();
  });

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(user.email);
  const senha = page.getByLabel("Senha", { exact: true });
  await senha.fill("senha-errada-9");
  const entrar = page.getByRole("button", { name: "Entrar", exact: true });
  await expect(entrar).toBeEnabled();
  await senha.press("Enter");
  await expect(entrar).toBeDisabled();
  await senha.press("Enter");
  await senha.press("Enter");

  await expect(
    page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos" }),
  ).toBeVisible();
  expect(envios).toBe(1);
});

test("CA-E2-52: rota privada sem sessão vai ao login e volta após entrar", async ({
  page,
}) => {
  const user = await createUserWithFamily("next");

  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/login\?next=%2Finicio$/);
  await loginPelaTela(page, user);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Olá,");
});

test("CA-E2-53 e CA-E2-58: sair protege as rotas e o tema escolhido persiste", async ({
  page,
}) => {
  const user = await createUserWithFamily("sair", "Eva Nunes");

  await page.goto("/login");
  await loginPelaTela(page, user);
  await expect(page.getByRole("heading", { name: "Olá, Eva!" })).toBeVisible();

  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Escuro" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(true);
  await page.reload();
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Sair da conta" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/familia");
  await expect(page).toHaveURL(/\/login\?next=%2Ffamilia$/);
  // Voltar até a tela privada: o servidor deve redirecionar ao login, sem dados.
  // history.back() sem esperar a navegação: o redirecionamento do servidor aborta o goBack().
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/login$/);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/login");
  await expect(page.getByText(user.familyName)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Família", exact: true }),
  ).toHaveCount(0);

  // Tema segue o navegador: continua escuro após novo login, com os mesmos dados.
  await page.goto("/login");
  await loginPelaTela(page, user);
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    ),
  ).toBe(true);
  await expect(page.getByRole("heading", { name: "Olá, Eva!" })).toBeVisible();
  await page.goto("/familia");
  await expect(page.getByText(user.familyName).first()).toBeVisible();
});

test("CA-E2-54: recuperação de senha de ponta a ponta", async ({
  page,
  browser,
}) => {
  const user = await createUserWithFamily("recuperar");
  await clearMailbox(user.email);

  await page.goto("/recuperar-senha");
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(
    page.getByText("Se houver uma conta para este e-mail, enviaremos um link."),
  ).toBeVisible();

  const link = await getLatestLink(user.email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/redefinir-senha$/);

  await page.getByLabel("Nova senha", { exact: true }).fill(NOVA_SENHA);
  await page.getByLabel("Confirmar nova senha").fill(NOVA_SENHA);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  // Server action + redirect que renderiza /inicio: com a suíte em paralelo passa de 10 s.
  await expect(page).toHaveURL(/\/inicio$/, { timeout: 30_000 });

  // Sem sessão: /redefinir-senha leva a /recuperar-senha; link usado de novo é inválido.
  const semSessao = await paginaSemSessao(browser);
  const outra = await semSessao.newPage();
  await outra.goto("/redefinir-senha");
  await expect(outra).toHaveURL(/\/recuperar-senha$/);

  await outra.goto(link);
  await expect(outra).toHaveURL(/\/login\?erro=link_invalido$/);
  await expect(
    outra
      .getByRole("alert")
      .filter({ hasText: "O link é inválido ou expirou" }),
  ).toBeVisible();

  await loginPelaTela(outra, { email: user.email, password: NOVA_SENHA });
  await semSessao.close();
});
