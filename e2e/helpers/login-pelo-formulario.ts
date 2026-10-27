import { expect, type Page } from "@playwright/test";

import type { TestUser } from "./users";

/** Entra pela tela de login (consome 1 do limite de logins do Auth local). */
export async function loginPelaTela(
  page: Page,
  user: Pick<TestUser, "email" | "password">,
  expectedUrl: RegExp = /\/inicio$/,
): Promise<void> {
  await page.getByLabel("E-mail").fill(user.email);
  await page.getByLabel("Senha", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(expectedUrl);
}
