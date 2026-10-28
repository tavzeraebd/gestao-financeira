import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SecurityActivitySection } from "./security-activity-section";

afterEach(cleanup);

function renderSection(
  events: Parameters<typeof SecurityActivitySection>[0]["events"],
) {
  render(<SecurityActivitySection events={events} />);
  return screen.getByRole("region", { name: "Atividade de segurança" });
}

describe("SecurityActivitySection", () => {
  it("é uma região nomeada com título de nível 2", () => {
    const regiao = renderSection([]);
    expect(
      within(regiao).getByRole("heading", {
        level: 2,
        name: "Atividade de segurança",
      }),
    ).toBeInTheDocument();
  });

  it("estado vazio", () => {
    const regiao = renderSection([]);
    expect(
      within(regiao).getByText("Nenhum evento registrado"),
    ).toBeInTheDocument();
    expect(within(regiao).queryByRole("list")).not.toBeInTheDocument();
  });

  it("lista evento com rótulo em pt-BR e data no fuso de Brasília", () => {
    const regiao = renderSection([
      {
        id: "e1",
        action: "password.changed",
        createdAt: "2026-10-28T15:30:00Z",
      },
    ]);
    expect(within(regiao).getByText("Senha alterada")).toBeInTheDocument();
    const time = regiao.querySelector("time");
    expect(time).toHaveAttribute("dateTime", "2026-10-28T15:30:00Z");
    expect(time?.textContent).toContain("12:30");
  });

  it("estado de erro com aviso e sem lista", () => {
    const regiao = renderSection(null);
    expect(
      within(regiao).getByText(/Não foi possível carregar/),
    ).toBeInTheDocument();
    expect(within(regiao).queryByRole("list")).not.toBeInTheDocument();
  });
});
