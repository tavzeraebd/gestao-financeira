import { describe, expect, it } from "vitest";
import { memberDisplayName } from "./member-name";

describe("memberDisplayName", () => {
  it("nome legível é mantido (aparado)", () => {
    expect(memberDisplayName("Ana")).toBe("Ana");
    expect(memberDisplayName("  Ana  ")).toBe("Ana");
  });

  it("perfil não legível → Ex-integrante", () => {
    expect(memberDisplayName(null)).toBe("Ex-integrante");
    expect(memberDisplayName("")).toBe("Ex-integrante");
    expect(memberDisplayName("   ")).toBe("Ex-integrante");
  });
});
