import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProgressMeter } from "@/components/shared/progress-meter";
import { SubNav } from "@/components/shared/sub-nav";
import { Switch } from "@/components/ui/switch";

let pathname = "/transacoes";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

afterEach(() => {
  cleanup();
  pathname = "/transacoes";
});

describe("ProgressMeter", () => {
  it("expõe nome, valor e texto real", () => {
    render(<ProgressMeter value={40} tone="default" label="Mercado" valueText="40% do limite" />);
    const bar = screen.getByRole("progressbar", { name: "Mercado" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuetext", "40% do limite");
  });

  it("limita a barra a 100 mas mantém o texto real (112%)", () => {
    render(<ProgressMeter value={112} tone="danger" label="Mercado" valueText="112% do limite" />);
    const bar = screen.getByRole("progressbar", { name: "Mercado" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "112% do limite");
  });

  it("valor nulo ou negativo vira 0", () => {
    const { rerender } = render(
      <ProgressMeter value={null} tone="default" label="A" valueText="Sem gastos" />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    rerender(<ProgressMeter value={-5} tone="default" label="A" valueText="Sem gastos" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it.each([
    ["default", "bg-primary"],
    ["warning", "bg-warning"],
    ["danger", "bg-danger"],
  ] as const)("tom %s usa o token %s", (tone, token) => {
    render(<ProgressMeter value={50} tone={tone} label="A" valueText="50%" />);
    expect(screen.getByRole("progressbar").className).toContain(
      `[&_[data-slot=progress-indicator]]:${token}`,
    );
  });

  it("indicador sem animação com movimento reduzido", () => {
    const { container } = render(
      <ProgressMeter value={50} tone="default" label="A" valueText="50%" />,
    );
    expect(
      container.querySelector("[data-slot=progress-indicator]")?.className,
    ).toContain("motion-reduce:transition-none");
  });
});

describe("SubNav", () => {
  const items = [
    { href: "/transacoes", label: "Lançamentos" },
    { href: "/compromissos", label: "Compromissos" },
    { href: "/recorrencias", label: "Recorrências" },
  ];

  it("marca só o item ativo com aria-current", () => {
    render(<SubNav items={items} aria-label="Seções de lançamentos" />);
    expect(screen.getByRole("navigation", { name: "Seções de lançamentos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lançamentos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Compromissos" })).not.toHaveAttribute("aria-current");
  });

  it("casa subrotas, mas não prefixos parciais", () => {
    pathname = "/compromissos/abc/editar";
    const { unmount } = render(<SubNav items={items} aria-label="Seções" />);
    expect(screen.getByRole("link", { name: "Compromissos" })).toHaveAttribute("aria-current", "page");
    unmount();
    pathname = "/compromissos-x";
    render(<SubNav items={items} aria-label="Seções" />);
    expect(screen.getByRole("link", { name: "Compromissos" })).not.toHaveAttribute("aria-current");
  });

  it("links têm alvo mínimo de 40px e trilho rola na horizontal", () => {
    render(<SubNav items={items} aria-label="Seções" />);
    expect(screen.getByRole("link", { name: "Recorrências" }).className).toContain("min-h-10");
    expect(screen.getByRole("list").className).toContain("overflow-x-auto");
  });
});

describe("Switch", () => {
  function Demo() {
    const [on, setOn] = useState(false);
    return (
      <label>
        Repetir
        <Switch checked={on} onCheckedChange={setOn} />
      </label>
    );
  }

  it("alterna por clique e teclado, com rótulo associado", async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const sw = screen.getByRole("switch", { name: "Repetir" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    await user.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    await user.keyboard(" ");
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("área de toque ≥ 40px (pseudo-elemento) e disabled", () => {
    render(<Switch disabled aria-label="x" />);
    const sw = screen.getByRole("switch");
    expect(sw.className).toContain("after:-inset-y-3");
    expect(sw).toHaveAttribute("data-disabled");
  });
});
