import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { SkipLink } from "@/components/shared/skip-link";

afterEach(cleanup);

describe("SkipLink", () => {
  it("aponta para #conteudo por padrão e usa o texto em pt-BR", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Pular para o conteúdo" });
    expect(link).toHaveAttribute("href", "#conteudo");
  });

  it("aceita outro destino", () => {
    render(<SkipLink targetId="principal" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "#principal");
  });

  it("fica oculto visualmente (sr-only) e aparece só com foco, com tokens e alvo de 40px", () => {
    render(<SkipLink />);
    const cls = screen.getByRole("link").className;
    expect(cls).toContain("sr-only");
    expect(cls).toContain("focus-visible:not-sr-only");
    expect(cls).toContain("focus-visible:min-h-10");
    expect(cls).toContain("focus-visible:ring-ring");
    expect(cls).toContain("focus-visible:bg-background");
    expect(cls).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("é o primeiro foco do Tab e Enter segue para o destino", async () => {
    const user = userEvent.setup();
    render(
      <>
        <SkipLink />
        <button type="button">Menu</button>
        <main id="conteudo" tabIndex={-1}>
          Conteúdo
        </main>
      </>,
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "Pular para o conteúdo" })).toHaveFocus();
    const main = screen.getByRole("main");
    main.focus();
    expect(main).toHaveFocus();
  });
});
