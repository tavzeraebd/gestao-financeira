import { describe, expect, it } from "vitest";
import { asCents, formatBRL } from "@/lib/money";
import { ACTIVITY_GROUPS, AUDIT_ACTIONS, actionsOfGroup } from "../constants";
import { activityFiltersSchema } from "../schemas";
import { describeAuditEvent, memberIdsOf } from "./describe";

const ID = "5f3c1b7a-2a4e-4b1c-8c55-9a1e2d3f4b66";
const ctx = {
  memberName: (id: string) => (id === ID ? "Ana" : "Ex-integrante"),
};

function ev(
  action: string,
  metadata: unknown,
  entityId: string | null = ID,
  entityType = "x",
) {
  return describeAuditEvent({ action, entityType, entityId, metadata }, ctx);
}

describe("describeAuditEvent", () => {
  it("lançamento editado mostra valor antes e depois", () => {
    const r = ev("transaction.updated", {
      changed: ["amount"],
      old: { amount: "200.00" },
      new: { amount: "250.00" },
    });
    expect(r.title).toBe("Lançamento editado");
    expect(r.detail).toBe(
      `Valor ${formatBRL(asCents(20000))} → ${formatBRL(asCents(25000))}`,
    );
    expect(r.href).toBe(`/transacoes/${ID}`);
  });

  it("papel alterado", () => {
    const r = ev("member.role_changed", {
      member_id: ID,
      from_role: "member",
      to_role: "admin",
    });
    expect(r.title).toBe("Papel alterado");
    expect(r.detail).toBe("Ana: Integrante → Administrador");
  });

  it("remoção e saída citam convites revogados", () => {
    expect(
      ev("member.removed", {
        member_id: ID,
        from_role: "admin",
        revoked_invites: 2,
      }).detail,
    ).toBe("Ana (Administrador) · 2 convite(s) revogado(s)");
    expect(
      ev("member.left", {
        member_id: ID,
        from_role: "member",
        revoked_invites: 0,
      }).title,
    ).toBe("Integrante saiu");
  });

  it("transferência de propriedade", () => {
    expect(ev("family.ownership_transferred", { member_id: ID }).detail).toBe(
      "Novo proprietário: Ana",
    );
  });

  it("ação desconhecida -> genérico, sem metadata crua", () => {
    const r = ev("coisa.nova", { segredo: "xyz" });
    expect(r).toEqual({
      title: "Alteração registrada",
      detail: null,
      href: null,
    });
  });

  it("todas as ações do catálogo têm descrição própria e nunca lançam com metadata vazia ou inválida", () => {
    for (const action of AUDIT_ACTIONS) {
      for (const meta of [
        {},
        null,
        "x",
        [],
        { changed: "x", old: 1, new: [] },
      ]) {
        const r = ev(action, meta);
        expect(r.title, action).not.toBe("Alteração registrada");
        expect(r.detail ?? "").not.toContain("[object Object]");
      }
    }
  });

  it("id que não é uuid -> sem link", () => {
    expect(ev("transaction.updated", {}, "../x").href).toBeNull();
    expect(ev("goal.updated", {}, "x").href).toBeNull();
  });

  it("memberIdsOf só devolve uuids", () => {
    expect(
      memberIdsOf({ member_id: ID, previous_owner_member_id: "x" }),
    ).toEqual([ID]);
    expect(memberIdsOf(null)).toEqual([]);
  });
});

describe("grupos de atividade", () => {
  it("actionsOfGroup expande prefixos sobre o catálogo fechado", () => {
    expect(actionsOfGroup("familia")).toContain("member.removed");
    expect(actionsOfGroup("familia")).not.toContain("goal.updated");
    expect(actionsOfGroup("compromissos")).toEqual(
      expect.arrayContaining([
        "recurrence.paused",
        "transaction.paid",
        "transaction.canceled",
      ]),
    );
    expect(actionsOfGroup("compromissos")).not.toContain("transaction.updated");
    expect(actionsOfGroup("divisao")).toEqual(
      expect.arrayContaining([
        "transaction.splits_changed",
        "settlement.created",
      ]),
    );
    expect(actionsOfGroup("metas")).toContain("goal_contribution.deleted");
  });

  it("todo grupo do contrato existe", () => {
    expect(Object.keys(ACTIVITY_GROUPS)).toEqual([
      "familia",
      "lancamentos",
      "compromissos",
      "metas",
      "divisao",
    ]);
  });

  it("activityFiltersSchema é tolerante", () => {
    expect(activityFiltersSchema.parse({})).toEqual({
      pagina: 1,
      por_pagina: 20,
    });
    expect(
      activityFiltersSchema.parse({
        grupo: "metas",
        de: "2026-10-01",
        ate: "2026-10-31",
        pagina: "2",
        por_pagina: "50",
      }),
    ).toEqual({
      grupo: "metas",
      de: "2026-10-01",
      ate: "2026-10-31",
      pagina: 2,
      por_pagina: 50,
    });
    expect(
      activityFiltersSchema.parse({ grupo: "x", por_pagina: "7", pagina: "0" }),
    ).toEqual({
      pagina: 1,
      por_pagina: 20,
    });
  });

  it("de depois de ate descarta o período", () => {
    expect(
      activityFiltersSchema.parse({ de: "2026-10-31", ate: "2026-10-01" }),
    ).toEqual({ pagina: 1, por_pagina: 20 });
  });
});
