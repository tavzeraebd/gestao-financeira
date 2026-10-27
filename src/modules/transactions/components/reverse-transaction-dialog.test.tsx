import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";

const reverseTransaction = vi.fn();
const refresh = vi.fn();

vi.mock("@/modules/transactions/actions", () => ({
  reverseTransaction: (...args: unknown[]) => reverseTransaction(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  usePathname: () => "/transacoes/x",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ReverseTransactionDialog } from "./reverse-transaction-dialog";

const TODAY = "2026-10-23" as ISODate;
const ID = "11111111-1111-4111-8111-111111111111";

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function dialog(reversible: number) {
  return (
    <ReverseTransactionDialog
      transactionId={ID}
      reversibleAmount={asCents(reversible)}
      originalDate={"2026-10-01" as ISODate}
      today={TODAY}
    />
  );
}

describe("ReverseTransactionDialog", () => {
  it("dois estornos parciais seguidos usam chaves diferentes e o restante", async () => {
    const user = userEvent.setup();
    reverseTransaction.mockResolvedValue({ ok: true, data: { id: "r" } });
    const { rerender } = render(dialog(20000));

    await user.click(screen.getByRole("button", { name: "Estornar" }));
    const field = await screen.findByLabelText("Valor a estornar");
    expect(field).toHaveValue("200,00");
    await user.clear(field);
    await user.type(field, "50");
    await user.click(screen.getByRole("button", { name: "Registrar estorno" }));
    await waitFor(() => expect(reverseTransaction).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Valor a estornar"),
      ).not.toBeInTheDocument(),
    );

    // A página recarrega com o restante estornável (200 - 50).
    rerender(dialog(15000));
    await user.click(screen.getByRole("button", { name: "Estornar" }));
    const second = await screen.findByLabelText("Valor a estornar");
    expect(second).toHaveValue("150,00");
    await user.clear(second);
    await user.type(second, "30");
    await user.click(screen.getByRole("button", { name: "Registrar estorno" }));
    await waitFor(() => expect(reverseTransaction).toHaveBeenCalledTimes(2));

    const sent = reverseTransaction.mock.calls.map(
      (call) => call[0] as { idempotencyKey: string; amount: string },
    );
    expect(sent.map((input) => input.amount)).toEqual(["50,00", "30,00"]);
    expect(sent[0]?.idempotencyKey).toBeTruthy();
    expect(sent[0]?.idempotencyKey).not.toBe(sent[1]?.idempotencyKey);
  });
});
