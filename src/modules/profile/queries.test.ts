import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const FAMILY_ID = "22222222-2222-4222-8222-222222222222";

const getUserIdentities = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUserIdentities } }),
}));
vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: USER_ID, email: "ana@example.test" }),
}));
const findActiveMembership = vi.fn();
vi.mock("@/modules/family/repository", () => ({
  findActiveMembership: (...args: unknown[]) => findActiveMembership(...args),
}));
const countOtherActiveMembers = vi.fn();
vi.mock("@/modules/profile/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/profile/repository")>()),
  countOtherActiveMembers: (...args: unknown[]) =>
    countOtherActiveMembers(...args),
}));

import { getAccountDeletionPreview } from "@/modules/profile/queries";

const membership = (role: "owner" | "admin" | "member") => ({
  userId: USER_ID,
  memberId: "m1",
  familyId: FAMILY_ID,
  familyName: "Família",
  role,
});

beforeEach(() => {
  getUserIdentities.mockReset().mockResolvedValue({
    data: { identities: [{ provider: "email" }] },
    error: null,
  });
  findActiveMembership.mockReset();
  countOtherActiveMembers.mockReset().mockResolvedValue(0);
});

describe("getAccountDeletionPreview (CA-E9-42)", () => {
  it.each(["member", "admin"] as const)(
    "%s: não apaga a família e pode excluir",
    async (role) => {
      findActiveMembership.mockResolvedValue(membership(role));
      countOtherActiveMembers.mockResolvedValue(2);
      expect(await getAccountDeletionPreview()).toEqual({
        role,
        otherActiveMembers: 2,
        willEraseFamily: false,
        canDelete: true,
        hasPassword: true,
      });
    },
  );

  it("owner com outros integrantes: bloqueado (OWNER_MUST_TRANSFER)", async () => {
    findActiveMembership.mockResolvedValue(membership("owner"));
    countOtherActiveMembers.mockResolvedValue(1);
    expect(await getAccountDeletionPreview()).toMatchObject({
      role: "owner",
      otherActiveMembers: 1,
      willEraseFamily: false,
      canDelete: false,
    });
  });

  it("owner sozinho: a família será apagada", async () => {
    findActiveMembership.mockResolvedValue(membership("owner"));
    expect(await getAccountDeletionPreview()).toMatchObject({
      role: "owner",
      otherActiveMembers: 0,
      willEraseFamily: true,
      canDelete: true,
    });
    expect(countOtherActiveMembers).toHaveBeenCalledWith(
      expect.anything(),
      FAMILY_ID,
      USER_ID,
    );
  });

  it("sem identidade de senha: hasPassword e canDelete falsos", async () => {
    getUserIdentities.mockResolvedValue({
      data: { identities: [{ provider: "google" }] },
      error: null,
    });
    findActiveMembership.mockResolvedValue(membership("member"));
    expect(await getAccountDeletionPreview()).toMatchObject({
      hasPassword: false,
      canDelete: false,
    });
  });

  it("sem família: role nulo e pode excluir; não consulta integrantes", async () => {
    findActiveMembership.mockResolvedValue(null);
    expect(await getAccountDeletionPreview()).toEqual({
      role: null,
      otherActiveMembers: 0,
      willEraseFamily: false,
      canDelete: true,
      hasPassword: true,
    });
    expect(countOtherActiveMembers).not.toHaveBeenCalled();
  });

  it("só devolve papel e contagens (nenhum dado de outro usuário)", async () => {
    findActiveMembership.mockResolvedValue(membership("owner"));
    countOtherActiveMembers.mockResolvedValue(3);
    expect(Object.keys(await getAccountDeletionPreview()).sort()).toEqual([
      "canDelete",
      "hasPassword",
      "otherActiveMembers",
      "role",
      "willEraseFamily",
    ]);
  });

  it("erro do Auth ao ler identidades sobe (não vira hasPassword=false em silêncio)", async () => {
    getUserIdentities.mockResolvedValue({
      data: { identities: [] },
      error: new Error("rede"),
    });
    findActiveMembership.mockResolvedValue(null);
    await expect(getAccountDeletionPreview()).rejects.toThrow("rede");
  });
});
