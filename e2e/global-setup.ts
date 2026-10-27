import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

import { AUTH_DIR, sessionFile, type SharedRole } from "./helpers/shared-users";
import {
  addMember,
  createConfirmedUser,
  createFamilyFor,
  type TestUser,
} from "./helpers/users";

/**
 * Cria 4 usuários compartilhados (dono, integrante, outra família, sem família)
 * e salva a sessão de cada um. Os testes só abrem o app já autenticado, para
 * não estourar o limite de logins do Auth local (30 a cada 5 min por IP).
 */
export default async function globalSetup(config: FullConfig) {
  mkdirSync(AUTH_DIR, { recursive: true });
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";

  const owner = await createConfirmedUser("dono", "Ana Souza");
  const ownerFamilyName = "Família Souza";
  const familyId = await createFamilyFor(owner, ownerFamilyName);

  const member = await createConfirmedUser("integrante", "Bruno Lima");
  await addMember(familyId, member, "member");

  const outsider = await createConfirmedUser("outra", "Carla Dias");
  const outsiderFamilyName = "Família Dias";
  await createFamilyFor(outsider, outsiderFamilyName);

  const solo = await createConfirmedUser("sem-familia", "Davi Rocha");

  const users: Record<SharedRole, TestUser & { familyName: string | null }> = {
    owner: { ...owner, familyName: ownerFamilyName },
    member: { ...member, familyName: ownerFamilyName },
    outsider: { ...outsider, familyName: outsiderFamilyName },
    solo: { ...solo, familyName: null },
  };
  writeFileSync(`${AUTH_DIR}/users.json`, JSON.stringify(users, null, 2));

  const browser = await chromium.launch();
  try {
    for (const role of Object.keys(users) as SharedRole[]) {
      const user = users[role];
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("E-mail").fill(user.email);
      await page.getByLabel("Senha", { exact: true }).fill(user.password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.waitForURL(role === "solo" ? /\/onboarding$/ : /\/inicio$/);
      await context.storageState({ path: sessionFile(role) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
