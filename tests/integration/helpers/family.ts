import {
  createSignedInUser,
  actAs,
  redirectOf,
  tokenFromInviteUrl,
  type TestUser,
} from "./session";

// Os arquivos de teste mockam `@/lib/supabase/server` e `next/cache` antes de importar isto.
import {
  acceptInvite,
  createFamily,
  createInvite,
} from "@/modules/family/actions";

export type TestFamily = {
  owner: TestUser;
  admin: TestUser;
  member: TestUser;
};

/** Família real (pelas actions) com owner, admin e member. */
export async function createTestFamily(label: string): Promise<TestFamily> {
  const [owner, admin, member] = await Promise.all([
    createSignedInUser(`${label}-owner`),
    createSignedInUser(`${label}-admin`),
    createSignedInUser(`${label}-member`),
  ]);
  actAs(owner);
  await redirectOf(createFamily({ name: `Família ${label}` }));
  for (const [role, user] of [
    ["admin", admin],
    ["member", member],
  ] as const) {
    actAs(owner);
    const invite = await createInvite({ role });
    if (!invite.ok)
      throw new Error(`createInvite falhou: ${invite.error.code}`);
    actAs(user);
    await redirectOf(
      acceptInvite({ token: tokenFromInviteUrl(invite.data.inviteUrl) }),
    );
  }
  return { owner, admin, member };
}

/** Usuário autenticado sem família (onboarding). */
export async function createLoneUser(label: string): Promise<TestUser> {
  return createSignedInUser(label);
}
