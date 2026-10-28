import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ERROR_MESSAGES } from "@/server/error-messages";
import { toAppError } from "@/server/errors";
import type { ActionError } from "@/server/action";
import { memberErrorMessage } from "./domain/member-error-message";
import { roleLabel } from "./domain/role-labels";
import {
  can,
  canRemoveMember,
  memberActionsFor,
  type FamilyRole,
} from "./permissions";
import {
  changeRoleSchema,
  memberIdSchema,
  renameFamilySchema,
} from "./schemas";

const ID = "5f3c1b7a-2a4e-4b1c-8c55-9a1e2d3f4b66";
const pg = (code: string, message: string) => ({
  code,
  message,
  details: null,
  hint: null,
});

describe("permissões da Etapa 7 (só UX)", () => {
  it("papel, transferência e renomear: só owner; sair: admin e member", () => {
    for (const action of [
      "member.change_role",
      "member.transfer_ownership",
      "family.rename",
    ] as const) {
      expect(can("owner", action)).toBe(true);
      expect(can("admin", action)).toBe(false);
      expect(can("member", action)).toBe(false);
    }
    expect(can("owner", "family.leave")).toBe(false);
    expect(can("admin", "family.leave")).toBe(true);
    expect(can("member", "family.leave")).toBe(true);
    expect(can("member", "audit.read")).toBe(false);
  });

  it("canRemoveMember: owner remove admin e member; admin remove member; ninguém remove owner", () => {
    expect(canRemoveMember("owner", "admin")).toBe(true);
    expect(canRemoveMember("owner", "member")).toBe(true);
    expect(canRemoveMember("owner", "owner")).toBe(false);
    expect(canRemoveMember("admin", "member")).toBe(true);
    expect(canRemoveMember("admin", "admin")).toBe(false);
    expect(canRemoveMember("admin", "owner")).toBe(false);
    expect(canRemoveMember("member", "member")).toBe(false);
  });

  it("memberActionsFor: só as ações permitidas", () => {
    const none = {
      makeAdmin: false,
      makeMember: false,
      transferOwnership: false,
      remove: false,
    };
    expect(memberActionsFor("owner", { role: "member", isMe: false })).toEqual({
      makeAdmin: true,
      makeMember: false,
      transferOwnership: true,
      remove: true,
    });
    expect(memberActionsFor("owner", { role: "admin", isMe: false })).toEqual({
      makeAdmin: false,
      makeMember: true,
      transferOwnership: true,
      remove: true,
    });
    expect(memberActionsFor("owner", { role: "owner", isMe: true })).toEqual(
      none,
    );
    expect(memberActionsFor("admin", { role: "member", isMe: false })).toEqual({
      ...none,
      remove: true,
    });
    expect(memberActionsFor("admin", { role: "admin", isMe: false })).toEqual(
      none,
    );
    for (const role of ["owner", "admin", "member"] as FamilyRole[]) {
      expect(memberActionsFor("member", { role, isMe: false })).toEqual(none);
    }
  });
});

describe("schemas de família (Etapa 7)", () => {
  it("changeRoleSchema: owner não é papel atribuível; sem family_id", () => {
    expect(
      changeRoleSchema.safeParse({ memberId: ID, role: "admin" }).success,
    ).toBe(true);
    expect(
      changeRoleSchema.safeParse({ memberId: ID, role: "owner" }).success,
    ).toBe(false);
    expect(
      changeRoleSchema.safeParse({ memberId: "x", role: "member" }).success,
    ).toBe(false);
    expect(
      changeRoleSchema.parse({ memberId: ID, role: "member", familyId: "z" }),
    ).toEqual({ memberId: ID, role: "member" });
  });

  it("memberIdSchema e renameFamilySchema", () => {
    expect(memberIdSchema.safeParse({ memberId: ID }).success).toBe(true);
    expect(memberIdSchema.safeParse({}).success).toBe(false);
    expect(renameFamilySchema.parse({ name: "  Casa  " })).toEqual({
      name: "Casa",
    });
    expect(renameFamilySchema.safeParse({ name: "   " }).success).toBe(false);
    expect(renameFamilySchema.safeParse({ name: "a".repeat(81) }).success).toBe(
      false,
    );
  });
});

describe("erros das RPCs de integrantes", () => {
  it.each(["OWNER_MUST_TRANSFER", "CANNOT_TARGET_SELF", "NOT_FOUND"] as const)(
    "P0001 %s -> mesmo código com a mensagem segura",
    (code) => {
      const e = toAppError(pg("P0001", code));
      expect(e.code).toBe(code);
      expect(e.message).toBe(ERROR_MESSAGES[code]);
    },
  );

  it("42501 -> FORBIDDEN", () => {
    expect(toAppError(pg("42501", "FORBIDDEN")).code).toBe("FORBIDDEN");
  });

  it("mensagens do contrato §3.2", () => {
    expect(ERROR_MESSAGES.OWNER_MUST_TRANSFER).toBe(
      "Transfira a propriedade da família para outro integrante antes de sair.",
    );
    expect(ERROR_MESSAGES.CANNOT_TARGET_SELF).toBe(
      "Você não pode fazer isso com o seu próprio vínculo.",
    );
  });

  it("memberErrorMessage troca só o NOT_FOUND", () => {
    const base = { message: "m", requestId: "r" };
    expect(
      memberErrorMessage({ ...base, code: "NOT_FOUND" } as ActionError),
    ).toBe("Este integrante não faz mais parte da família. Atualize a página.");
    expect(
      memberErrorMessage({ ...base, code: "FORBIDDEN" } as ActionError),
    ).toBe("m");
  });

  it("roleLabel", () => {
    expect(roleLabel("owner")).toBe("Proprietário");
    expect(roleLabel("admin")).toBe("Administrador");
    expect(roleLabel("zzz")).toBe("Integrante");
    expect(roleLabel("__proto__")).toBe("Integrante");
  });
});
