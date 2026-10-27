import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs, adminClient, type TestUser } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addDays, today } from "@/lib/dates";
import { archiveAccount } from "@/modules/accounts/actions";
import {
  endRecurrence,
  pauseRecurrence,
  resumeRecurrence,
  updateRecurrence,
} from "@/modules/recurrences/actions";
import { ATTENTION_MESSAGES } from "@/modules/recurrences/constants";
import { getRecurrence, listRecurrences } from "@/modules/recurrences/queries";
import { recurrenceFiltersSchema } from "@/modules/recurrences/schemas";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount } from "./helpers/fixtures";

const admin = adminClient();
const filters = (situacao?: string) =>
  recurrenceFiltersSchema.parse(situacao ? { situacao } : {});

async function familyIdOf(user: TestUser): Promise<string> {
  const { data, error } = await admin
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();
  if (error) throw error;
  return data.family_id;
}

async function occurrences(recurrenceId: string) {
  const { data, error } = await admin
    .from("transactions")
    .select("id, amount::text, description, status, transaction_date, notes")
    .eq("recurrence_id", recurrenceId)
    .order("transaction_date", { ascending: true });
  if (error) throw error;
  return data;
}

/** Triggers rodam como invoker: o `service_role` não escreve em `transactions`/`recurrences`. */
async function setNotes(user: TestUser, id: string, notes: string) {
  const { error } = await user.client
    .from("transactions")
    .update({ notes })
    .eq("id", id);
  if (error) throw error;
}

