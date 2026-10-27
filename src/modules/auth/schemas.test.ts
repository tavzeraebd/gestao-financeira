import { describe, expect, it } from "vitest";
import {
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
} from "@/modules/auth/schemas";

describe("signUpSchema", () => {
  const ok = {
    displayName: "  Ana  ",
    email: "  ANA@Example.COM ",
    password: "abcdefg1",
  };

  it("normaliza nome e e-mail", () => {
    const r = signUpSchema.parse(ok);
    expect(r.displayName).toBe("Ana");
    expect(r.email).toBe("ana@example.com");
  });

  it("limites do nome", () => {
    expect(signUpSchema.safeParse({ ...ok, displayName: "   " }).success).toBe(
      false,
    );
    expect(
      signUpSchema.safeParse({ ...ok, displayName: "a".repeat(80) }).success,
    ).toBe(true);
    expect(
      signUpSchema.safeParse({ ...ok, displayName: "a".repeat(81) }).success,
    ).toBe(false);
  });

  it("e-mail inválido ou acima de 254", () => {
    expect(signUpSchema.safeParse({ ...ok, email: "sem-arroba" }).success).toBe(
      false,
    );
    const longo = `${"a".repeat(250)}@x.com`;
    expect(signUpSchema.safeParse({ ...ok, email: longo }).success).toBe(false);
  });

  it("senha: 8..72, uma letra e um dígito", () => {
    const p = (password: string) =>
      signUpSchema.safeParse({ ...ok, password }).success;
    expect(p("abc1234")).toBe(false);
    expect(p("abcdefg1")).toBe(true);
    expect(p("abcdefgh")).toBe(false);
    expect(p("12345678")).toBe(false);
    expect(p("a1" + "x".repeat(70))).toBe(true);
    expect(p("a1" + "x".repeat(71))).toBe(false);
  });

  it("não altera a senha (sem trim)", () => {
    expect(signUpSchema.parse({ ...ok, password: " abcdefg1 " }).password).toBe(
      " abcdefg1 ",
    );
  });

  it("erro de campo identifica o campo", () => {
    const r = signUpSchema.safeParse({ ...ok, email: "x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["email"]);
  });
});

describe("signInSchema", () => {
  it("senha 1..72 e next opcional até 512", () => {
    const base = { email: "a@b.co", password: "x" };
    expect(signInSchema.safeParse(base).success).toBe(true);
    expect(signInSchema.safeParse({ ...base, password: "" }).success).toBe(
      false,
    );
    expect(
      signInSchema.safeParse({ ...base, password: "x".repeat(73) }).success,
    ).toBe(false);
    expect(
      signInSchema.safeParse({ ...base, next: "/" + "a".repeat(511) }).success,
    ).toBe(true);
    expect(
      signInSchema.safeParse({ ...base, next: "/" + "a".repeat(512) }).success,
    ).toBe(false);
  });
});

describe("updatePasswordSchema", () => {
  it("exige confirmação igual, com erro em confirmPassword", () => {
    const r = updatePasswordSchema.safeParse({
      password: "abcdefg1",
      confirmPassword: "abcdefg2",
    });
    expect(r.success).toBe(false);
    if (!r.success)
      expect(r.error.issues[0]?.path).toEqual(["confirmPassword"]);
    expect(
      updatePasswordSchema.safeParse({
        password: "abcdefg1",
        confirmPassword: "abcdefg1",
      }).success,
    ).toBe(true);
  });

  it("aplica a regra de senha", () => {
    expect(
      updatePasswordSchema.safeParse({
        password: "curta1",
        confirmPassword: "curta1",
      }).success,
    ).toBe(false);
  });
});
