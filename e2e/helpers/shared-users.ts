import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { TestUser } from "./users";

export const AUTH_DIR = join(process.cwd(), "e2e", ".auth");

export type SharedRole = "owner" | "member" | "outsider" | "solo";

export type SharedUser = TestUser & { familyName: string | null };

export const sessionFile = (role: SharedRole) => join(AUTH_DIR, `${role}.json`);

/** Usuários criados uma vez por execução no global-setup. */
export function sharedUser(role: SharedRole): SharedUser {
  return JSON.parse(readFileSync(join(AUTH_DIR, "users.json"), "utf8"))[role];
}
