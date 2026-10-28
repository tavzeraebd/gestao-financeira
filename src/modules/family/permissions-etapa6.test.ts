import { describe, expect, it } from "vitest";
import {
  can,
  canContributeFor,
  canDeleteContribution,
  canDeleteSettlement,
  canRegisterSettlement,
  canSetSplits,
} from "@/modules/family/permissions";

describe("permissões da Etapa 6 (só UX)", () => {
  it("goal.manage: owner e admin sim, member não", () => {
    expect(can("owner", "goal.manage")).toBe(true);
    expect(can("admin", "goal.manage")).toBe(true);
    expect(can("member", "goal.manage")).toBe(false);
  });

  it("canContributeFor: owner/admin qualquer; member só o próprio", () => {
    expect(canContributeFor("owner", "m1", "m2")).toBe(true);
    expect(canContributeFor("admin", "m1", "m2")).toBe(true);
    expect(canContributeFor("member", "m1", "m1")).toBe(true);
    expect(canContributeFor("member", "m1", "m2")).toBe(false);
  });

  it("canDeleteContribution e canSetSplits: owner/admin ou quem criou", () => {
    for (const fn of [canDeleteContribution, canSetSplits]) {
      expect(fn("admin", "u2", "u1")).toBe(true);
      expect(fn("member", "u1", "u1")).toBe(true);
      expect(fn("member", "u2", "u1")).toBe(false);
    }
  });

  it("settlement.register: owner e admin sim, member não", () => {
    expect(can("owner", "settlement.register")).toBe(true);
    expect(can("admin", "settlement.register")).toBe(true);
    expect(can("member", "settlement.register")).toBe(false);
  });

  it("canRegisterSettlement: owner/admin ou uma das partes", () => {
    expect(canRegisterSettlement("owner", "m1", "m2", "m3")).toBe(true);
    expect(canRegisterSettlement("member", "m1", "m1", "m3")).toBe(true);
    expect(canRegisterSettlement("member", "m1", "m2", "m1")).toBe(true);
    expect(canRegisterSettlement("member", "m1", "m2", "m3")).toBe(false);
  });

  it("canDeleteSettlement: owner/admin, autor ou uma das partes (SEC-25)", () => {
    // args: role, createdBy, userId, myMemberId, fromId, toId
    expect(canDeleteSettlement("owner", "u2", "u1", "m1", "m2", "m3")).toBe(true);
    expect(canDeleteSettlement("admin", "u2", "u1", "m1", "m2", "m3")).toBe(true);
    expect(canDeleteSettlement("member", "u1", "u1", "m1", "m2", "m3")).toBe(true);
    expect(canDeleteSettlement("member", "u2", "u1", "m1", "m1", "m3")).toBe(true);
    expect(canDeleteSettlement("member", "u2", "u1", "m1", "m2", "m1")).toBe(true);
    expect(canDeleteSettlement("member", "u2", "u1", "m1", "m2", "m3")).toBe(false);
  });
});
