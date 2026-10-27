import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  actAs,
  adminClient,
  createSignedInUser,
  redirectOf,
  type TestUser,
} from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addDays, today } from "@/lib/dates";
import { asCents } from "@/lib/money";
import {
  archiveAccount,
  createAccount,
  reactivateAccount,
  updateAccount,
} from "@/modules/accounts/actions";
import {
  getAccount,
  getAccountsOverview,
  listAccountOptions,
} from "@/modules/accounts/queries";
import { createTestFamily, type TestFamily } from "./helpers/family";
import {
  defaultCategoryId,
  mkAccount,
  mkTx,
  OPENING_DATE,
} from "./helpers/fixtures";

const admin = adminClient();

describe("contas: permissões, regras e isolamento", () => {
  let fam: TestFamily;
  let other: TestFamily;
  let lone: TestUser;

  beforeAll(async () => {
    fam = await createTestFamily("ct");
    other = await createTestFamily("ct-outra");
    lone = await createSignedInUser("ct-sem-familia");
  });

  it("owner e admin criam; member -> FORBIDDEN", async () => {
    const id = await mkAccount(fam.owner, "Corrente", {
      openingBalance: "1.000,00",
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await mkAccount(fam.admin, "Poupança", { type: "savings" });

    actAs(fam.member);
    const denied = await createAccount({
      name: "Da pessoa",
      type: "cash",
      openingBalance: "0,00",
      openingBalanceDate: OPENING_DATE,
    });
    expect(denied).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("nome repetido entre ativas -> NAME_TAKEN com fieldErrors.name", async () => {
    actAs(fam.owner);
    const result = await createAccount({
      name: "  corrente ",
      type: "cash",
      openingBalance: "0,00",
      openingBalanceDate: OPENING_DATE,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "NAME_TAKEN" },
    });
    if (!result.ok) expect(result.error.fieldErrors?.name?.length).toBe(1);
  });

  it("cartão: dívida informada positiva é gravada negativa; sem dias de fechamento -> VALIDATION_ERROR", async () => {
    actAs(fam.owner);
    const invalid = await createAccount({
      name: "Cartão X",
      type: "credit_card",
      openingBalance: "300,00",
      openingBalanceDate: OPENING_DATE,
    });
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });

    const id = await mkAccount(fam.owner, "Cartão X", {
      type: "credit_card",
      openingBalance: "300,00",
      creditLimit: "2.000,00",
      statementClosingDay: 10,
      statementDueDay: 20,
    });
    const { data } = await admin
      .from("accounts")
      .select("opening_balance::text")
      .eq("id", id)
      .single();
    expect(data?.opening_balance).toBe("-300.00");

    actAs(fam.member);
    const view = await getAccount(id);
    expect(view).toMatchObject({
      balance: asCents(-30000),
      availableCredit: asCents(170000),
      creditLimit: asCents(200000),
    });
  });

  it("getAccountsOverview: consolidado (sem cartões) e faturas em aberto", async () => {
    actAs(fam.member);
    const overview = await getAccountsOverview();
    expect(overview.accounts).toHaveLength(3);
    expect(overview.consolidatedBalance).toBe(asCents(100000));
    expect(overview.openCardDebt).toBe(asCents(30000));
  });

  it("updateAccount: owner edita; member -> FORBIDDEN; outra família -> NOT_FOUND", async () => {
    const id = await mkAccount(fam.owner, "Para editar");
    const input = {
      accountId: id,
      name: "Editada",
      openingBalance: "50,00",
      openingBalanceDate: OPENING_DATE,
    };
    actAs(fam.admin);
    expect(await updateAccount(input)).toMatchObject({ ok: true });
    expect((await getAccount(id))?.openingBalance).toBe(asCents(5000));

    actAs(fam.member);
    expect(await updateAccount(input)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });

    actAs(other.owner);
    expect(await updateAccount(input)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("updateAccount: nome já usado -> NAME_TAKEN; data do saldo depois de lançamento -> OPENING_DATE_AFTER_TRANSACTIONS", async () => {
    const id = await mkAccount(fam.owner, "Com lançamento");
    const category = await defaultCategoryId(fam.owner, "expense", "Outros");
    await mkTx(fam.owner, {
      amount: "10,00",
      transactionDate: addDays(today(), -1),
      accountId: id,
      categoryId: category,
    });
    actAs(fam.owner);
    const base = {
      accountId: id,
      name: "Com lançamento",
      openingBalance: "0,00",
    };
    expect(
      await updateAccount({ ...base, openingBalanceDate: today() }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "OPENING_DATE_AFTER_TRANSACTIONS",
        fieldErrors: { openingBalanceDate: expect.any(Array) },
      },
    });
    expect(
      await updateAccount({
        ...base,
        name: "Corrente",
        openingBalanceDate: OPENING_DATE,
      }),
    ).toMatchObject({ ok: false, error: { code: "NAME_TAKEN" } });
  });

  it("arquivar é idempotente, sai das opções ativas e mantém o saldo; reativar com nome usado -> NAME_TAKEN", async () => {
    const id = await mkAccount(fam.owner, "Antiga", {
      openingBalance: "10,00",
    });
    actAs(fam.owner);
    expect(await archiveAccount({ accountId: id })).toMatchObject({ ok: true });
    expect(await archiveAccount({ accountId: id })).toMatchObject({ ok: true });
    expect((await getAccount(id))?.isActive).toBe(false);
    const options = await listAccountOptions();
    expect(options.find((o) => o.id === id)).toMatchObject({ isActive: false });

    await mkAccount(fam.owner, "Antiga");
    expect(await reactivateAccount({ accountId: id })).toMatchObject({
      ok: false,
      error: { code: "NAME_TAKEN" },
    });

    actAs(fam.member);
    expect(await archiveAccount({ accountId: id })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("isolamento: outra família não lê as contas; sem família não acessa", async () => {
    const id = await mkAccount(fam.owner, "Só da família A");
    actAs(other.member);
    expect(await getAccount(id)).toBeNull();
    expect((await listAccountOptions()).some((o) => o.id === id)).toBe(false);
    expect(
      (await getAccountsOverview()).accounts.some((a) => a.id === id),
    ).toBe(false);

    actAs(other.owner);
    expect(await archiveAccount({ accountId: id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });

    actAs(lone);
    // Sem família o guard redireciona ao onboarding.
    expect(await redirectOf(archiveAccount({ accountId: id }))).toBe(
      "/onboarding",
    );
  });
});
