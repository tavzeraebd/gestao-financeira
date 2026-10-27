import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addDays, addMonths, today } from "@/lib/dates";
import {
  addContribution,
  changeGoalStatus,
  createGoal,
  deleteContribution,
  updateGoal,
} from "@/modules/goals/actions";
import { getGoal, listGoalOptions, listGoals } from "@/modules/goals/queries";
import { getDashboard } from "@/modules/reports/queries";
import { dashboardFiltersSchema } from "@/modules/reports/schemas";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { mkAccount } from "./helpers/fixtures";

const goalInput = (over: Record<string, unknown> = {}) => ({
  name: "Viagem",
  targetAmount: "1.000,00",
  icon: "plane" as const,
  idempotencyKey: randomUUID(),
  ...over,
});

const contribution = (goalId: string, over: Record<string, unknown> = {}) => ({
  goalId,
  kind: "deposit" as const,
  amount: "100,00",
  contributionDate: today(),
  idempotencyKey: randomUUID(),
  ...over,
});

describe("metas: regras, permissões, aportes e visão", () => {
  let fam: TestFamily;
  let other: TestFamily;
  let memberId: string;

  async function mkGoal(over: Record<string, unknown> = {}): Promise<string> {
    actAs(fam.owner);
    const r = await createGoal(goalInput(over));
    if (!r.ok) throw new Error(`createGoal falhou: ${r.error.code}`);
    return r.data.id;
  }

  async function mkContribution(
    goalId: string,
    user: TestFamily["owner"],
    over: Record<string, unknown> = {},
  ): Promise<string> {
    actAs(user);
    const r = await addContribution(contribution(goalId, over));
    if (!r.ok) throw new Error(`addContribution falhou: ${r.error.code}`);
    return r.data.id;
  }

  beforeAll(async () => {
    fam = await createTestFamily("mt");
    other = await createTestFamily("mt-outra");
    actAs(fam.member);
    // Id do vínculo do member: as ações o resolvem; aqui só para o teste de "por outro".
    const g = await mkGoal({ name: "Sonda" });
    await mkContribution(g, fam.member);
    memberId = (await getGoal(g))!.contributions.items[0]!.member.id;
  });

  it("member não cria nem edita; owner e admin criam; chave repetida devolve o mesmo id", async () => {
    actAs(fam.member);
    expect(await createGoal(goalInput())).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });

    actAs(fam.admin);
    const key = randomUUID();
    const a = await createGoal(goalInput({ idempotencyKey: key }));
    const b = await createGoal(goalInput({ idempotencyKey: key }));
    expect(a).toMatchObject({ ok: true });
    expect(b).toEqual(a);

    expect(await createGoal(goalInput({ name: "  " }))).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await createGoal(goalInput({ targetAmount: "0,00" }))).toMatchObject(
      { ok: false, error: { code: "VALIDATION_ERROR" } },
    );
    expect(
      await createGoal(goalInput({ targetDate: addDays(today(), -1) })),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });

    if (!a.ok) return;
    actAs(fam.member);
    expect(
      await updateGoal({
        goalId: a.data.id,
        name: "Outro",
        targetAmount: "10,00",
        icon: "gift",
      }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await changeGoalStatus({ goalId: a.data.id, to: "paused" }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    actAs(fam.owner);
    expect(
      await updateGoal({
        goalId: a.data.id,
        name: "Viagem 2",
        targetAmount: "2.000,00",
        icon: "gift",
        targetDate: addMonths(today(), 6),
      }),
    ).toEqual({ ok: true, data: null });
    const g = await getGoal(a.data.id);
    expect(g).toMatchObject({
      name: "Viagem 2",
      targetAmount: 200000,
      icon: "gift",
      canManage: true,
    });
  });

  it("aporte: member só para si; admin para qualquer integrante; data futura e valor inválido recusados", async () => {
    const id = await mkGoal({ name: "Reserva" });

    actAs(fam.member);
    const own = await addContribution(contribution(id, { amount: "50,00" }));
    expect(own).toMatchObject({ ok: true });
    expect(
      await addContribution(contribution(id, { memberId: undefined })),
    ).toMatchObject({ ok: true });

    // member lançando por outro integrante -> FORBIDDEN (trigger).
    actAs(fam.owner);
    const g = (await getGoal(id))!;
    const ownerMember = g.members.find((m) => m.id !== memberId)!;
    actAs(fam.member);
    expect(
      await addContribution(contribution(id, { memberId: ownerMember.id })),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    // admin lança pelo member.
    actAs(fam.admin);
    expect(await addContribution(contribution(id, { memberId }))).toMatchObject(
      { ok: true },
    );

    expect(
      await addContribution(
        contribution(id, { contributionDate: addDays(today(), 1) }),
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(
      await addContribution(contribution(id, { amount: "0,00" })),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });

    // Chave repetida: mesmo id, um só aporte.
    const key = randomUUID();
    const a = await addContribution(contribution(id, { idempotencyKey: key }));
    const b = await addContribution(contribution(id, { idempotencyKey: key }));
    expect(b).toEqual(a);
    const after = (await getGoal(id))!;
    // 50 + 100 (member) + 100 (admin pelo member) + 100 (chave) em centavos.
    expect(after.saved).toBe(35000);
  });

  it("retirada além do acumulado: GOAL_NEGATIVE_PROGRESS no campo valor; excluir aporte que zera idem", async () => {
    const id = await mkGoal({ name: "Negativo" });
    const dep = await mkContribution(id, fam.owner, { amount: "100,00" });
    actAs(fam.owner);
    const bad = await addContribution(
      contribution(id, { kind: "withdrawal", amount: "100,01" }),
    );
    expect(bad).toMatchObject({
      ok: false,
      error: { code: "GOAL_NEGATIVE_PROGRESS" },
    });
    if (!bad.ok) expect(bad.error.fieldErrors?.amount?.length).toBe(1);

    expect(
      await addContribution(
        contribution(id, { kind: "withdrawal", amount: "30,00" }),
      ),
    ).toMatchObject({ ok: true });
    expect((await getGoal(id))!.saved).toBe(7000);

    // Excluir o aporte de 100 deixaria -30.
    expect(await deleteContribution({ contributionId: dep })).toMatchObject({
      ok: false,
      error: { code: "GOAL_NEGATIVE_PROGRESS" },
    });
  });

  it("excluir aporte: member só o seu; owner qualquer; some do histórico e do acumulado", async () => {
    const id = await mkGoal({ name: "Exclusão" });
    const byOwner = await mkContribution(id, fam.owner, { amount: "10,00" });
    const byMember = await mkContribution(id, fam.member, { amount: "20,00" });

    actAs(fam.member);
    const view = (await getGoal(id))!;
    expect(
      Object.fromEntries(
        view.contributions.items.map((c) => [c.id, c.canDelete]),
      ),
    ).toEqual({ [byOwner]: false, [byMember]: true });
    expect(await deleteContribution({ contributionId: byOwner })).toMatchObject(
      { ok: false, error: { code: "FORBIDDEN" } },
    );
    expect(await deleteContribution({ contributionId: byMember })).toEqual({
      ok: true,
      data: null,
    });
    expect(
      await deleteContribution({ contributionId: byMember }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });

    actAs(fam.owner);
    expect(await deleteContribution({ contributionId: byOwner })).toEqual({
      ok: true,
      data: null,
    });
    const after = (await getGoal(id))!;
    expect(after.saved).toBe(0);
    expect(after.contributions.total).toBe(0);
  });

  it("detalhe: acumulado, restante, percentual, estimativa e histórico paginado (20 por página)", async () => {
    const id = await mkGoal({
      name: "Detalhe",
      targetAmount: "1.000,00",
      targetDate: addMonths(today(), 5),
    });
    // 22 aportes de R$ 10,00 = R$ 220,00 na janela de 90 dias.
    for (let i = 0; i < 22; i++) {
      await mkContribution(id, fam.owner, {
        amount: "10,00",
        contributionDate: addDays(today(), -i),
      });
    }
    actAs(fam.member);
    const p1 = (await getGoal(id))!;
    expect(p1).toMatchObject({
      saved: 22000,
      remaining: 78000,
      percent: 22,
      status: "active",
      canManage: false,
      canContribute: true,
    });
    expect(p1.contributions).toMatchObject({
      total: 22,
      page: 1,
      pageCount: 2,
    });
    expect(p1.contributions.items).toHaveLength(20);
    expect(p1.contributions.items[0]!.date).toBe(today());
    // Ritmo = 22000 / 3 (arredondado), premissa sempre presente.
    expect(p1.estimate).toMatchObject({
      pace: 7333,
      paceSource: "history",
      monthsToTarget: 5,
      requiredMonthly: 15600,
    });
    expect(p1.estimate.premise.length).toBeGreaterThan(0);
    expect(p1.members.length).toBe(3);

    const p2 = (await getGoal(id, { page: 2 }))!;
    expect(p2.contributions.items).toHaveLength(2);
    const far = (await getGoal(id, { page: 9 }))!;
    expect(far.contributions).toMatchObject({ items: [], total: 22, page: 9 });

    expect(await getGoal("não-é-uuid")).toBeNull();
    expect(await getGoal(randomUUID())).toBeNull();
  });

  it("status: pausada recusa aporte; concluída fixa a data e é terminal; filtros da lista", async () => {
    const id = await mkGoal({ name: "Ciclo" });
    actAs(fam.admin);
    expect(await changeGoalStatus({ goalId: id, to: "paused" })).toEqual({
      ok: true,
      data: null,
    });
    // Repetir o mesmo estado é sucesso.
    expect(await changeGoalStatus({ goalId: id, to: "paused" })).toEqual({
      ok: true,
      data: null,
    });
    actAs(fam.member);
    expect(await addContribution(contribution(id))).toMatchObject({
      ok: false,
      error: { code: "GOAL_NOT_ACTIVE" },
    });
    expect((await getGoal(id))!.canContribute).toBe(false);

    actAs(fam.admin);
    await changeGoalStatus({ goalId: id, to: "active" });
    await changeGoalStatus({ goalId: id, to: "completed" });
    const done = (await getGoal(id))!;
    expect(done.status).toBe("completed");
    expect(done.completedAt).not.toBeNull();
    expect(await changeGoalStatus({ goalId: id, to: "active" })).toMatchObject({
      ok: false,
      error: { code: "INVALID_STATUS_TRANSITION" },
    });

    const cancel = await mkGoal({ name: "Cancelar" });
    actAs(fam.owner);
    await changeGoalStatus({ goalId: cancel, to: "canceled" });

    const ids = async (situacao: "ativas" | "concluidas" | "todas") =>
      (await listGoals({ situacao })).map((g) => g.id);
    expect(await ids("concluidas")).toContain(id);
    expect(await ids("concluidas")).not.toContain(cancel);
    expect(await ids("ativas")).not.toContain(id);
    expect(await ids("ativas")).not.toContain(cancel);
    expect(await ids("todas")).toEqual(expect.arrayContaining([id, cancel]));
    expect(await listGoalOptions()).toSatisfy((l: { status: string }[]) =>
      l.every((g) => g.status === "active"),
    );
  });

  it("outra família não enxerga nem altera metas", async () => {
    const id = await mkGoal({ name: "Privada" });
    actAs(other.owner);
    expect(await getGoal(id)).toBeNull();
    expect(
      (await listGoals({ situacao: "todas" })).map((g) => g.id),
    ).not.toContain(id);
    expect(await changeGoalStatus({ goalId: id, to: "paused" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await addContribution(contribution(id))).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("dashboard: até 3 metas ativas por data-alvo; metas não mudam o saldo das contas", async () => {
    const fresh = await createTestFamily("mt-dash");
    actAs(fresh.owner);
    await mkAccount(fresh.owner, "Corrente", { openingBalance: "1.000,00" });
    const filters = dashboardFiltersSchema.parse({});
    const before = await getDashboard(filters);
    expect(before.goals).toEqual([]);

    const mk = async (over: Record<string, unknown>) => {
      actAs(fresh.owner);
      const r = await createGoal(goalInput(over));
      if (!r.ok) throw new Error(r.error.code);
      return r.data.id;
    };
    const late = await mk({ name: "Tarde", targetDate: addMonths(today(), 9) });
    const none = await mk({ name: "Sem data" });
    const soon = await mk({ name: "Cedo", targetDate: addMonths(today(), 2) });
    const mid = await mk({ name: "Meio", targetDate: addMonths(today(), 4) });
    const paused = await mk({
      name: "Pausada",
      targetDate: addMonths(today(), 1),
    });
    await changeGoalStatus({ goalId: paused, to: "paused" });
    actAs(fresh.owner);
    await addContribution(contribution(soon, { amount: "250,00" }));

    const after = await getDashboard(filters);
    expect(after.goals.map((g) => g.id)).toEqual([soon, mid, late]);
    expect(after.goals[0]).toMatchObject({
      name: "Cedo",
      icon: "plane",
      saved: 25000,
      target: 100000,
      percent: 25,
    });
    expect(after.goals.map((g) => g.id)).not.toContain(none);
    expect(after.consolidated).toEqual(before.consolidated);
    expect(after.income).toEqual(before.income);
    expect(after.expense).toEqual(before.expense);
  });
});
