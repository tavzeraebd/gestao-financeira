import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} ausente. Rode "pnpm db:start" e crie .env.local a partir de "pnpm db:status".`,
    );
  }
  return value;
}

const url = () => env("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = () => env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };

/** Cliente com a secret key: só para preparar/conferir dados nos testes. Nunca em src/. */
export function adminClient(): Client {
  const host = new URL(url()).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(
      "Testes de integração usam a secret key e só rodam contra o Supabase local (127.0.0.1/localhost).",
    );
  }
  return createClient<Database>(url(), env("SUPABASE_SECRET_KEY"), noPersist);
}

/** Cliente anônimo (sem sessão), como o servidor vê um visitante. */
export function anonClient(): Client {
  return createClient<Database>(url(), publishableKey(), noPersist);
}

export const TEST_PASSWORD = "Senha-de-teste-1";

export type TestUser = {
  id: string;
  email: string;
  password: string;
  displayName: string;
  client: Client;
};

/** Cria usuário já confirmado (Admin API) e abre sessão com a publishable key. */
export async function createSignedInUser(label: string): Promise<TestUser> {
  const email = `it-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const displayName = `Teste ${label}`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) throw new Error("Falha ao criar usuário de teste.");

  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signIn.error) throw new Error("Falha ao autenticar usuário de teste.");

  return {
    id: data.user.id,
    email,
    password: TEST_PASSWORD,
    displayName,
    client,
  };
}

/** Usuário confirmado, sem abrir sessão (para testar signIn). */
export async function createConfirmedUser(
  label: string,
): Promise<Omit<TestUser, "client">> {
  const email = `it-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error("Falha ao criar usuário de teste.");
  return {
    id: data.user.id,
    email,
    password: TEST_PASSWORD,
    displayName: label,
  };
}

// Cliente "ativo" devolvido pelo createClient mockado de @/lib/supabase/server.
let active: Client = anonClient();

export function actAs(user: Pick<TestUser, "client"> | null): void {
  active = user ? user.client : anonClient();
}

export function getActiveClient(): Client {
  return active;
}

/** Extrai o destino de um redirect() do Next lançado por uma action. */
export async function redirectOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    const digest = (e as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      const target = digest.split(";")[2];
      if (target) return target;
    }
    throw e;
  }
  throw new Error("A action não redirecionou.");
}

/** Extrai o token (64 hex) de um inviteUrl sem expô-lo em mensagens. */
export function tokenFromInviteUrl(inviteUrl: string): string {
  const token = inviteUrl.split("/convite/")[1];
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    throw new Error("inviteUrl em formato inesperado.");
  }
  return token;
}
