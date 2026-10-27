import { expect, test } from "@playwright/test";

test.describe("Tela de login (CA-E1-10)", () => {
  test("mostra logo, slogan, campos e ações, sem OAuth", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("img", { name: "Núcleo" }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("Sua família no controle do dinheiro."),
    ).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Mostrar senha" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Entrar", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Criar conta" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Esqueci minha senha" }),
    ).toBeVisible();

    await expect(page.getByText(/google|apple/i)).toHaveCount(0);
  });

  test("mostrar/ocultar senha alterna o tipo do campo", async ({ page }) => {
    await page.goto("/login");
    const senha = page.getByLabel("Senha", { exact: true });
    await expect(senha).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Mostrar senha" }).click();
    await expect(senha).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Ocultar senha" }).click();
    await expect(senha).toHaveAttribute("type", "password");
  });

  test("valida os campos antes de enviar", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
    await expect(page.getByText("Informe sua senha.")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("avisa sobre link inválido e sessão expirada", async ({ page }) => {
    await page.goto("/login?erro=link_invalido");
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "O link é inválido ou expirou. Solicite um novo." }),
    ).toBeVisible();

    await page.goto("/login?motivo=sessao_expirada");
    await expect(
      page.getByRole("status").filter({ hasText: "Sua sessão expirou" }),
    ).toBeVisible();
  });
});

test.describe("Cabeçalhos de segurança (CA-E1-11, CA-E2-60)", () => {
  test("rotas comuns trazem os cabeçalhos do contrato", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(headers["x-powered-by"]).toBeUndefined();
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  test("/convite/<token> responde com Referrer-Policy: no-referrer", async ({
    request,
  }) => {
    const response = await request.get(`/convite/${"a".repeat(64)}`);
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["strict-transport-security"]).toBe(
      "max-age=63072000; includeSubDomains",
    );
  });
});

test.describe("Envio sem JavaScript (SEC-1, ADR-0017)", () => {
  test("enviar o login sem JS não coloca e-mail nem senha na URL", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto("/login");

    for (const form of await page.locator("form").all()) {
      await expect(form).toHaveAttribute("method", "post");
    }
    // Sem JS o Next só mostra o fallback de carregamento; se algum formulário
    // aparecer, o envio precisa continuar bloqueado.
    const senhaSecreta = "Segredo-sem-js-9";
    const entrar = page.getByRole("button", { name: "Entrar", exact: true });
    if ((await entrar.count()) > 0) {
      await expect(entrar).toBeDisabled();
      await page.getByLabel("E-mail").fill("alguem@example.test");
      const senha = page.getByLabel("Senha", { exact: true });
      await senha.fill(senhaSecreta);
      await senha.press("Enter");
      await entrar.click({ force: true, noWaitAfter: true });
    }
    await page.waitForTimeout(500);

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.search).not.toMatch(/alguem|example|senha|password|Segredo/i);
    expect(page.url()).not.toContain(senhaSecreta);
    await context.close();
  });
});

test.describe("Convite sem sessão", () => {
  test("convida a entrar ou criar conta e preserva o convite em next", async ({
    page,
  }) => {
    const token = "b".repeat(64);
    await page.goto(`/convite/${token}`);
    await expect(
      page.getByRole("heading", {
        name: "Você foi convidado para uma família no Núcleo",
      }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Entrar" }).click();
    await expect(page).toHaveURL(
      `/login?next=${encodeURIComponent(`/convite/${token}`)}`,
    );
  });
});
