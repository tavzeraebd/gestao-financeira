import { expect, test } from "@playwright/test";

/**
 * CA-E8-30 (formulários de autenticação, sem banco): rótulo e autocomplete corretos, colar
 * permitido, erro ligado por aria-describedby/aria-invalid e foco no primeiro erro (3.3.1,
 * 3.3.3, 3.3.8, 1.3.5). O envio com dados válidos exige Supabase e fica no E2E com Docker.
 */
type Campo = { rotulo: string; exato?: boolean; autocomplete: string };

const FORMULARIOS: {
  rota: string;
  enviar: string;
  campos: Campo[];
}[] = [
  {
    rota: "/login",
    enviar: "Entrar",
    campos: [
      { rotulo: "E-mail", autocomplete: "email" },
      { rotulo: "Senha", exato: true, autocomplete: "current-password" },
    ],
  },
  {
    rota: "/cadastro",
    enviar: "Criar conta",
    campos: [
      { rotulo: "Nome", autocomplete: "name" },
      { rotulo: "E-mail", autocomplete: "email" },
      { rotulo: "Senha", exato: true, autocomplete: "new-password" },
    ],
  },
  {
    rota: "/recuperar-senha",
    enviar: "Enviar link",
    campos: [{ rotulo: "E-mail", autocomplete: "email" }],
  },
];

for (const form of FORMULARIOS) {
  test.describe(form.rota, () => {
    test("todo campo tem label e autocomplete correto (1.3.5)", async ({
      page,
    }) => {
      await page.goto(form.rota);
      for (const c of form.campos) {
        const campo = page
          .getByLabel(c.rotulo, { exact: c.exato ?? false })
          .first();
        await expect(campo, `campo ${c.rotulo}`).toBeVisible();
        await expect(campo).toHaveAttribute("autocomplete", c.autocomplete);
      }
      // Nenhum campo sem nome acessível.
      const semNome = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLInputElement>(
            "input:not([type=hidden])",
          ),
        )
          .filter(
            (i) =>
              !i.labels?.length &&
              !i.getAttribute("aria-label") &&
              !i.getAttribute("aria-labelledby"),
          )
          .map((i) => i.name || i.id),
      );
      expect(semNome).toEqual([]);
    });

    test("colar é permitido nos campos (3.3.8)", async ({ page }) => {
      await page.goto(form.rota);
      for (const c of form.campos) {
        const campo = page
          .getByLabel(c.rotulo, { exact: c.exato ?? false })
          .first();
        const bloqueado = await campo.evaluate((el) => {
          const dados = new DataTransfer();
          dados.setData("text/plain", "valor-colado");
          const evento = new ClipboardEvent("paste", {
            clipboardData: dados,
            bubbles: true,
            cancelable: true,
          });
          el.dispatchEvent(evento);
          return evento.defaultPrevented;
        });
        expect(bloqueado, `${c.rotulo}: paste cancelado`).toBe(false);
      }
    });

    test("envio vazio: erros ligados por aria-describedby/aria-invalid e foco no primeiro erro (3.3.1)", async ({
      page,
    }) => {
      await page.goto(form.rota);
      const enviar = page.getByRole("button", {
        name: form.enviar,
        exact: true,
      });
      await expect(enviar).toBeEnabled(); // hidratou
      await enviar.click();

      const invalidos = page.locator("input[aria-invalid='true']");
      await expect(invalidos.first()).toBeVisible();
      expect(await invalidos.count()).toBeGreaterThan(0);

      const ligacao = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLInputElement>(
            "input[aria-invalid='true']",
          ),
        ).map((i) => {
          const ids = (i.getAttribute("aria-describedby") ?? "")
            .split(/\s+/)
            .filter(Boolean);
          const textos = ids.map(
            (id) => document.getElementById(id)?.textContent?.trim() ?? "",
          );
          return {
            campo: i.id,
            ids,
            temTexto: textos.some((t) => t.length > 0),
          };
        }),
      );
      for (const l of ligacao) {
        expect(l.ids.length, `${l.campo}: aria-describedby`).toBeGreaterThan(0);
        expect(l.temTexto, `${l.campo}: mensagem de erro com texto`).toBe(true);
      }

      // Foco no primeiro campo inválido.
      const primeiro = await invalidos.first().getAttribute("id");
      const focado = await page.evaluate(
        () => document.activeElement?.id ?? "",
      );
      expect(focado, "foco no primeiro erro").toBe(primeiro);
    });
  });
}
