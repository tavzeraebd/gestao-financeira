import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toAppError } from "@/server/errors";
import type { Database } from "@/types/database";
import {
  rpcChangeMemberRole,
  rpcRemoveFamilyMember,
  rpcTransferOwnership,
} from "./repository";

const MEMBER = "5f3c1b7a-2a4e-4b1c-8c55-9a1e2d3f4b66";

function client(result: { data?: unknown; error?: unknown }) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null, ...result });
  return { rpc, supabase: { rpc } as unknown as SupabaseClient<Database> };
}

const pg = (code: string, message: string) => ({
  code,
  message,
  details: null,
  hint: null,
});

const calls = {
  change_member_role: (s: SupabaseClient<Database>) =>
    rpcChangeMemberRole(s, MEMBER, "admin"),
  transfer_ownership: (s: SupabaseClient<Database>) =>
    rpcTransferOwnership(s, MEMBER),
  remove_family_member: (s: SupabaseClient<Database>) =>
    rpcRemoveFamilyMember(s, MEMBER),
} as const;

describe.each(Object.entries(calls))("%s", (rpcName, call) => {
  it("sucesso (null) resolve", async () => {
    const { supabase, rpc } = client({ data: null });
    await expect(call(supabase)).resolves.toBeUndefined();
    expect(rpc.mock.calls[0]?.[0]).toBe(rpcName);
  });

  it("sucesso (undefined, RPC antiga void) resolve", async () => {
    const { supabase } = client({ data: undefined });
    await expect(call(supabase)).resolves.toBeUndefined();
  });

  it("formato antigo: error lançado pela RPC é relançado e mapeia para o mesmo código", async () => {
    const error = pg("P0001", "CANNOT_TARGET_SELF");
    const { supabase } = client({ error });
    const thrown = await call(supabase).catch((e: unknown) => e);
    expect(thrown).toBe(error);
    expect(toAppError(thrown).code).toBe("CANNOT_TARGET_SELF");
  });

  it.each([
    ["FORBIDDEN"],
    ["CANNOT_TARGET_SELF"],
    ["OWNER_MUST_TRANSFER"],
    ["NOT_FOUND"],
    ["MEMBER_INACTIVE"],
  ])("formato novo: %s vira AppError com o mesmo código", async (code) => {
    const { supabase } = client({ data: code });
    await expect(call(supabase)).rejects.toMatchObject({
      name: "AppError",
      code,
    });
  });

  it.each([
    ["INVALID_INPUT", "VALIDATION_ERROR"],
    ["NOT_AUTHENTICATED", "UNAUTHENTICATED"],
  ])(
    "formato novo: %s mapeia como no caminho de exceção",
    async (code, expected) => {
      const { supabase } = client({ data: code });
      await expect(call(supabase)).rejects.toMatchObject({ code: expected });
    },
  );

  it.each([["ALGO_NOVO"], ["constructor"], ["   "], [42], [{ a: 1 }], [true]])(
    "valor inesperado %j -> INTERNAL_ERROR, nunca sucesso",
    async (data) => {
      const { supabase } = client({ data });
      await expect(call(supabase)).rejects.toMatchObject({
        name: "AppError",
        code: "INTERNAL_ERROR",
      });
    },
  );
});

describe("formato antigo preserva o erro cru", () => {
  it("error do Supabase é relançado como estava", async () => {
    const error = pg("42501", "FORBIDDEN");
    const { supabase } = client({ error });
    await expect(rpcRemoveFamilyMember(supabase, MEMBER)).rejects.toBe(error);
  });
});
