import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs, adminClient } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  archiveCategory,
  createCategory,
  deleteCategory,
  unarchiveCategory,
  updateCategory,
} from "@/modules/categories/actions";
import {
  listCategories,
  listCategoryOptions,
} from "@/modules/categories/queries";
import { addDays, today } from "@/lib/dates";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount, mkTx } from "./helpers/fixtures";

const admin = adminClient();
const base = { color: "chart-1", icon: "wallet" } as const;

async function mk(
  fam: TestFamily["owner"],
  input: { name: string; type?: "income" | "expense"; parentId?: string },
): Promise<string> {
  actAs(fam);
  const result = await createCategory({ type: "expense", ...base, ...input });
  if (!result.ok)
    throw new Error(`createCategory falhou: ${result.error.code}`);
  return result.data.id;
}

describe("categorias: seed, permissões, hierarquia e exclusão", () => {
  let fam: TestFamily;
  let other: TestFamily;

  beforeAll(async () => {
    fam = await createTestFamily("cat");
    other = await createTestFamily("cat-outra");
  });

  it("a família nasce com as 16 categorias padrão (10 despesas, 6 receitas)", async () => {
    actAs(fam.member);
    const all = await listCategories();
    expect(all).toHaveLength(16);
    expect(all.filter((c) => c.type === "expense")).toHaveLength(10);
    expect(all.every((c) => c.isDefault && c.archivedAt === null)).toBe(true);
  });

  it("member não gerencia; owner e admin criam", async () => {
    actAs(fam.member);
    expect(
      await createCategory({ name: "Pets", type: "expense", ...base }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });

    await mk(fam.owner, { name: "Pets" });
    await mk(fam.admin, { name: "Renda de aluguel", type: "income" });
  });

  it("nome repetido no mesmo nível e tipo -> NAME_TAKEN com fieldErrors.name", async () => {
    actAs(fam.owner);
    const result = await createCategory({
      name: " pets ",
      type: "expense",
      ...base,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "NAME_TAKEN" } });
    if (!result.ok) expect(result.error.fieldErrors?.name?.length).toBe(1);
  });

  it("subcategoria: filhas seguem o pai nas opções; neto -> INVALID_CATEGORY_PARENT", async () => {
    const parent = await mk(fam.owner, { name: "Viagens" });
    const child = await mk(fam.owner, { name: "Hotel", parentId: parent });
    actAs(fam.owner);
    expect(
      await createCategory({
        name: "Quarto",
        type: "expense",
        ...base,
        parentId: child,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_CATEGORY_PARENT" },
    });

    actAs(fam.member);
    const options = await listCategoryOptions("expense");
    const names = options.map((o) => o.name);
    expect(names.indexOf("Hotel")).toBe(names.indexOf("Viagens") + 1);
    expect(options.find((o) => o.id === child)?.parentId).toBe(parent);
  });

  it("arquivar com filhas ativas -> CATEGORY_HAS_CHILDREN; arquivar é idempotente e some das opções", async () => {
    const parent = await mk(fam.owner, { name: "Casa de praia" });
    const child = await mk(fam.owner, { name: "Reforma", parentId: parent });
    actAs(fam.owner);
    expect(await archiveCategory({ categoryId: parent })).toMatchObject({
      ok: false,
      error: { code: "CATEGORY_HAS_CHILDREN" },
    });

    expect(await archiveCategory({ categoryId: child })).toMatchObject({
      ok: true,
    });
    expect(await archiveCategory({ categoryId: child })).toMatchObject({
      ok: true,
    });
    expect(
      (await listCategoryOptions("expense")).some((o) => o.id === child),
    ).toBe(false);
    expect(
      (await listCategories({ includeArchived: true })).find(
        (c) => c.id === child,
      )?.archivedAt,
    ).not.toBeNull();

    expect(await unarchiveCategory({ categoryId: child })).toMatchObject({
      ok: true,
    });
    actAs(fam.member);
    expect(await unarchiveCategory({ categoryId: child })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("updateCategory: edita; member -> FORBIDDEN; outra família -> NOT_FOUND", async () => {
    const id = await mk(fam.owner, { name: "Para renomear" });
    const input = {
      categoryId: id,
      name: "Renomeada",
      color: "chart-4",
      icon: "gift",
      parentId: null,
    } as const;
    actAs(fam.admin);
    expect(await updateCategory(input)).toMatchObject({ ok: true });
    expect((await listCategories()).find((c) => c.id === id)).toMatchObject({
      name: "Renomeada",
      color: "chart-4",
      icon: "gift",
    });

    actAs(fam.member);
    expect(await updateCategory(input)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    actAs(other.owner);
    expect(await updateCategory(input)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("excluir: sem uso apaga; com lançamento (mesmo excluído) -> CATEGORY_IN_USE; member -> FORBIDDEN", async () => {
    const unused = await mk(fam.owner, { name: "Sem uso" });
    actAs(fam.member);
    expect(await deleteCategory({ categoryId: unused })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    actAs(fam.owner);
    expect(await deleteCategory({ categoryId: unused })).toMatchObject({
      ok: true,
    });
    expect(await deleteCategory({ categoryId: unused })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });

    const used = await mk(fam.owner, { name: "Em uso" });
    const account = await mkAccount(fam.owner, "Conta das categorias");
    await mkTx(fam.owner, {
      amount: "5,00",
      transactionDate: addDays(today(), -1),
      accountId: account,
      categoryId: used,
    });
    actAs(fam.owner);
    expect(await deleteCategory({ categoryId: used })).toMatchObject({
      ok: false,
      error: { code: "CATEGORY_IN_USE" },
    });

    const parent = await mk(fam.owner, { name: "Pai em uso" });
    await mk(fam.owner, { name: "Filha", parentId: parent });
    actAs(fam.owner);
    expect(await deleteCategory({ categoryId: parent })).toMatchObject({
      ok: false,
      error: { code: "CATEGORY_IN_USE" },
    });
  });

  it("isolamento: outra família não vê nem usa as categorias", async () => {
    const id = await defaultCategoryId(fam.owner, "expense", "Moradia");
    actAs(other.member);
    expect((await listCategories()).some((c) => c.id === id)).toBe(false);
    actAs(other.owner);
    expect(await archiveCategory({ categoryId: id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    const { count } = await admin
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("id", id)
      .is("archived_at", null);
    expect(count).toBe(1);
  });
});
