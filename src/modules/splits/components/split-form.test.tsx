import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";

const setTransactionSplits = vi.fn();
const refresh = vi.fn();

vi.mock("@/modules/splits/actions", () => ({
  setTransactionSplits: (...args: unknown[]) => setTransactionSplits(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  usePathname: () => "/divisao/x",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import type { SplitDetail } from "@/modules/splits/types";
import { SplitForm } from "./split-form";

const ANA = "11111111-1111-4111-8111-111111111111";
const BIA = "22222222-2222-4222-8222-222222222222";
const EX = "33333333-3333-4333-8333-333333333333";
const TX = "44444444-4444-4444-8444-444444444444";

beforeAll(() => {
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

function detail(overrides: Partial<SplitDetail> = {}): SplitDetail {
  return {
    transaction: {
      id: TX,
      description: "Mercado",
      amount: asCents(10000),
      status: "pending",
      date: "2026-10-20" as ISODate,
      payer: null,
      isPending: true,
    },
    splittable: true,
    parts: [],
    mode: null,
    candidates: [
      { id: ANA, displayName: "Ana", active: true },
      { id: BIA, displayName: "Bianca", active: true },
      { id: EX, displayName: "Ex-integrante", active: false },
    ],
    canEdit: true,
    ...overrides,
  };
}

describe("SplitForm", () => {
  it("mostra a prévia igual com o centavo de empate no primeiro", async () => {
    render(<SplitForm detail={detail()} />);
    // Ana e Bianca vêm marcadas; marca o ex-integrante para ter 3 partes.
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Ex-integrante/ }),
    );
    expect(screen.getByText(/33,34/)).toBeInTheDocument();
    expect(screen.getAllByText(/33,33/)).toHaveLength(2);
    expect(screen.getByText(/saiu da família/)).toBeInTheDocument();
  });

  it("desabilita Salvar com menos de 2 integrantes e explica o motivo", async () => {
    render(<SplitForm detail={detail()} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Bianca" }));
    expect(screen.getByRole("button", { name: "Salvar divisão" })).toBeDisabled();
    expect(screen.getByText(/Escolha de 2 a 20 integrantes/)).toBeInTheDocument();
  });

  it("modo Por valores mostra a diferença e só habilita quando fecha", async () => {
    setTransactionSplits.mockResolvedValue({ ok: true, data: null });
    render(<SplitForm detail={detail()} />);
    await userEvent.click(screen.getByRole("radio", { name: "Por valores" }));

    const ana = screen.getByLabelText("Valor de Ana");
    const bia = screen.getByLabelText("Valor de Bianca");
    await userEvent.clear(ana);
    await userEvent.type(ana, "60");
    await userEvent.clear(bia);
    await userEvent.type(bia, "30");
    expect(screen.getByTestId("split-difference")).toHaveTextContent(/Faltam/);
    expect(screen.getByRole("button", { name: "Salvar divisão" })).toBeDisabled();

    await userEvent.clear(bia);
    await userEvent.type(bia, "50");
    expect(screen.getByTestId("split-difference")).toHaveTextContent(/Passou/);

    await userEvent.clear(bia);
    await userEvent.type(bia, "40");
    expect(screen.getByTestId("split-difference")).toHaveTextContent(
      "Fecha com o valor da despesa",
    );
    const save = screen.getByRole("button", { name: "Salvar divisão" });
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(() => expect(setTransactionSplits).toHaveBeenCalledTimes(1));
    expect(setTransactionSplits).toHaveBeenCalledWith({
      mode: "amounts",
      transactionId: TX,
      shares: [
        { memberId: ANA, amount: "60,00" },
        { memberId: BIA, amount: "40,00" },
      ],
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("envia a divisão igual e mostra o erro do servidor", async () => {
    setTransactionSplits.mockResolvedValue({
      ok: false,
      error: { code: "MEMBER_INACTIVE", message: "Atualize a página.", requestId: "r" },
    });
    render(<SplitForm detail={detail()} />);
    await userEvent.click(screen.getByRole("button", { name: "Salvar divisão" }));
    await waitFor(() =>
      expect(setTransactionSplits).toHaveBeenCalledWith({
        mode: "equal",
        transactionId: TX,
        memberIds: [ANA, BIA],
      }),
    );
    expect(await screen.findByText("Atualize a página.")).toBeInTheDocument();
  });

  it("só oferece Remover divisão quando já existe divisão", () => {
    const { rerender } = render(<SplitForm detail={detail()} />);
    expect(screen.queryByRole("button", { name: "Remover divisão" })).toBeNull();
    rerender(
      <SplitForm
        detail={detail({
          mode: "equal",
          parts: [
            { member: { id: ANA, displayName: "Ana" }, amount: asCents(5000) },
            { member: { id: BIA, displayName: "Bianca" }, amount: asCents(5000) },
          ],
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Remover divisão" })).toBeInTheDocument();
  });
});
