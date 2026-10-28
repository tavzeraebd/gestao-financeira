import { describe, expect, it } from "vitest";
import type { ISODate } from "@/lib/dates";
import { asCents, formatBRL } from "@/lib/money";
import {
  DEFAULT_NOTIFICATION_TAB,
  NOTIFICATION_TABS,
  NOTIFICATION_TYPES,
} from "../constants";
import { notificationFiltersSchema, notificationIdSchema } from "../schemas";
import type { NotificationRow } from "../types";
import { renderNotification } from "./render";

const ID = "5f3c1b7a-2a4e-4b1c-8c55-9a1e2d3f4b66";
const ctx = {
  today: "2026-10-27" as ISODate,
  memberName: (id: string) => (id === ID ? "Ana" : "Ex-integrante"),
};

function row(over: Partial<NotificationRow>): NotificationRow {
  return {
    id: "n1",
    type: "bill_due_soon",
    entityType: "transaction",
    entityId: ID,
    data: {},
    createdAt: "2026-10-27T10:00:00Z",
    readAt: null,
    ...over,
  };
}

describe("renderNotification", () => {
  it("conta a vencer: texto do contrato e link de compromisso", () => {
    const r = renderNotification(
      row({
        data: {
          kind: "expense",
          description: "Aluguel",
          amount: "1200.00",
          due_date: "2026-10-30",
        },
      }),
      ctx,
    );
    expect(r.title).toBe("Conta a vencer");
    expect(r.message).toBe(
      `Aluguel vence em 3 dias · ${formatBRL(asCents(120000))}`,
    );
    expect(r.href).toBe(`/compromissos/${ID}`);
    expect(r.icon).toBe("bill");
  });

  it("vence hoje / amanhã", () => {
    const base = { kind: "expense", description: "Luz", amount: "10.00" };
    expect(
      renderNotification(
        row({ data: { ...base, due_date: "2026-10-27" } }),
        ctx,
      ).message,
    ).toMatch(/^Luz vence hoje/);
    expect(
      renderNotification(
        row({ data: { ...base, due_date: "2026-10-28" } }),
        ctx,
      ).message,
    ).toMatch(/^Luz vence amanhã/);
  });

  it("conta vencida", () => {
    const r = renderNotification(
      row({
        type: "bill_overdue",
        data: {
          kind: "expense",
          description: "Água",
          amount: "80.50",
          due_date: "2026-10-20",
        },
      }),
      ctx,
    );
    expect(r.title).toBe("Conta vencida");
    expect(r.message).toBe(
      `Água venceu em 20/10/2026 · ${formatBRL(asCents(8050))}`,
    );
    expect(r.icon).toBe("overdue");
  });

  it("meta próxima", () => {
    const r = renderNotification(
      row({
        type: "goal_near_target",
        entityType: "goal",
        data: { name: "Reserva de emergência", percent: 80 },
      }),
      ctx,
    );
    expect(r.title).toBe("Meta próxima");
    expect(r.message).toBe("Sua meta Reserva de emergência atingiu 80%");
    expect(r.href).toBe(`/metas/${ID}`);
  });

  it("orçamento perto do limite: link com o mês", () => {
    const r = renderNotification(
      row({
        type: "budget_near_limit",
        entityType: "budget",
        data: {
          category_name: null,
          month: "2026-10",
          spent: "425.00",
          limit: "500.00",
          percent: 85,
        },
      }),
      ctx,
    );
    expect(r.href).toBe("/orcamentos?mes=2026-10");
    expect(r.message).toContain("Todas as despesas chegou a 85% do limite");
    expect(r.icon).toBe("budget");
  });

  it("despesa registrada para o responsável: pendente -> compromissos, efetivado -> transações", () => {
    const data = {
      kind: "expense",
      description: "Supermercado",
      amount: "342.50",
      status: "paid",
    };
    const paid = renderNotification(
      row({ type: "financial_event", data }),
      ctx,
    );
    expect(paid.title).toBe("Despesa registrada");
    expect(paid.message).toBe(`Supermercado · ${formatBRL(asCents(34250))}`);
    expect(paid.href).toBe(`/transacoes/${ID}`);
    const pending = renderNotification(
      row({ type: "financial_event", data: { ...data, status: "pending" } }),
      ctx,
    );
    expect(pending.href).toBe(`/compromissos/${ID}`);
  });

  it("acerto: direção e link fixo", () => {
    const r = renderNotification(
      row({
        type: "financial_event",
        entityType: "settlement",
        data: {
          amount: "50.00",
          settlement_date: "2026-10-26",
          direction: "to_me",
        },
      }),
      ctx,
    );
    expect(r.message).toContain("Você recebeu");
    expect(r.href).toBe("/divisao/acertos");
  });

  it("novo integrante usa o nome resolvido pelo contexto", () => {
    const r = renderNotification(
      row({
        type: "member_joined",
        entityType: "family_member",
        data: { role: "admin" },
      }),
      ctx,
    );
    expect(r.message).toBe("Ana entrou na família como Administrador");
    expect(r.href).toBe("/familia");
    expect(r.icon).toBe("member");
  });

  it("entityId que não é uuid -> sem link", () => {
    expect(
      renderNotification(row({ entityId: "../../admin" }), ctx).href,
    ).toBeNull();
    expect(
      renderNotification(row({ entityType: "goal", entityId: "x" }), ctx).href,
    ).toBeNull();
  });

  it("dados malformados nunca lançam nem vazam o objeto cru", () => {
    for (const data of [
      null,
      "texto",
      42,
      [],
      { amount: 1e21, description: {} },
    ]) {
      const r = renderNotification(row({ data }), ctx);
      expect(r.title).toBeTruthy();
      expect(r.message).not.toContain("[object Object]");
    }
  });

  it("tipo ou entidade desconhecidos -> texto genérico, sem link", () => {
    const r = renderNotification(
      row({ type: "novo_tipo", entityType: "zzz" }),
      ctx,
    );
    expect(r.href).toBeNull();
    expect(r.title).toBe("Notificação");
  });
});

describe("constantes e schemas de notificações", () => {
  it("abas: todas = todos os tipos; lembretes e conquistas do contrato", () => {
    expect(NOTIFICATION_TABS.todas).toEqual(NOTIFICATION_TYPES);
    expect(NOTIFICATION_TABS.lembretes).toEqual([
      "bill_due_soon",
      "bill_overdue",
      "budget_near_limit",
    ]);
    expect(NOTIFICATION_TABS.conquistas).toEqual(["goal_near_target"]);
  });

  it("notificationFiltersSchema é tolerante", () => {
    expect(notificationFiltersSchema.parse({})).toEqual({
      aba: DEFAULT_NOTIFICATION_TAB,
      pagina: 1,
    });
    expect(
      notificationFiltersSchema.parse({ aba: "lembretes", pagina: "3" }),
    ).toEqual({
      aba: "lembretes",
      pagina: 3,
    });
    expect(notificationFiltersSchema.parse({ aba: "x", pagina: "-2" })).toEqual(
      {
        aba: "todas",
        pagina: 1,
      },
    );
    expect(notificationFiltersSchema.parse(null).pagina).toBe(1);
  });

  it("notificationIdSchema exige uuid", () => {
    expect(notificationIdSchema.safeParse({ notificationId: ID }).success).toBe(
      true,
    );
    expect(
      notificationIdSchema.safeParse({ notificationId: "1" }).success,
    ).toBe(false);
    expect(
      notificationIdSchema.safeParse({ notificationId: ID, familyId: "x" })
        .data,
    ).toEqual({
      notificationId: ID,
    });
  });
});
