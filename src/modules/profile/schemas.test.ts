import { describe, expect, it } from "vitest";
import {
  deleteAccountSchema,
  updateProfileSchema,
} from "@/modules/profile/schemas";

describe("updateProfileSchema", () => {
  it("trim e limites 1..80", () => {
    expect(
      updateProfileSchema.parse({ displayName: " Ana " }).displayName,
    ).toBe("Ana");
    expect(updateProfileSchema.safeParse({ displayName: "" }).success).toBe(
      false,
    );
    expect(
      updateProfileSchema.safeParse({ displayName: "a".repeat(81) }).success,
    ).toBe(false);
  });
});

describe("deleteAccountSchema", () => {
  it("exige senha (1..72, sem trim) e a confirmação exata EXCLUIR", () => {
    expect(
      deleteAccountSchema.parse({ password: " s ", confirmation: "EXCLUIR" })
        .password,
    ).toBe(" s ");
    for (const bad of [
      { password: "", confirmation: "EXCLUIR" },
      { password: "a".repeat(73), confirmation: "EXCLUIR" },
      { password: "x", confirmation: "excluir" },
      { password: "x", confirmation: " EXCLUIR" },
      { password: "x" },
    ]) {
      expect(deleteAccountSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("descarta campos extras (family_id do cliente não passa)", () => {
    expect(
      deleteAccountSchema.parse({
        password: "x",
        confirmation: "EXCLUIR",
        family_id: "abc",
      }),
    ).toEqual({ password: "x", confirmation: "EXCLUIR" });
  });
});
