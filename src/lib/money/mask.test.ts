import { describe, expect, it } from "vitest";

import { maskBRLInput } from "@/lib/money";

describe("maskBRLInput", () => {
  it("lê os dígitos como centavos", () => {
    expect(maskBRLInput("3")).toBe("0,03");
    expect(maskBRLInput("34")).toBe("0,34");
    expect(maskBRLInput("348")).toBe("3,48");
    expect(maskBRLInput("3480")).toBe("34,80");
    expect(maskBRLInput("348000")).toBe("3.480,00");
  });

  it("zeros à esquerda caem", () => {
    expect(maskBRLInput("0")).toBe("0,00");
    expect(maskBRLInput("0,005")).toBe("0,05");
    expect(maskBRLInput("000123")).toBe("1,23");
  });

  it("apagar remove o último dígito; vazio continua vazio", () => {
    expect(maskBRLInput("34,8")).toBe("3,48");
    expect(maskBRLInput("0,0", { deleting: true })).toBe("");
    expect(maskBRLInput("0,0")).toBe("0,00");
    expect(maskBRLInput("")).toBe("");
    expect(maskBRLInput("abc")).toBe("");
  });

  it("valor já formatado com 2 casas resulta no mesmo valor; sem vírgula segue a regra dos centavos", () => {
    expect(maskBRLInput("1.234,56")).toBe("1.234,56");
    expect(maskBRLInput("1234,56")).toBe("1.234,56");
    expect(maskBRLInput("1234")).toBe("12,34");
  });

  it("valor inicial canônico permanece igual", () => {
    expect(maskBRLInput("3.480,00")).toBe("3.480,00");
  });

  it("ignora dígitos além do teto 99.999.999,99", () => {
    expect(maskBRLInput("9999999999")).toBe("99.999.999,99");
    expect(maskBRLInput("99999999991")).toBe("99.999.999,99");
    expect(maskBRLInput("12345678901")).toBe("12.345.678,90");
  });

  describe("allowNegative", () => {
    const opts = { allowNegative: true };

    it("'-' em qualquer posição deixa negativo; o segundo '-' volta a positivo", () => {
      expect(maskBRLInput("-5000", opts)).toBe("-50,00");
      expect(maskBRLInput("50-00", opts)).toBe("-50,00");
      expect(maskBRLInput("5000-", opts)).toBe("-50,00");
      expect(maskBRLInput("--50,00", opts)).toBe("50,00");
      expect(maskBRLInput("-50-,00", opts)).toBe("50,00");
    });

    it("apagar dígito mantém o sinal; só '-' é mantido", () => {
      expect(maskBRLInput("-34,8", opts)).toBe("-3,48");
      expect(maskBRLInput("-0,0", { ...opts, deleting: true })).toBe("-");
      expect(maskBRLInput("-", opts)).toBe("-");
      expect(maskBRLInput("--", opts)).toBe("");
    });

    it("sem allowNegative o '-' é ignorado", () => {
      expect(maskBRLInput("-5000")).toBe("50,00");
      expect(maskBRLInput("-")).toBe("");
    });
  });
});
