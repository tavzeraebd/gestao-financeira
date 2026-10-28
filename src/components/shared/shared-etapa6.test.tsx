import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { GoalIcon } from "@/components/shared/goal-icon";
import { ValueSourceBadge } from "@/components/shared/value-source-badge";
import { Checkbox } from "@/components/ui/checkbox";

afterEach(cleanup);

describe("GoalIcon", () => {
  it("é decorativo sem label", () => {
    const { container } = render(<GoalIcon icon="plane" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("expõe o label como imagem", () => {
    render(<GoalIcon icon="house" label="Casa própria" size="lg" />);
    expect(
      screen.getByRole("img", { name: "Casa própria" }),
    ).toBeInTheDocument();
  });
});

describe("ValueSourceBadge", () => {
  it.each([
    ["known", "Conhecido"],
    ["informed", "Informado"],
    ["estimated", "Estimado"],
  ] as const)("mostra o texto de %s", (source, text) => {
    render(<ValueSourceBadge source={source} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("Estimado fica em itálico", () => {
    render(<ValueSourceBadge source="estimated" />);
    expect(screen.getByText("Estimado")).toHaveClass("italic");
  });
});

describe("Checkbox", () => {
  it("tem rótulo associado e alterna", async () => {
    render(
      <label>
        <Checkbox />
        Quitar parcela
      </label>,
    );
    const box = screen.getByRole("checkbox", { name: "Quitar parcela" });
    expect(box).toHaveAttribute("aria-checked", "false");
    await userEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "true");
  });

  it("disabled não alterna", async () => {
    render(<Checkbox disabled aria-label="Bloqueado" />);
    const box = screen.getByRole("checkbox", { name: "Bloqueado" });
    await userEvent.click(box);
    expect(box).toHaveAttribute("aria-checked", "false");
  });
});
