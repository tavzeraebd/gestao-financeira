import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const openNotification = vi.fn();
const push = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();

vi.mock("@/modules/notifications/actions", () => ({
  openNotification: (...args: unknown[]) => openNotification(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/notificacoes",
}));
vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import type { NotificationView } from "@/modules/notifications/types";

import { NotificationList } from "./notification-list";

const ID_1 = "0d9f8f0e-5a2b-4a56-9f5c-6c2f0a6b7a11";
const ID_2 = "7a1d3a9c-1d3c-4a52-8d8b-0a7f4c9d2e22";

const ITEMS: NotificationView[] = [
  {
    id: ID_1,
    type: "bill_due_soon",
    title: "Conta a vencer",
    message: "Aluguel vence em 3 dias · R$ 1.200,00",
    icon: "bill",
    createdAt: "2026-10-25T15:00:00.000Z",
    read: false,
    hasLink: true,
  },
  {
    id: ID_2,
    type: "goal_near_target",
    title: "Meta próxima",
    message: "Sua meta Reserva atingiu 80%",
    icon: "goal",
    createdAt: "2026-10-24T15:00:00.000Z",
    read: true,
    hasLink: true,
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NotificationList", () => {
  it("anuncia a não lida em texto, sem depender de cor", () => {
    render(<NotificationList items={ITEMS} />);
    const unread = screen.getByRole("button", { name: /Conta a vencer/ });
    expect(unread).toHaveTextContent("Não lida");
    const read = screen.getByRole("button", { name: /Meta próxima/ });
    expect(read).not.toHaveTextContent("Não lida");
    expect(screen.getByText("25/10")).toBeInTheDocument();
  });

  it("clicar abre a notificação e navega para o href", async () => {
    openNotification.mockResolvedValue({
      ok: true,
      data: { href: "/compromissos/abc" },
    });
    const user = userEvent.setup();
    render(<NotificationList items={ITEMS} />);
    await user.click(screen.getByRole("button", { name: /Conta a vencer/ }));
    await waitFor(() =>
      expect(openNotification).toHaveBeenCalledWith({ notificationId: ID_1 }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/compromissos/abc"));
  });

  it("sem href: avisa que o item não está mais disponível e não navega", async () => {
    openNotification.mockResolvedValue({ ok: true, data: { href: null } });
    const user = userEvent.setup();
    render(<NotificationList items={ITEMS} />);
    await user.click(screen.getByRole("button", { name: /Conta a vencer/ }));
    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith("Este item não está mais disponível."),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("falha mostra a mensagem do servidor e não navega", async () => {
    openNotification.mockResolvedValue({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Tente de novo.", requestId: "r" },
    });
    const user = userEvent.setup();
    render(<NotificationList items={ITEMS} />);
    await user.click(screen.getByRole("button", { name: /Conta a vencer/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Tente de novo."));
    expect(push).not.toHaveBeenCalled();
  });
});
