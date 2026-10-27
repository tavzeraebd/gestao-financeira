import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  actAs,
  adminClient,
  createSignedInUser,
  type TestUser,
} from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateProfile } from "@/modules/profile/actions";
import { getMyProfile } from "@/modules/profile/queries";
import { updateOwnProfile } from "@/modules/profile/repository";

const admin = adminClient();

async function nameOf(userId: string): Promise<string | undefined> {
  const { data } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  return data?.display_name;
}

describe("perfil", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    [alice, bob] = await Promise.all([
      createSignedInUser("alice"),
      createSignedInUser("bob"),
    ]);
  });

  it("updateProfile altera o próprio nome (com trim)", async () => {
    actAs(alice);
    expect(await updateProfile({ displayName: "  Alice Nova  " })).toEqual({
      ok: true,
      data: null,
    });
    expect(await nameOf(alice.id)).toBe("Alice Nova");
  });

  it("getMyProfile devolve id, nome, avatar e e-mail do usuário", async () => {
    actAs(alice);
    expect(await getMyProfile()).toEqual({
      id: alice.id,
      displayName: "Alice Nova",
      avatarUrl: null,
      email: alice.email,
    });
  });

  it("updateProfile não altera o perfil de outro usuário", async () => {
    const before = await nameOf(bob.id);
    actAs(alice);
    await updateProfile({ displayName: "Só a Alice" });
    expect(await nameOf(bob.id)).toBe(before);

    // Mesmo forçando o id alheio no repositório, a RLS impede a escrita.
    expect(await updateOwnProfile(alice.client, bob.id, "Invadido")).toBe(
      false,
    );
    expect(await nameOf(bob.id)).toBe(before);
  });

  it("validação e sessão", async () => {
    actAs(alice);
    expect(await updateProfile({ displayName: "   " })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    actAs(null);
    expect(await updateProfile({ displayName: "X" })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });
});
