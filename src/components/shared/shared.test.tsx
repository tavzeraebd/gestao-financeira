import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PasswordInput } from "@/components/shared/password-input";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Button } from "@/components/ui/button";

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("Button loading", () => {
  it("fica disabled e aria-busy, mantendo o texto", () => {
    render(<Button loading>Salvar</Button>);
    const btn = screen.getByRole("button", { name: /salvar/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("não é aria-busy quando não está carregando", () => {
    render(<Button>Salvar</Button>);
    const btn = screen.getByRole("button", { name: "Salvar" });
    expect(btn).toBeEnabled();
    expect(btn).not.toHaveAttribute("aria-busy");
  });
});

describe("PasswordInput", () => {
  it("alterna type e aria-pressed", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Senha" />);
    const input = screen.getByLabelText("Senha");
    expect(input).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: "Mostrar senha" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);

    expect(input).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Ocultar senha" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    await user.click(hide);
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("ThemeToggle", () => {
  it("aplica e remove a classe dark e grava nucleo-theme", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    const trigger = screen.getByRole("button", { name: "Alterar tema" });

    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Escuro" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("nucleo-theme")).toBe("dark");

    await user.click(trigger);
    await user.click(await screen.findByRole("menuitem", { name: "Claro" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(localStorage.getItem("nucleo-theme")).toBe("light");
  });
});

describe("EmptyState", () => {
  it("renderiza título, descrição e ação", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Nada por aqui"
        description="Crie o primeiro item."
        action={<button type="button">Criar</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Nada por aqui" }),
    ).toBeVisible();
    expect(screen.getByText("Crie o primeiro item.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Criar" })).toBeVisible();
  });
});
