import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NotificationBell, bellLabel } from "./notification-bell";

afterEach(cleanup);

describe("NotificationBell", () => {
  it("monta o nome acessível com o número de não lidas", () => {
    expect(bellLabel(0)).toBe("Notificações");
    expect(bellLabel(1)).toBe("Notificações, 1 não lida");
    expect(bellLabel(3)).toBe("Notificações, 3 não lidas");
  });

  it("aponta para /notificacoes e mostra o selo", () => {
    render(<NotificationBell unread={3} />);
    const link = screen.getByRole("link", {
      name: "Notificações, 3 não lidas",
    });
    expect(link).toHaveAttribute("href", "/notificacoes");
    expect(link).toHaveTextContent("3");
  });

  it("acima de 9 mostra 9+", () => {
    render(<NotificationBell unread={25} />);
    expect(screen.getByRole("link")).toHaveTextContent("9+");
  });

  it("sem não lidas ou sem contagem não mostra selo", () => {
    const { rerender } = render(<NotificationBell unread={0} />);
    expect(
      screen.getByRole("link", { name: "Notificações" }),
    ).toHaveTextContent("");
    rerender(<NotificationBell unread={null} />);
    expect(
      screen.getByRole("link", { name: "Notificações" }),
    ).toHaveTextContent("");
  });
});
