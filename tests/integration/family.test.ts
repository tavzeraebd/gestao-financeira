import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  actAs,
  adminClient,
  createSignedInUser,
  redirectOf,
  tokenFromInviteUrl,
  type TestUser,
} from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  acceptInvite,
  createFamily,
  createInvite,
  revokeInvite,
} from "@/modules/family/actions";
import {
  getFamilyOverview,
  getInvitePreview,
  listPendingInvites,
} from "@/modules/family/queries";

const admin = adminClient();

async function inviteTokenFor(
  issuer: TestUser,
  role: "admin" | "member",
  email?: string,
): Promise<{ token: string; url: string }> {
  actAs(issuer);
  const result = await createInvite({ role, email });
  if (!result.ok) throw new Error(`createInvite falhou: ${result.error.code}`);
  return {
    token: tokenFromInviteUrl(result.data.inviteUrl),
    url: result.data.inviteUrl,
  };
}

describe("família: criação, convites e isolamento", () => {
  let owner: TestUser;
  let member: TestUser;
  let adminUser: TestUser;
  let outsider: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    [owner, member, adminUser, outsider, other] = await Promise.all([
      createSignedInUser("owner"),
      createSignedInUser("member"),
      createSignedInUser("admin"),
      createSignedInUser("outsider"),
      createSignedInUser("other"),
    ]);
  });

  it("createFamily cria a família com o usuário como owner e redireciona", async () => {
    actAs(owner);
    expect(await redirectOf(createFamily({ name: "  Família Silva  " }))).toBe(
      "/inicio",
    );

    const { data: rows } = await admin
      .from("family_members")
      .select("role, status, families(name)")
      .eq("user_id", owner.id);
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      role: "owner",
      status: "active",
      families: { name: "Família Silva" },
    });
  });

  it("segunda chamada de createFamily -> ALREADY_IN_FAMILY", async () => {
    actAs(owner);
    const result = await createFamily({ name: "Outra" });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "ALREADY_IN_FAMILY" },
    });
  });

  it("createFamily sem sessão -> UNAUTHENTICATED; nome vazio -> VALIDATION_ERROR", async () => {
    actAs(null);
    expect(await createFamily({ name: "X" })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    actAs(outsider);
    expect(await createFamily({ name: "  " })).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: { name: expect.any(Array) },
      },
    });
  });

  it("owner cria convite com link /convite/<token> e validade", async () => {
    actAs(owner);
    const result = await createInvite({ role: "member" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.inviteUrl).toMatch(
      /^http:\/\/localhost:3000\/convite\/[0-9a-f]{64}$/,
    );
    expect(new Date(result.data.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it("acceptInvite válido junta o usuário; repetido -> INVITE_ALREADY_USED", async () => {
    const { token } = await inviteTokenFor(owner, "member");

    actAs(member);
    expect(await redirectOf(acceptInvite({ token }))).toBe("/inicio");
    const { data: joined } = await admin
      .from("family_members")
      .select("role, status")
      .eq("user_id", member.id);
    expect(joined).toEqual([{ role: "member", status: "active" }]);

    actAs(outsider);
    expect(await acceptInvite({ token })).toMatchObject({
      ok: false,
      error: { code: "INVITE_ALREADY_USED" },
    });
  });

  it("createInvite por member -> FORBIDDEN", async () => {
    actAs(member);
    expect(await createInvite({ role: "member" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("admin convidando admin -> FORBIDDEN; admin convidando member -> ok", async () => {
    const { token } = await inviteTokenFor(owner, "admin");
    actAs(adminUser);
    expect(await redirectOf(acceptInvite({ token }))).toBe("/inicio");

    expect(await createInvite({ role: "admin" })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect((await createInvite({ role: "member" })).ok).toBe(true);
  });

  it("convite vinculado a e-mail recusa outro usuário -> INVITE_EMAIL_MISMATCH", async () => {
    const { token } = await inviteTokenFor(
      owner,
      "member",
      "outro@example.test",
    );
    actAs(outsider);
    expect(await acceptInvite({ token })).toMatchObject({
      ok: false,
      error: { code: "INVITE_EMAIL_MISMATCH" },
    });
  });

  it("token inexistente -> INVITE_NOT_FOUND; formato inválido -> VALIDATION_ERROR", async () => {
    actAs(outsider);
    expect(await acceptInvite({ token: "0".repeat(64) })).toMatchObject({
      ok: false,
      error: { code: "INVITE_NOT_FOUND" },
    });
    expect(await acceptInvite({ token: "xyz" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("getFamilyOverview mostra integrantes da própria família e isMe", async () => {
    actAs(member);
    const overview = await getFamilyOverview();
    expect(overview.family.name).toBe("Família Silva");
    expect(overview.myRole).toBe("member");
    const ids = overview.members.map((m) => m.userId).sort();
    expect(ids).toEqual([owner.id, member.id, adminUser.id].sort());
    expect(overview.members.filter((m) => m.isMe).map((m) => m.userId)).toEqual(
      [member.id],
    );
    expect(overview.members.find((m) => m.userId === owner.id)).toMatchObject({
      role: "owner",
      displayName: owner.displayName,
    });
  });

  it("getFamilyOverview de outro usuário não mostra a família alheia", async () => {
    actAs(other);
    expect(await redirectOf(createFamily({ name: "Família Alheia" }))).toBe(
      "/inicio",
    );
    const overview = await getFamilyOverview();
    expect(overview.family.name).toBe("Família Alheia");
    expect(overview.myRole).toBe("owner");
    expect(overview.members.map((m) => m.userId)).toEqual([other.id]);
    expect(JSON.stringify(overview)).not.toContain(owner.id);
  });

  it("getFamilyOverview sem família redireciona ao onboarding; sem sessão, ao login", async () => {
    actAs(outsider);
    await expect(redirectOf(getFamilyOverview())).resolves.toBe("/onboarding");
    actAs(null);
    await expect(redirectOf(getFamilyOverview())).resolves.toBe("/login");
  });

  it("listPendingInvites: [] para member; owner vê convites sem token_hash", async () => {
    actAs(member);
    expect(await listPendingInvites()).toEqual([]);

    actAs(owner);
    const invites = await listPendingInvites();
    expect(invites.length).toBeGreaterThan(0);
    for (const invite of invites) {
      expect(Object.keys(invite).sort()).toEqual(
        ["createdAt", "expiresAt", "id", "invitedEmail", "role"].sort(),
      );
    }
  });

  it("outra família não enxerga convites desta", async () => {
    actAs(other);
    expect(await listPendingInvites()).toEqual([]);
  });

  it("getInvitePreview: pendente, inexistente e sem sessão", async () => {
    const { token } = await inviteTokenFor(owner, "member");

    actAs(outsider);
    const preview = await getInvitePreview(token);
    expect(preview).toMatchObject({
      ok: true,
      data: {
        familyName: "Família Silva",
        role: "member",
        status: "pending",
        emailBound: false,
      },
    });
    expect(await getInvitePreview("1".repeat(64))).toEqual({
      ok: false,
      code: "INVITE_NOT_FOUND",
    });
    expect(await getInvitePreview("curto")).toEqual({
      ok: false,
      code: "INVITE_NOT_FOUND",
    });

    actAs(null);
    expect(await getInvitePreview(token)).toEqual({
      ok: false,
      code: "UNAUTHENTICATED",
    });
  });

  it("revokeInvite: owner revoga; repetir é idempotente; convite aceito -> INVITE_ALREADY_USED", async () => {
    actAs(owner);
    const created = await createInvite({ role: "member" });
    expect(created.ok).toBe(true);
    const invites = await listPendingInvites();
    const target = invites[0];
    expect(target).toBeDefined();
    if (!target) return;

    expect(await revokeInvite({ inviteId: target.id })).toEqual({
      ok: true,
      data: null,
    });
    expect(await revokeInvite({ inviteId: target.id })).toEqual({
      ok: true,
      data: null,
    });
    expect((await listPendingInvites()).map((i) => i.id)).not.toContain(
      target.id,
    );

    const { data: membership } = await admin
      .from("family_members")
      .select("family_id")
      .eq("user_id", owner.id)
      .single();
    const { data: accepted } = await admin
      .from("family_invites")
      .select("id")
      .eq("family_id", membership?.family_id ?? "")
      .not("accepted_at", "is", null)
      .limit(1);
    const acceptedId = accepted?.[0]?.id;
    expect(acceptedId).toBeDefined();
    if (!acceptedId) return;
    expect(await revokeInvite({ inviteId: acceptedId })).toMatchObject({
      ok: false,
      error: { code: "INVITE_ALREADY_USED" },
    });
  });

  it("revokeInvite por member -> FORBIDDEN; id de outra família -> INVITE_NOT_FOUND", async () => {
    actAs(owner);
    await createInvite({ role: "member" });
    const [invite] = await listPendingInvites();
    expect(invite).toBeDefined();
    if (!invite) return;

    actAs(member);
    expect(await revokeInvite({ inviteId: invite.id })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });

    actAs(other);
    expect(await revokeInvite({ inviteId: invite.id })).toMatchObject({
      ok: false,
      error: { code: "INVITE_NOT_FOUND" },
    });
  });

  it("family_invites não é legível com select * (token_hash fora do grant)", async () => {
    const { error } = await owner.client.from("family_invites").select("*");
    expect(error?.code).toBe("42501");
  });
});
