import { describe, expect, it } from "vitest";
import { createSignedInUser } from "./helpers/session";

// CA-E2-22: funções internas não são expostas via PostgREST (404), nem com sessão.
const FUNCTIONS = [
  "is_family_member",
  "has_family_role",
  "current_family_id",
  "log_audit",
];

async function callRpc(name: string, bearer: string): Promise<number> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  return res.status;
}

describe("RPCs internas não expostas", () => {
  it.each(FUNCTIONS)(
    "%s -> 404 com a publishable key e com sessão",
    async (name) => {
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
      expect(await callRpc(name, key)).toBe(404);

      const user = await createSignedInUser("rpc");
      const { data } = await user.client.auth.getSession();
      const token = data.session?.access_token;
      expect(token).toBeTruthy();
      expect(await callRpc(name, token as string)).toBe(404);
    },
  );
});