describe("recorrências: materialização, edição de série e permissões", () => {
  let fam: TestFamily;
  let other: TestFamily;
  let famId: string;
  let account: string;
  let account2: string;
  let category: string;

  beforeAll(async () => {
    fam = await createTestFamily("rc");
    other = await createTestFamily("rc-outra");
    famId = await familyIdOf(fam.owner);
    account = await mkAccount(fam.owner, "Corrente", {
      openingBalance: "1.000,00",
    });
    account2 = await mkAccount(fam.owner, "Reserva");
    category = await defaultCategoryId(fam.owner, "expense", "Alimentação");
  });

  /** Série criada pelo próprio usuário, pela RLS (o app cria pelo `createBill`, do outro agente). */
  async function mkSeries(
    user: TestUser,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const row = {
      family_id: famId,
      type: "expense",
      account_id: account,
      category_id: category,
      description: "Aluguel",
      amount: 100,
      frequency: "monthly",
      interval_count: 1,
      start_date: today(),
      idempotency_key: randomUUID(),
      ...over,
    };
    const { data, error } = await user.client
      .from("recurrences")
      .insert(row as never)
      .select("id")
      .single();
    if (error) throw new Error(`insert de série falhou: ${error.message}`);
    return data.id;
  }

  it("materializa ao listar, é idempotente e devolve a visão da série", async () => {
    const id = await mkSeries(fam.owner);
    expect(await occurrences(id)).toHaveLength(0);

    actAs(fam.member); // qualquer integrante dispara a materialização da família
    const first = await listRecurrences(filters());
    const view = first.find((v) => v.id === id);
    expect(view).toMatchObject({
      kind: "pagar",
      state: "active",
      attention: null,
      nextOccurrence: today(),
      canManage: false,
      account: { id: account },
    });
    expect(view?.label).toMatch(/^Todo mês, dia \d+$/);

    // hoje e o mesmo dia do mês seguinte (horizonte = fim do mês seguinte).
    expect(await occurrences(id)).toHaveLength(2);
    await listRecurrences(filters());
    await getRecurrence(id);
    expect(await occurrences(id)).toHaveLength(2);

    actAs(fam.owner);
    expect((await getRecurrence(id))?.canManage).toBe(true);
  });

  it("editar série propaga às ocorrências intocadas e preserva as alteradas", async () => {
    const id = await mkSeries(fam.owner, { description: "Internet" });
    actAs(fam.owner);
    await getRecurrence(id); // materializa
    const [first, second] = await occurrences(id);
    expect(second).toBeDefined();
    await setNotes(fam.owner, second!.id, "negociado");

    const result = await updateRecurrence({
      recurrenceId: id,
      description: "Internet fibra",
      amount: "150,00",
      accountId: account2,
      categoryId: category,
    });
    expect(result).toEqual({ ok: true, data: null });

    const after = await occurrences(id);
    expect(after.find((o) => o.id === first!.id)).toMatchObject({
      description: "Internet fibra",
      amount: "150.00",
    });
    expect(after.find((o) => o.id === second!.id)).toMatchObject({
      description: "Internet",
      amount: "100.00",
    });
  });

  it("pausar remove as intocadas; reativar recria; encerrar corta o futuro", async () => {
    const id = await mkSeries(fam.owner, { description: "Academia" });
    actAs(fam.owner);
    await getRecurrence(id);
    const [, second] = await occurrences(id);
    await setNotes(fam.owner, second!.id, "mantida");

    expect(await pauseRecurrence({ recurrenceId: id })).toEqual({
      ok: true,
      data: null,
    });
    // idempotente
    expect(await pauseRecurrence({ recurrenceId: id })).toMatchObject({
      ok: true,
    });
    expect((await occurrences(id)).map((o) => o.id)).toEqual([second!.id]);
    expect(
      (await listRecurrences(filters("pausadas"))).map((v) => v.id),
    ).toContain(id);
    expect((await listRecurrences(filters())).map((v) => v.id)).not.toContain(
      id,
    );

    expect(await resumeRecurrence({ recurrenceId: id })).toMatchObject({
      ok: true,
    });
    expect(await occurrences(id)).toHaveLength(2);

    // Encerrar hoje: a ocorrência futura intocada deixa de existir; a alterada fica.
    const ended = await endRecurrence({ recurrenceId: id, endDate: today() });
    expect(ended).toMatchObject({ ok: true });
    const rest = await occurrences(id);
    expect(rest.every((o) => o.transaction_date <= today() || o.notes)).toBe(
      true,
    );
    expect((await getRecurrence(id))?.endDate).toBe(today());

    // Antes do início da série: erro no campo, sem estado novo.
    const early = await endRecurrence({
      recurrenceId: id,
      endDate: addDays(today(), -1),
    });
    expect(early).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    if (!early.ok) expect(early.error.fieldErrors?.endDate?.length).toBe(1);
  });

  it("série com término no passado aparece em Encerradas", async () => {
    const id = await mkSeries(fam.owner, {
      description: "Seguro antigo",
      start_date: addDays(today(), -90),
      end_date: addDays(today(), -30),
    });
    actAs(fam.owner);
    const ended = await listRecurrences(filters("encerradas"));
    expect(ended.find((v) => v.id === id)).toMatchObject({ state: "ended" });
    expect((await listRecurrences(filters())).map((v) => v.id)).not.toContain(
      id,
    );
  });

  it("falha de materialização vira atenção com o próximo passo e some ao editar", async () => {
    const broken = await mkAccount(fam.owner, "Conta que sera arquivada");
    const id = await mkSeries(fam.owner, {
      description: "Plano antigo",
      account_id: broken,
    });
    actAs(fam.owner);
    expect(await archiveAccount({ accountId: broken })).toMatchObject({
      ok: true,
    });

    // não lança, mesmo com a RPC registrando a falha da série
    const view = (await listRecurrences(filters())).find((v) => v.id === id);
    expect(view).toMatchObject({
      state: "attention",
      attention: {
        code: "ACCOUNT_ARCHIVED",
        message: ATTENTION_MESSAGES.ACCOUNT_ARCHIVED,
      },
    });

    const fixed = await updateRecurrence({
      recurrenceId: id,
      description: "Plano antigo",
      amount: "100,00",
      accountId: account,
      categoryId: category,
    });
    expect(fixed).toMatchObject({ ok: true });
    expect(await getRecurrence(id)).toMatchObject({
      state: "active",
      attention: null,
    });
    expect((await occurrences(id)).length).toBeGreaterThan(0);
  });

  it("member só gerencia a própria série; outra família não enxerga", async () => {
    const ownerSeries = await mkSeries(fam.owner, { description: "Do dono" });
    const memberSeries = await mkSeries(fam.member, {
      description: "Do membro",
    });

    actAs(fam.member);
    expect(await pauseRecurrence({ recurrenceId: ownerSeries })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(
      await updateRecurrence({
        recurrenceId: ownerSeries,
        description: "x",
        amount: "1,00",
        accountId: account,
        categoryId: category,
      }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await pauseRecurrence({ recurrenceId: memberSeries })).toMatchObject(
      { ok: true },
    );

    actAs(other.owner);
    expect(await getRecurrence(ownerSeries)).toBeNull();
    expect(await getRecurrence("nao-e-uuid")).toBeNull();
    expect(await pauseRecurrence({ recurrenceId: ownerSeries })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await listRecurrences(filters())).toEqual([]);
    expect(await pauseRecurrence({ recurrenceId: "xyz" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("limite de 100 séries ativas na reativação vira RECURRENCE_LIMIT_REACHED", async () => {
    const lim = await createTestFamily("rc-lim");
    const limFam = await familyIdOf(lim.owner);
    const acc = await mkAccount(lim.owner, "Corrente");
    const cat = await defaultCategoryId(lim.owner, "expense", "Alimentação");
    const base = {
      family_id: limFam,
      type: "expense",
      account_id: acc,
      category_id: cat,
      description: "Serie",
      amount: 10,
      frequency: "yearly",
      start_date: today(),
    };
    const { data, error } = await lim.owner.client
      .from("recurrences")
      .insert(Array.from({ length: 100 }, () => ({ ...base })) as never)
      .select("id");
    if (error) throw error;
    actAs(lim.owner);
    expect(await pauseRecurrence({ recurrenceId: data[0]!.id })).toMatchObject({
      ok: true,
    });
    const extra = await lim.owner.client
      .from("recurrences")
      .insert(base as never);
    if (extra.error) throw extra.error;
    expect(await resumeRecurrence({ recurrenceId: data[0]!.id })).toMatchObject(
      { ok: false, error: { code: "RECURRENCE_LIMIT_REACHED" } },
    );
  });
});
