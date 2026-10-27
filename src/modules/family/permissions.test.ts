import { describe, expect, it } from "vitest";
import { can, canManageTransaction } from "@/modules/family/permissions";

describe("permissões financeiras (só UX)", () => {
  it.each([
    "account.manage",
    "category.manage",
    "transaction.manage_any",
  ] as const)("%s: owner e admin sim, member não", (action) => {
    expect(can("owner", action)).toBe(true);
    expect(can("admin", action)).toBe(true);
    expect(can("member", action)).toBe(false);
  });

  it("canManageTransaction: member só gerencia o próprio lançamento", () => {
    expect(canManageTransaction("member", "u1", "u1")).toBe(true);
    expect(canManageTransaction("member", "u2", "u1")).toBe(false);
    expect(canManageTransaction("admin", "u2", "u1")).toBe(true);
    expect(canManageTransaction("owner", "u2", "u1")).toBe(true);
  });
});
