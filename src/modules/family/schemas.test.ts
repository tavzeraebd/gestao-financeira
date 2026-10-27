import { describe, expect, it } from "vitest";
import { can } from "@/modules/family/permissions";
import {
  acceptInviteSchema,
  createFamilySchema,
  createInviteSchema,
  revokeInviteSchema,
} from "@/modules/family/schemas";

describe("createFamilySchema", () => {
  it("trim e limites 1..80", () => {
    expect(createFamilySchema.parse({ name: "  Silva " }).name).toBe("Silva");
    expect(createFamilySchema.safeParse({ name: "  " }).success).toBe(false);
    expect(createFamilySchema.safeParse({ name: "a".repeat(81) }).success).toBe(
      false,
    );
  });
});

describe("createInviteSchema", () => {
  it("papel padrão member e e-mail ausente", () => {
    expect(createInviteSchema.parse({})).toEqual({
      role: "member",
      email: undefined,
    });
  });

  it("e-mail vazio vira undefined; válido é normalizado", () => {
    expect(createInviteSchema.parse({ email: "  " }).email).toBeUndefined();
    expect(createInviteSchema.parse({ email: " Ana@X.com " }).email).toBe(
      "ana@x.com",
    );
  });

  it("rejeita papel owner, e-mail inválido e longo", () => {
    expect(createInviteSchema.safeParse({ role: "owner" }).success).toBe(false);
    expect(createInviteSchema.safeParse({ email: "x" }).success).toBe(false);
    expect(
      createInviteSchema.safeParse({ email: `${"a".repeat(250)}@x.com` })
        .success,
    ).toBe(false);
  });

  it("ignora family_id forjado", () => {
    const r = createInviteSchema.parse({ role: "admin", family_id: "x" });
    expect(r).not.toHaveProperty("family_id");
  });
});

describe("revokeInviteSchema / acceptInviteSchema", () => {
  it("exige uuid", () => {
    expect(revokeInviteSchema.safeParse({ inviteId: "123" }).success).toBe(
      false,
    );
    expect(
      revokeInviteSchema.safeParse({
        inviteId: "6f1c2b3a-1111-4222-8333-944455556666",
      }).success,
    ).toBe(true);
  });

  it("token = 64 hex minúsculos", () => {
    expect(
      acceptInviteSchema.safeParse({ token: "a".repeat(64) }).success,
    ).toBe(true);
    expect(
      acceptInviteSchema.safeParse({ token: "A".repeat(64) }).success,
    ).toBe(false);
    expect(
      acceptInviteSchema.safeParse({ token: "a".repeat(63) }).success,
    ).toBe(false);
    expect(
      acceptInviteSchema.safeParse({ token: "g".repeat(64) }).success,
    ).toBe(false);
  });
});

describe("can (só UX)", () => {
  it("espelha permissions.md", () => {
    expect(can("member", "invite.list")).toBe(false);
    expect(can("admin", "invite.create_member")).toBe(true);
    expect(can("admin", "invite.create_admin")).toBe(false);
    expect(can("owner", "invite.create_admin")).toBe(true);
    expect(can("admin", "invite.revoke_member_invite")).toBe(true);
    expect(can("admin", "invite.revoke_any")).toBe(false);
    expect(can("owner", "audit.read")).toBe(true);
    expect(can("member", "audit.read")).toBe(false);
  });
});
