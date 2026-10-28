import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";

const addContribution = vi.fn();
const refresh = vi.fn();

vi.mock("@/modules/goals/actions", () => ({
  addContribution: (...args: unknown[]) => addContribution(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  usePathname: () => "/metas/x",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContributionDialog } from "./contribution-dialog";

const TODAY = "2026-10-23" as ISODate;
const GOAL_ID = "55555555-5555-4555-8555-555555555555";
const MEMBERS = [
  { id: "66666666-6666-4666-8666-666666666666", displayName: "Ana" },
  { id: "77777777-7777-4777-8777-777777777777", displayName: "Bruno" },
];

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

function renderDialog(opts: {
  kind?: "deposit" | "withdrawal";
  canChooseMember?: boolean;
}) {
  return render(
    <ContributionDialog
      goalId={GOAL_ID}
      kind={opts.kind ?? "deposit"}
      today={TODAY}
      members={MEMBERS}
      canChooseMember={opts.canChooseMember ?? false}
    />,
  );
}

describe("ContributionDialog", () => {
  it("member: integrante fixo nele mesmo, sem escolha", async () => {
    const user = userEvent.setup();
    renderDialog({});
    await user.click(screen.getByRole("button", { name: "Registrar aporte" }));
    const field = await screen.findByLabelText("Integrante");
    expect(field).toBeDisabled();
    expect(field).toHaveValue("Você");
    expect(screen.queryByRole("combobox", { name: "Integrante" })).toBeNull();
  });

  it("owner/admin: escolhe o integrante", async () => {
    const user = userEvent.setup();
    renderDialog({ canChooseMember: true });
    await user.click(screen.getByRole("button", { name: "Registrar aporte" }));
    expect(await screen.findByLabelText("Integrante")).toHaveTextContent(
      "Você",
    );
  });

  it("começa em hoje e não deixa escolher data futura (max = hoje)", async () => {
    const user = userEvent.setup();
    renderDialog({});
    await user.click(screen.getByRole("button", { name: "Registrar aporte" }));
    const date = await screen.findByLabelText("Data");
    expect(date).toHaveTextContent("Hoje");
    await user.click(date);
    expect(
      await screen.findByRole("button", { name: /24 de outubro de 2026/ }),
    ).toBeDisabled();
  });

  it("recusa valor vazio e não envia", async () => {
    const user = userEvent.setup();
    renderDialog({});
    await user.click(screen.getByRole("button", { name: "Registrar aporte" }));
    await user.click(
      await screen.findByRole("button", { name: "Salvar aporte" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Valor")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(addContribution).not.toHaveBeenCalled();
  });

  it("salva o aporte com loading, sem memberId para member, e atualiza a página", async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => {};
    addContribution.mockReturnValue(new Promise((r) => (resolve = r)));
    renderDialog({});
    await user.click(screen.getByRole("button", { name: "Registrar aporte" }));
    await user.type(await screen.findByLabelText("Valor"), "100");
    await user.click(screen.getByRole("button", { name: "Salvar aporte" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar aporte" }),
      ).toHaveAttribute("aria-busy", "true"),
    );
    const payload = addContribution.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      goalId: GOAL_ID,
      kind: "deposit",
      contributionDate: TODAY,
      memberId: undefined,
    });
    expect(typeof payload.idempotencyKey).toBe("string");
    resolve({ ok: true, data: { id: "x" } });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByLabelText("Valor")).not.toBeInTheDocument(),
    );
  });

  it("retirada usa o texto de retirada e envia kind withdrawal", async () => {
    const user = userEvent.setup();
    addContribution.mockResolvedValue({ ok: true, data: { id: "x" } });
    renderDialog({ kind: "withdrawal" });
    await user.click(
      screen.getByRole("button", { name: "Registrar retirada" }),
    );
    await user.type(await screen.findByLabelText("Valor"), "50");
    await user.click(screen.getByRole("button", { name: "Salvar retirada" }));
    await waitFor(() => expect(addContribution).toHaveBeenCalledTimes(1));
    expect(addContribution.mock.calls[0]?.[0]).toMatchObject({
      kind: "withdrawal",
    });
  });

  it("GOAL_NEGATIVE_PROGRESS aparece no campo valor e mantém os dados", async () => {
    const user = userEvent.setup();
    addContribution.mockResolvedValue({
      ok: false,
      error: {
        code: "GOAL_NEGATIVE_PROGRESS",
        message:
          "O valor guardado não pode ficar negativo. Confira o valor da retirada.",
        fieldErrors: {
          amount: [
            "O valor guardado não pode ficar negativo. Confira o valor da retirada.",
          ],
        },
        requestId: "r",
      },
    });
    renderDialog({ kind: "withdrawal" });
    await user.click(
      screen.getByRole("button", { name: "Registrar retirada" }),
    );
    await user.type(await screen.findByLabelText("Valor"), "900");
    await user.click(screen.getByRole("button", { name: "Salvar retirada" }));
    expect(
      await screen.findByText(/O valor guardado não pode ficar negativo/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Valor")).toHaveValue("900,00");
  });

  it("INVALID_STATUS_TRANSITION usa mensagem de meta, não de compromisso", async () => {
    const user = userEvent.setup();
    addContribution.mockResolvedValue({
      ok: false,
      error: {
        code: "INVALID_STATUS_TRANSITION",
        message: "Este compromisso já foi pago ou cancelado.",
        requestId: "r",
      },
    });
    renderDialog({});
    await user.click(screen.getByRole("button", { name: "Registrar aporte" }));
    await user.type(await screen.findByLabelText("Valor"), "10");
    await user.click(screen.getByRole("button", { name: "Salvar aporte" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/situação desta meta mudou/);
    expect(alert).not.toHaveTextContent(/compromisso/i);
  });
});
