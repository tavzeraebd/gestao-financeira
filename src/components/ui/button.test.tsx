import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

// Regressão: `size="lg"` + `w-11 px-0` deixava `has-data-[icon=inline-start]:pl-4` ativo
// (variante `has-*` não é mesclada com `px-0`), empurrando o ícone para a direita.
describe("Button icon-lg", () => {
  afterEach(cleanup);

  it("botão só com ícone é centrado, sem gap nem padding", () => {
    render(
      <Button size="icon-lg" aria-label="Pagar">
        <svg aria-hidden="true" />
      </Button>,
    );
    const cls = screen.getByRole("button", { name: "Pagar" }).className;
    const tokens = cls.split(/\s+/);
    for (const t of [
      "inline-flex",
      "items-center",
      "justify-center",
      "size-11",
      "p-0",
      "gap-0",
    ]) {
      expect(tokens).toContain(t);
    }
    expect(cls).not.toMatch(/(^|\s)(gap-[1-9]|px-|pl-|pr-)/);
    expect(cls).not.toMatch(/has-data-\[icon=inline-(start|end)\]:p[lr]-/);
  });

  it("loading mantém o botão quadrado e sem padding", () => {
    render(<Button size="icon-lg" aria-label="Pagar" loading />);
    const btn = screen.getByRole("button", { name: "Pagar" });
    expect(btn.className).toContain("size-11");
    expect(btn.className).not.toMatch(/has-data-\[icon=inline-start\]:pl-/);
  });
});
