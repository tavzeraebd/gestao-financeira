import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { ISODate } from "@/lib/dates";

const createGoal = vi.fn();
const updateGoal = vi.fn();
const push = vi.fn();

vi.mock("@/modules/goals/actions", () => ({
  createGoal: (...args: unknown[]) => createGoal(...args),
  updateGoal: (...args: unknown[]) => updateGoal(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/metas/nova",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GoalForm } from "./goal-form";

const TODAY = "2026-10-23" as ISODate;
const GOAL_ID = "55555555-5555-4555-8555-555555555555";

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

describe("GoalForm", () => {
  it("recusa nome e valor vazios e não envia", async () => {
    const user = userEvent.setup();
    render(<GoalForm mode="create" today={TODAY} />);
    await user.click(screen.getByRole("button", { name: "Salvar meta" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Nome")).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
    expect(screen.getByLabelText("Valor da meta")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(createGoal).not.toHaveBeenCalled();
  });

  it("oferece as 12 opções de ícone e começa em Objetivo", () => {
    render(<GoalForm mode="create" today={TODAY} />);
    const group = screen.getByRole("radiogroup", { name: "Ícone da meta" });
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(12);
    expect(screen.getByRole("radio", { name: "Objetivo" })).toBeChecked();
  });

  it("cria a meta com loading e vai para o detalhe", async () => {
    const user = userEvent.setup();
    let resolve: (value: unknown) => void = () => {};
    createGoal.mockReturnValue(new Promise((r) => (resolve = r)));
    render(
      <GoalForm
        mode="create"
        today={TODAY}
        initial={{ name: "Viagem", targetAmount: "5.000,00" }}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "Viagem" }));
    await user.click(screen.getByRole("button", { name: "Salvar meta" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar meta" }),
      ).toHaveAttribute("aria-busy", "true"),
    );
    expect(createGoal).toHaveBeenCalledTimes(1);
    expect(createGoal.mock.calls[0]?.[0]).toMatchObject({
      name: "Viagem",
      icon: "plane",
      targetAmount: "5.000,00",
      targetDate: undefined,
    });
    expect(typeof createGoal.mock.calls[0]?.[0].idempotencyKey).toBe("string");
    resolve({ ok: true, data: { id: GOAL_ID } });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/metas/${GOAL_ID}`));
  });

  it("falha de rede mostra erro geral e mantém os dados", async () => {
    const user = userEvent.setup();
    createGoal.mockRejectedValue(new TypeError("Failed to fetch"));
    render(
      <GoalForm
        mode="create"
        today={TODAY}
        initial={{ name: "Viagem", targetAmount: "5.000,00" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Salvar meta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Não foi possível/,
    );
    expect(screen.getByLabelText("Nome")).toHaveValue("Viagem");
    expect(push).not.toHaveBeenCalled();
  });

  it("na edição envia o id da meta e volta ao detalhe", async () => {
    const user = userEvent.setup();
    updateGoal.mockResolvedValue({ ok: true, data: null });
    render(
      <GoalForm
        mode="edit"
        goalId={GOAL_ID}
        today={TODAY}
        initial={{ name: "Reserva", targetAmount: "1.000,00", icon: "shield" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Salvar meta" }));
    await waitFor(() => expect(updateGoal).toHaveBeenCalledTimes(1));
    expect(updateGoal.mock.calls[0]?.[0]).toMatchObject({
      goalId: GOAL_ID,
      name: "Reserva",
      icon: "shield",
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/metas/${GOAL_ID}`));
  });
});
