import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs, getActiveClient } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient: active } = await import("./helpers/session");
  return { createClient: async () => active() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addDays, today } from "@/lib/dates";
import { asCents } from "@/lib/money";
import { selectCardPurchases } from "@/modules/reports/repository";
import { reverseTransaction } from "@/modules/transactions/actions";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount, mkTx } from "./helpers/fixtures";

describe("selectCardPurchases: compras líquidas de estornos (D24)", () => {
  let fam: TestFamily;
  let card: string;
  let category: string;

  beforeAll(async () => {
    fam = await createTestFamily("cp");
    card = await mkAccount(fam.owner, "Cartão compras", {
      type: "credit_card",
      creditLimit: "5.000,00",
      statementClosingDay: 10,
      statementDueDay: 20,
    });
    category = await defaultCategoryId(fam.owner, "expense", "Outros");
  });

  const estornar = async (id: string, amount: string, date = today()) => {
    actAs(fam.owner);
    const r = await reverseTransaction({
      transactionId: id,
      amount,
      transactionDate: date,
      idempotencyKey: randomUUID(),
    });
    expect(r.ok).toBe(true);
  };

  it("parcialmente estornada volta com o líquido; totalmente estornada sai; sem estorno fica inteira", async () => {
    const parcial = await mkTx(fam.owner, {
      amount: "100,00",
      transactionDate: addDays(today(), -3),
      accountId: card,
      categoryId: category,
      description: "Parcial",
    });
    const total = await mkTx(fam.owner, {
      amount: "80,00",
      transactionDate: addDays(today(), -2),
      accountId: card,
      categoryId: category,
      description: "Total",
    });
    await mkTx(fam.owner, {
      amount: "30,00",
      transactionDate: addDays(today(), -1),
      accountId: card,
      categoryId: category,
      description: "Intacta",
    });
    await estornar(parcial, "40,00");
    await estornar(total, "50,00");
    await estornar(total, "30,00");

    actAs(fam.owner);
    const list = await selectCardPurchases(getActiveClient(), [card], today());
    expect(list.map((p) => [p.description, p.amount])).toEqual([
      ["Intacta", asCents(3000)],
      ["Parcial", asCents(6000)],
    ]);
  });

  it("estorno posterior a `upTo` ainda não conta; sem cartões devolve lista vazia", async () => {
    const compra = await mkTx(fam.owner, {
      amount: "20,00",
      transactionDate: addDays(today(), -5),
      accountId: card,
      categoryId: category,
      description: "Estorno depois",
    });
    await estornar(compra, "20,00", today());
    actAs(fam.owner);
    const ontem = await selectCardPurchases(
      getActiveClient(),
      [card],
      addDays(today(), -1),
    );
    expect(ontem.find((p) => p.description === "Estorno depois")?.amount).toBe(
      asCents(2000),
    );
    expect(await selectCardPurchases(getActiveClient(), [], today())).toEqual(
      [],
    );
  });
});
