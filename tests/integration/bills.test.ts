import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs, adminClient } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addDays, today } from "@/lib/dates";
import {
  cancelBill,
  createBill,
  payBill,
  updateBill,
} from "@/modules/bills/actions";
import {
  getBill,
  getBillsSummary,
  listBills,
  listUpcomingBills,
} from "@/modules/bills/queries";
import { billFiltersSchema } from "@/modules/bills/schemas";
import { getFamilyOverview } from "@/modules/family/queries";
import { getDashboard } from "@/modules/reports/queries";
import { dashboardFiltersSchema } from "@/modules/reports/schemas";
import {
  getPendingCommitted,
  getTransaction,
  listTransactions,
} from "@/modules/transactions/queries";
import { getPeriodSummary } from "@/modules/transactions/queries";
import { transactionFiltersSchema } from "@/modules/transactions/schemas";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount } from "./helpers/fixtures";

const admin = adminClient();
const bf = (raw: Record<string, string> = {}) => billFiltersSchema.parse(raw);

describe("compromissos: criar, listar, pagar e cancelar", () => {
  let fam: TestFamily;
  let other: TestFamily;
  let checking: string;
  let expenseCat: string;
  let memberId: string;

  beforeAll(async () => {
    fam = await createTestFamily("bill");
    other = await createTestFamily("bill-outra");
    checking = await mkAccount(fam.owner, "Corrente", {
      openingBalance: "1.000,00",
    });
    expenseCat = await defaultCategoryId(fam.owner, "expense", "Alimentação");
    memberId =
      (await getFamilyOverview()).members.find(
        (m) => m.userId === fam.member.id,
      )?.memberId ?? "";
  });

  const newBill = (over: Record<string, unknown> = {}) => ({
    repeat: false as const,
    kind: "pagar" as const,
    description: "Conta de luz",
    amount: "80,00",
    dueDate: addDays(today(), 5),
    accountId: checking,
    categoryId: expenseCat,
    idempotencyKey: randomUUID(),
    ...over,
  });

  async function mk(over: Record<string, unknown> = {}): Promise<string> {
    const r = await createBill(newBill(over));
    if (!r.ok) throw new Error(`createBill falhou: ${r.error.code}`);
    return r.data.id;
  }

  it("createBill é idempotente (avulso e série) e a ocorrência aparece em listBills", async () => {
    actAs(fam.owner);
    const single = newBill({ description: "Avulsa" });
    const a = await createBill(single);
    const b = await createBill(single);
    expect(a).toMatchObject({ ok: true, data: { kind: "transaction" } });
    if (a.ok && b.ok) expect(b.data.id).toBe(a.data.id);

    const serie = newBill({
      description: "Internet",
      repeat: true,
      frequency: "weekly",
      intervalCount: 1,
      dueDate: addDays(today(), 1),
    });
    const s1 = await createBill(serie);
    const s2 = await createBill(serie);
    expect(s1).toMatchObject({ ok: true, data: { kind: "recurrence" } });
    if (s1.ok && s2.ok) {
      expect(s2.data.id).toBe(s1.data.id);
      const list = await listBills(bf({ serie: s1.data.id }));
      expect(list.total).toBeGreaterThan(1);
      expect(list.items.every((i) => i.recurrence?.id === s1.data.id)).toBe(
        true,
      );
      const { count } = await admin
        .from("recurrences")
        .select("id", { count: "exact", head: true })
        .eq("idempotency_key", serie.idempotencyKey);
      expect(count).toBe(1);
    }
  });

  it("compromisso pendente não aparece em listTransactions nem no realizado", async () => {
    actAs(fam.owner);
    const id = await mk({ description: "Pendente fora" });
    const tx = await listTransactions(transactionFiltersSchema.parse({}));
    expect(tx.items.some((i) => i.id === id)).toBe(false);
    const summary = await getPeriodSummary(
      addDays(today(), -30),
      addDays(today(), 30),
    );
    expect(summary.expense).toBe(0);
    expect(await getPendingCommitted()).toBeGreaterThan(0);
  });

  it("responsável (member) paga; outro member não; segundo pagamento -> INVALID_STATUS_TRANSITION; mesma linha vira paid", async () => {
    actAs(fam.owner);
    const own = await mk({ description: "Do owner" });
    const assigned = await mk({
      description: "Do member",
      assignedMemberId: memberId,
      dueDate: addDays(today(), -1),
    });
    const input = (id: string) => ({
      transactionId: id,
      paidOn: today(),
      amount: "85,00",
      accountId: checking,
    });

    actAs(fam.member);
    expect(await payBill(input(own))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect((await getBill(assigned))?.canPay).toBe(true);
    expect((await getBill(own))?.canPay).toBe(false);
    expect(await payBill(input(assigned))).toMatchObject({ ok: true });
    expect(await payBill(input(assigned))).toMatchObject({
      ok: false,
      error: { code: "INVALID_STATUS_TRANSITION" },
    });

    const paid = await getTransaction(assigned);
    expect(paid).toMatchObject({
      status: "paid",
      transactionDate: today(),
      dueDate: addDays(today(), -1),
    });
    const pagos = await listBills(bf({ situacao: "pagos" }));
    const row = pagos.items.find((i) => i.id === assigned);
    expect(row).toMatchObject({
      status: "paid",
      paidOn: today(),
      dueDate: addDays(today(), -1),
    });
    const { count } = await admin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("id", assigned);
    expect(count).toBe(1);

    actAs(fam.owner);
    const history = (await getBill(assigned))?.history ?? [];
    expect(history.some((h) => h.action === "transaction.paid")).toBe(true);
    expect(
      await updateBill({
        transactionId: assigned,
        description: "x",
        amount: "1,00",
        dueDate: today(),
        accountId: checking,
        categoryId: expenseCat,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_STATUS_TRANSITION" },
    });
  });

  it("cancelar: autor/owner; member alheio -> FORBIDDEN; vai para cancelados e sai de abertos", async () => {
    actAs(fam.owner);
    const id = await mk({ description: "A cancelar" });
    actAs(fam.member);
    expect(await cancelBill({ transactionId: id })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    actAs(fam.admin);
    expect(await cancelBill({ transactionId: id })).toMatchObject({ ok: true });
    expect(await cancelBill({ transactionId: id })).toMatchObject({
      ok: false,
      error: { code: "INVALID_STATUS_TRANSITION" },
    });
    const abertos = await listBills(bf());
    expect(abertos.items.some((i) => i.id === id)).toBe(false);
    const cancelados = await listBills(bf({ situacao: "cancelados" }));
    expect(cancelados.items.find((i) => i.id === id)).toMatchObject({
      status: "canceled",
    });
    const history = (await getBill(id))?.history ?? [];
    expect(history.some((h) => h.action === "transaction.canceled")).toBe(true);
  });

  it("updateBill edita pendente; outro member -> FORBIDDEN; inexistente -> NOT_FOUND; outra família não vê", async () => {
    actAs(fam.owner);
    const id = await mk({ description: "Editável" });
    const edit = {
      transactionId: id,
      description: "Editada",
      amount: "99,90",
      dueDate: addDays(today(), 9),
      accountId: checking,
      categoryId: expenseCat,
    };
    actAs(fam.member);
    expect(await updateBill(edit)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    actAs(fam.owner);
    expect(await updateBill(edit)).toMatchObject({ ok: true });
    expect(await getBill(id)).toMatchObject({
      description: "Editada",
      amount: 9990,
      dueDate: addDays(today(), 9),
    });
    expect(
      await updateBill({ ...edit, transactionId: randomUUID() }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    actAs(other.owner);
    expect(await getBill(id)).toBeNull();
    expect(
      await payBill({
        transactionId: id,
        paidOn: today(),
        amount: "1,00",
        accountId: checking,
      }),
    ).toMatchObject({ ok: false });
  });

  it("listBills: filtros, ordenação por vencimento, vencidos e paginação com total", async () => {
    const f = await createTestFamily("bill-lst");
    const acc = await mkAccount(f.owner, "Conta", { openingBalance: "0,00" });
    const exp = await defaultCategoryId(f.owner, "expense", "Alimentação");
    const inc = await defaultCategoryId(f.owner, "income", "Salário");
    actAs(f.owner);
    const base = {
      accountId: acc,
      categoryId: exp,
      amount: "10,00",
    };
    for (let i = 0; i < 25; i++) {
      const r = await createBill(
        newBill({
          ...base,
          description: `Conta ${i}`,
          dueDate: addDays(today(), i - 3),
        }),
      );
      expect(r.ok).toBe(true);
    }
    const rec = await createBill(
      newBill({
        ...base,
        kind: "receber",
        categoryId: inc,
        description: "Recebível",
        dueDate: addDays(today(), 2),
      }),
    );
    expect(rec.ok).toBe(true);

    const p1 = await listBills(bf());
    expect(p1).toMatchObject({
      total: 26,
      page: 1,
      pageSize: 20,
      pageCount: 2,
    });
    const dates = p1.items.map((i) => i.dueDate);
    expect([...dates].sort()).toEqual(dates);
    const p2 = await listBills(bf({ pagina: "2" }));
    expect(p2.items).toHaveLength(6);
    expect((await listBills(bf({ pagina: "9" }))).items).toHaveLength(0);

    const vencidos = await listBills(bf({ situacao: "vencidos" }));
    expect(vencidos.total).toBe(3);
    expect(vencidos.items.every((i) => i.status === "overdue")).toBe(true);
    expect((await listBills(bf({ tipo: "receber" }))).total).toBe(1);
    expect(
      (
        await listBills(
          bf({ de: addDays(today(), 0), ate: addDays(today(), 1) }),
        )
      ).total,
    ).toBe(2);

    const summary = await getBillsSummary();
    expect(summary).toMatchObject({
      payable: 25 * 1000,
      receivable: 1000,
      overduePayable: 3 * 1000,
      overdueCount: 3,
    });
  }, 120_000);

  it("listUpcomingBills: vencidos primeiro, janela de 30 dias, máx. 5; dashboard igual", async () => {
    const f = await createTestFamily("bill-up");
    const acc = await mkAccount(f.owner, "Conta", { openingBalance: "0,00" });
    const exp = await defaultCategoryId(f.owner, "expense", "Alimentação");
    actAs(f.owner);
    const offsets = [-2, 0, 3, 10, 29, 30, 31, 60];
    for (const d of offsets) {
      const r = await createBill(
        newBill({
          accountId: acc,
          categoryId: exp,
          description: `Venc ${d}`,
          dueDate: addDays(today(), d),
        }),
      );
      expect(r.ok).toBe(true);
    }
    const paid = await createBill(
      newBill({
        accountId: acc,
        categoryId: exp,
        description: "Paga",
        dueDate: addDays(today(), -5),
      }),
    );
    if (paid.ok) {
      await payBill({
        transactionId: paid.data.id,
        paidOn: today(),
        amount: "80,00",
        accountId: acc,
      });
    }
    const up = await listUpcomingBills();
    expect(up.map((i) => i.description)).toEqual([
      "Venc -2",
      "Venc 0",
      "Venc 3",
      "Venc 10",
      "Venc 29",
    ]);
    expect((await listUpcomingBills({ limit: 10 })).map((i) => i.days)).toEqual(
      [-2, 0, 3, 10, 29, 30],
    );
    const dash = await getDashboard(dashboardFiltersSchema.parse({}));
    expect(dash.upcomingBills.map((i) => i.id)).toEqual(up.map((i) => i.id));
  }, 120_000);
});
