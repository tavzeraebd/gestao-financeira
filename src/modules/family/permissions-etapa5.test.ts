import { describe, expect, it } from "vitest";
import { can, canPayBill } from "@/modules/family/permissions";

describe("permissões da Etapa 5 (só UX)", () => {
  it("budget.manage: owner e admin sim, member não", () => {
    expect(can("owner", "budget.manage")).toBe(true);
    expect(can("admin", "budget.manage")).toBe(true);
    expect(can("member", "budget.manage")).toBe(false);
  });

  it("canPayBill: owner/admin sempre; member só como autor ou responsável", () => {
    expect(canPayBill("owner", "u2", null, "u1")).toBe(true);
    expect(canPayBill("admin", "u2", "u3", "u1")).toBe(true);
    expect(canPayBill("member", "u1", null, "u1")).toBe(true);
    expect(canPayBill("member", "u2", "u1", "u1")).toBe(true);
    expect(canPayBill("member", "u2", "u3", "u1")).toBe(false);
    expect(canPayBill("member", "u2", null, "u1")).toBe(false);
  });
});
