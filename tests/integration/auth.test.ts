import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  actAs,
  adminClient,
  anonClient,
  createConfirmedUser,
  createSignedInUser,
  redirectOf,
  TEST_PASSWORD,
  type TestUser,
} from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  requestPasswordReset,
  signIn,
  signUp,
  updatePassword,
} from "@/modules/auth/actions";
import { getOptionalUser, requireUser } from "@/server/auth";

describe("autenticação", () => {
  let confirmed: Awaited<ReturnType<typeof createConfirmedUser>>;
  let signedIn: TestUser;

  beforeAll(async () => {
    confirmed = await createConfirmedUser("login");
    signedIn = await createSignedInUser("pwd");
  });

  it("signIn correto redireciona para /inicio por padrão", async () => {
    actAs(null);
    expect(
      await redirectOf(
        signIn({
          email: confirmed.email.toUpperCase(),
          password: confirmed.password,
        }),
      ),
    ).toBe("/inicio");
  });

  it("signIn respeita next seguro e ignora next malicioso", async () => {
    actAs(null);
    const creds = { email: confirmed.email, password: confirmed.password };
    expect(await redirectOf(signIn({ ...creds, next: "/familia" }))).toBe(
      "/familia",
    );
    expect(await redirectOf(signIn({ ...creds, next: "//evil.com" }))).toBe(
      "/inicio",
    );
    expect(
      await redirectOf(signIn({ ...creds, next: "https://evil.com" })),
    ).toBe("/inicio");
  });

  it("signIn com senha errada -> INVALID_CREDENTIALS, sem vazar detalhe", async () => {
    actAs(null);
    const result = await signIn({
      email: confirmed.email,
      password: "errada-123",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_CREDENTIALS" },
    });
    if (!result.ok)
      expect(result.error.message).not.toMatch(/supabase|gotrue|jwt/i);
  });

  it("signUp responde com o e-mail e o usuário fica sem confirmar (EMAIL_NOT_CONFIRMED)", async () => {
    actAs(null);
    const email = `it-signup-${randomUUID().slice(0, 8)}@example.test`;
    expect(
      await signUp({
        displayName: "  Novo Usuário ",
        email: email.toUpperCase(),
        password: TEST_PASSWORD,
      }),
    ).toEqual({ ok: true, data: { email } });

    expect(await signIn({ email, password: TEST_PASSWORD })).toMatchObject({
      ok: false,
      error: { code: "EMAIL_NOT_CONFIRMED" },
    });
  });

  it("signIn de usuário não confirmado -> EMAIL_NOT_CONFIRMED", async () => {
    actAs(null);
    const email = `it-unconfirmed-${randomUUID().slice(0, 8)}@example.test`;
    const created = await adminClient().auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: false,
    });
    expect(created.error).toBeNull();
    expect(await signIn({ email, password: TEST_PASSWORD })).toMatchObject({
      ok: false,
      error: { code: "EMAIL_NOT_CONFIRMED" },
    });
  });

  it("signUp com next de convite não quebra e next malicioso é ignorado", async () => {
    actAs(null);
    const token = "ab12".repeat(16);
    for (const next of [`/convite/${token}`, "//evil.com"]) {
      const email = `it-signup-next-${randomUUID().slice(0, 8)}@example.test`;
      expect(
        await signUp({
          displayName: "Convidado",
          email,
          password: TEST_PASSWORD,
          next,
        }),
      ).toEqual({ ok: true, data: { email } });
    }
  });

  it("signUp de e-mail já cadastrado responde igual ao sucesso", async () => {
    actAs(null);
    expect(
      await signUp({
        displayName: "Repetido",
        email: confirmed.email,
        password: TEST_PASSWORD,
      }),
    ).toEqual({ ok: true, data: { email: confirmed.email } });
  });

  it("signUp duas vezes seguidas com o mesmo e-mail responde igual (SEC-13)", async () => {
    actAs(null);
    const email = `it-signup-twice-${randomUUID().slice(0, 8)}@example.test`;
    const input = { displayName: "Dupla", email, password: TEST_PASSWORD };
    expect(await signUp(input)).toEqual({ ok: true, data: { email } });
    expect(await signUp(input)).toEqual({ ok: true, data: { email } });
  });

  it("signUp valida senha fraca e e-mail na borda", async () => {
    actAs(null);
    expect(
      await signUp({
        displayName: "A",
        email: "x@example.test",
        password: "curta",
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        fieldErrors: { password: expect.any(Array) },
      },
    });
  });

  it("requestPasswordReset responde ok para e-mail existente e inexistente", async () => {
    actAs(null);
    const unknown = `it-nao-existe-${randomUUID().slice(0, 8)}@example.test`;
    expect(await requestPasswordReset({ email: confirmed.email })).toEqual({
      ok: true,
      data: null,
    });
    expect(await requestPasswordReset({ email: unknown })).toEqual({
      ok: true,
      data: null,
    });
  });

  it("updatePassword exige sessão", async () => {
    actAs(null);
    expect(
      await updatePassword({
        password: "NovaSenha-2",
        confirmPassword: "NovaSenha-2",
      }),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("updatePassword: SAME_PASSWORD, WEAK_PASSWORD e sucesso com redirect", async () => {
    actAs(signedIn);
    expect(
      await updatePassword({
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      }),
    ).toMatchObject({ ok: false, error: { code: "SAME_PASSWORD" } });

    expect(
      await updatePassword({
        password: "abcdefgh",
        confirmPassword: "abcdefgh",
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });

    expect(
      await redirectOf(
        updatePassword({
          password: "NovaSenha-2",
          confirmPassword: "NovaSenha-2",
        }),
      ),
    ).toBe("/inicio");

    const check = await anonClient().auth.signInWithPassword({
      email: signedIn.email,
      password: "NovaSenha-2",
    });
    expect(check.error).toBeNull();
  });

  it("guards: getOptionalUser / requireUser", async () => {
    actAs(signedIn);
    expect(await getOptionalUser()).toEqual({
      id: signedIn.id,
      email: signedIn.email,
    });
    expect(await requireUser()).toEqual({
      id: signedIn.id,
      email: signedIn.email,
    });

    actAs(null);
    expect(await getOptionalUser()).toBeNull();
    await expect(redirectOf(requireUser())).resolves.toBe("/login");
  });
});
