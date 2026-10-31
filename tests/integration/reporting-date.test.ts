import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { actAs } from "./helpers/session";

vi.mock("@/lib/supabase/server", async () => {
  const { getActiveClient } = await import("./helpers/session");
  return { createClient: async () => getActiveClient() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { reverseTransaction } from "@/modules/transactions/actions";
import { listTransactions } from "@/modules/transactions/queries";
import { transactionFiltersSchema } from "@/modules/transactions/schemas";
import { createTestFamily, type TestFamily } from "./helpers/family";
import { defaultCategoryId, mkAccount, mkTx } from "./helpers/fixtures";

const filters = (raw: Record<string, string>) =>
  transactionFiltersSchema.parse(raw);

// R24 (docs/financial-definitions.md v1.5, ADR-0041): o filtro de período vale sobre a data de apuração.
describe("Transações: filtro de período sobre reporting_date (R24)", () => {
  let fam: TestFamily;

  beforeAll(async () => {
    fam = await createTestFamily("r24");
    const card = await mkAccount(fam.owner, "Cartão R24", {
      type: "credit_card",
      creditLimit: "5.000,00",
      statementClosingDay: 11,
      statementDueDay: 16,
      openingBalanceDate: "2026-09-01",
    });
    const checking = await mkAccount(fam.owner, "Corrente R24", {
      openingBalance: "1.000,00",
      openingBalanceDate: "2026-09-01",
    });
    const category = await defaultCategoryId(fam.owner, "expense", "Outros");
    const buy = (
      description: string,
      amount: string,
      date: string,
      acc = card,
    ) =>
      mkTx(fam.owner, {
        description,
        amount,
        transactionDate: date,
        accountId: acc,
        categoryId: category,
      });

    await buy("c-10-09", "50,00", "2026-09-10");
    await buy("c-11-09", "80,00", "2026-09-11");
    const c1010 = await buy("c-10-10", "40,00", "2026-10-10");
    await buy("c-11-10", "10,00", "2026-10-11");
    await buy("cc-11-10", "100,00", "2026-10-11", checking);
    actAs(fam.owner);
    const r = await reverseTransaction({
      transactionId: c1010,
      amount: "15,00",
      transactionDate: "2026-10-20",
      idempotencyKey: randomUUID(),
    });
    expect(r.ok).toBe(true);
  });

  const names = async (raw: Record<string, string>) => {
    actAs(fam.owner);
    const page = await listTransactions(filters(raw));
    return page.items.map((i) => i.description).sort();
  };

  it("outubro lista 11/09 e 10/10 (cartão) e 11/10 (corrente); não a 11/10 do cartão nem o estorno", async () => {
    expect(await names({ de: "2026-10-01", ate: "2026-10-31" })).toEqual([
      "c-10-10",
      "c-11-09",
      "cc-11-10",
    ]);
  });

  it("devolve reportingDate (fatura) distinta da data real, e igual nas demais contas", async () => {
    actAs(fam.owner);
    const page = await listTransactions(
      filters({ de: "2026-10-01", ate: "2026-10-31" }),
    );
    const by = new Map(page.items.map((i) => [i.description, i]));
    expect(by.get("c-11-09")).toMatchObject({
      transactionDate: "2026-09-11",
      reportingDate: "2026-10-16",
    });
    expect(by.get("cc-11-10")).toMatchObject({
      transactionDate: "2026-10-11",
      reportingDate: "2026-10-11",
    });
  });

  it("setembro lista só 10/09; novembro lista 11/10 do cartão e o estorno de 20/10", async () => {
    expect(await names({ de: "2026-09-01", ate: "2026-09-30" })).toEqual([
      "c-10-09",
    ]);
    const nov = await names({ de: "2026-11-01", ate: "2026-11-30" });
    expect(nov).toContain("c-11-10");
    expect(nov).toHaveLength(2);
  });

  it("só `de` e só `ate` também usam a data de apuração", async () => {
    expect(await names({ de: "2026-10-17" })).toEqual(
      expect.arrayContaining(["c-11-10"]),
    );
    expect(await names({ de: "2026-10-17" })).not.toContain("c-11-09");
    expect(await names({ ate: "2026-09-30" })).toEqual(["c-10-09"]);
  });
});
