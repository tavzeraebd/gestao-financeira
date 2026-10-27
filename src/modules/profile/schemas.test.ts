import { describe, expect, it } from "vitest";
import { updateProfileSchema } from "@/modules/profile/schemas";

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
