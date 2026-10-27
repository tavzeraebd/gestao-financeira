import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TEST_PASSWORD = "Senha-de-teste-1";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  displayName: string;
};

/** Lê o `.env.local` só aqui (E2E); a secret key nunca entra em `src/`. */
function readEnvLocal(): Record<string, string> {
  const path = join(process.cwd(), ".env.local");
  const values: Record<string, string> = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match?.[1]) continue;
    values[match[1]] = (match[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return values;
}

export function env(name: string): string {
  const value = process.env[name] ?? readEnvLocal()[name];
  if (!value) {
    throw new Error(
      `${name} ausente. Rode "pnpm db:start" e crie .env.local a partir de "pnpm db:status".`,
    );
  }
  return value;
}

/** SEC-8: a secret key só é usada contra o Supabase local; nunca contra um projeto remoto. */
function assertLocalSupabase(): void {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não é uma URL válida.");
  }
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      "Os helpers do E2E usam a secret key e só rodam contra o Supabase local (127.0.0.1 ou localhost). Abortado.",
    );
  }
}

let cached: SupabaseClient | undefined;

/** Cliente com a secret key. Só no Supabase local, para preparar dados de teste. */
export function adminClient(): SupabaseClient {
  assertLocalSupabase();
  cached ??= createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SECRET_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return cached;
}

export function uniqueEmail(label: string): string {
  return `e2e-${label}-${randomUUID().slice(0, 8)}@example.test`;
}

/** Cria usuário já confirmado pela Admin API (não consome o limite de logins). */
export async function createConfirmedUser(
  label: string,
  displayName = `Teste ${label}`,
): Promise<TestUser> {
  const email = uniqueEmail(label);
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) {
    throw new Error(
      `Falha ao criar usuário de teste: ${error?.message ?? "sem dados"}`,
    );
  }
  return { id: data.user.id, email, password: TEST_PASSWORD, displayName };
}

/** Cria a família e o vínculo `owner` direto no banco local (sem passar pela UI). */
export async function createFamilyFor(
  user: TestUser,
  familyName: string,
): Promise<string> {
  const admin = adminClient();
  const family = await admin
    .from("families")
    .insert({ name: familyName, created_by: user.id })
    .select("id")
    .single();
  if (family.error || !family.data) {
    throw new Error(
      `Falha ao criar família de teste: ${family.error?.message}`,
    );
  }
  const familyId = family.data.id as string;
  await addMember(familyId, user, "owner");
  return familyId;
}

export async function addMember(
  familyId: string,
  user: TestUser,
  role: "owner" | "admin" | "member",
): Promise<void> {
  const { error } = await adminClient()
    .from("family_members")
    .insert({ family_id: familyId, user_id: user.id, role });
  if (error) throw new Error(`Falha ao vincular integrante: ${error.message}`);
}

/** Usuário confirmado, dono de uma família nova. */
export async function createUserWithFamily(
  label: string,
  displayName?: string,
): Promise<TestUser & { familyId: string; familyName: string }> {
  const user = await createConfirmedUser(label, displayName);
  const familyName = `Família ${label}`;
  const familyId = await createFamilyFor(user, familyName);
  return { ...user, familyId, familyName };
}
