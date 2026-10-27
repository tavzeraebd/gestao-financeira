import { describe, expect, it } from "vitest";
import { addDays, today } from "@/lib/dates";
import { isoDate } from "@/lib/validation/dates";
import { brlAmount } from "@/lib/validation/money";
import { optionalText, optionalUuid } from "@/lib/validation/optional-fields";

const messageOf = (r: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) => r.error?.issues[0]?.message;

describe("brlAmount", () => {
  it("produz Cents a partir de texto pt-BR", () => {
    expect(brlAmount().parse("1.234,56")).toBe(123456);
    expect(brlAmount().parse("0")).toBe(0);
  });

  it("positive rejeita zero, vazio e negativo com mensagens claras", () => {
    const schema = brlAmount({ positive: true });
    expect(messageOf(schema.safeParse("0"))).toBe(
      "Informe um valor maior que zero.",
    );
    expect(messageOf(schema.safeParse("0,00"))).toBe(
      "Informe um valor maior que zero.",
    );
    expect(messageOf(schema.safeParse("-5"))).toBe(
      "Informe um valor maior que zero.",
    );
    expect(messageOf(schema.safeParse(""))).toBe("Informe o valor.");
    expect(messageOf(schema.safeParse("1,234.56"))).toBe(
      "Use vírgula para os centavos, como 1.234,56.",
    );
    expect(messageOf(schema.safeParse("10,999"))).toBe(
      "Use no máximo 2 casas decimais, como 12,50.",
    );
    expect(messageOf(schema.safeParse("1.000.000.000.000"))).toMatch(
      /muito alto/,
    );
    expect(schema.parse("0,01")).toBe(1);
  });

  it("allowNegative aceita saldo negativo", () => {
    expect(brlAmount({ allowNegative: true }).parse("-1.000,00")).toBe(-100000);
    expect(messageOf(brlAmount().safeParse("-1,00"))).toBe(
      "O valor não pode ser negativo.",
    );
  });

  it("entrada que não é string vira erro, nunca exceção", () => {
    expect(brlAmount().safeParse(undefined).success).toBe(false);
    expect(brlAmount().safeParse(12.5).success).toBe(false);
    expect(brlAmount().safeParse(null).success).toBe(false);
  });
});

describe("isoDate", () => {
  it("produz ISODate", () => {
    expect(isoDate().parse("2026-10-23")).toBe("2026-10-23");
  });

  it("rejeita data inexistente, vazia e antes de 2000", () => {
    expect(messageOf(isoDate().safeParse("2026-02-30"))).toBe(
      "Informe uma data válida.",
    );
    expect(messageOf(isoDate().safeParse(""))).toBe("Informe uma data.");
    expect(messageOf(isoDate().safeParse("1999-12-31"))).toBe(
      "Use uma data a partir de 01/01/2000.",
    );
    expect(isoDate().safeParse("2000-01-01").success).toBe(true);
    expect(isoDate().safeParse(undefined).success).toBe(false);
  });

  it("notAfterToday usa a data de São Paulo", () => {
    const schema = isoDate({ notAfterToday: true });
    const now = today();
    expect(schema.safeParse(now).success).toBe(true);
    expect(messageOf(schema.safeParse(addDays(now, 1)))).toBe(
      "A data não pode ser futura.",
    );
    expect(isoDate().safeParse(addDays(now, 1)).success).toBe(true);
  });
});

describe("campos opcionais", () => {
  it("optionalText: vazio vira undefined, aparado e limitado", () => {
    const schema = optionalText(5, "longo");
    expect(schema.parse("")).toBeUndefined();
    expect(schema.parse("   ")).toBeUndefined();
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse("  ab ")).toBe("ab");
    expect(messageOf(schema.safeParse("123456"))).toBe("longo");
  });

  it("optionalUuid: vazio vira undefined e inválido gera a mensagem", () => {
    const schema = optionalUuid("inválido");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(schema.parse("")).toBeUndefined();
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse(id)).toBe(id);
    expect(messageOf(schema.safeParse("abc"))).toBe("inválido");
  });
});
