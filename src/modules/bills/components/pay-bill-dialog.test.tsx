import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";
import { asCents } from "@/lib/money";

const payBill = vi.fn();
const refresh = vi.fn();

vi.mock("@/modules/bills/actions", () => ({
  payBill: (...args: unknown[]) => payBill(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  usePathname: () => "/compromissos",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PayBillDialog } from "./pay-bill-dialog";

const TODAY = "2026-10-23" as ISODate;
const BILL_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

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

function renderDialog(kind: "pagar" | "receber" = "pagar") {
  return render(
    <PayBillDialog
      bill={{
        id: BILL_ID,
        kind,
        amount: asCents(15000),
        account: { id: ACCOUNT_ID, name: "Conta corrente" },
      }}
      accounts={[
        { id: ACCOUNT_ID, name: "Conta corrente" },
        { id: OTHER_ACCOUNT_ID, name: "Poupança" },
      ]}
      today={TODAY}
    />,
  );
}

describe("PayBillDialog", () => {
  it("o rótulo do gatilho depende do tipo", () => {
    renderDialog("receber");
    expect(
      screen.getByRole("button", { name: "Marcar como recebido" }),
    ).toBeInTheDocument();
  });

  it("abre com hoje, o valor previsto e a conta prevista, e explica o efeito no saldo", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Marcar como pago" }));

    expect(await screen.findByLabelText("Valor")).toHaveValue("150,00");
    expect(screen.getByLabelText("Data do pagamento")).toHaveTextContent(
      "Hoje",
    );
    expect(screen.getByLabelText("Conta ou cartão")).toHaveTextContent(
      "Conta corrente",
    );
    expect(
      screen.getByText(
        "O lançamento passa a contar no saldo e nos totais na data do pagamento.",
      ),
    ).toBeInTheDocument();
  });

  it("não deixa escolher data depois de hoje (max = hoje)", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Marcar como pago" }));
    await user.click(await screen.findByLabelText("Data do pagamento"));
    expect(
      await screen.findByRole("button", { name: /24 de outubro de 2026/ }),
    ).toBeDisabled();
  });

  it("confirma com os padrões e fecha; durante o envio o botão fica em loading", async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => {};
    payBill.mockReturnValue(new Promise((r) => (resolve = r)));
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Marcar como pago" }));
    await user.click(
      await screen.findByRole("button", { name: "Confirmar pagamento" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirmar pagamento" }),
      ).toHaveAttribute("aria-busy", "true"),
    );
    expect(
      screen.getByRole("button", { name: "Confirmar pagamento" }),
    ).toBeDisabled();
    expect(payBill).toHaveBeenCalledTimes(1);
    expect(payBill).toHaveBeenCalledWith({
      transactionId: BILL_ID,
      paidOn: TODAY,
      amount: "150,00",
      accountId: ACCOUNT_ID,
    });

    resolve({ ok: true, data: null });
    await waitFor(() =>
      expect(screen.queryByLabelText("Valor")).not.toBeInTheDocument(),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("recusa valor zerado sem chamar a action", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Marcar como pago" }));
    const field = await screen.findByLabelText("Valor");
    await user.clear(field);
    await user.type(field, "0");
    await user.click(
      screen.getByRole("button", { name: "Confirmar pagamento" }),
    );
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
    expect(payBill).not.toHaveBeenCalled();
  });

  it("mostra o erro do servidor com o próximo passo e mantém o diálogo aberto", async () => {
    const user = userEvent.setup();
    payBill.mockResolvedValue({
      ok: false,
      error: {
        code: "INVALID_STATUS_TRANSITION",
        message:
          "Este compromisso já foi pago ou cancelado. Atualize a página para ver a situação atual.",
        requestId: "r",
      },
    });
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Marcar como pago" }));
    await user.click(
      await screen.findByRole("button", { name: "Confirmar pagamento" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Atualize a página",
    );
    expect(screen.getByLabelText("Valor")).toHaveValue("150,00");
  });
});
