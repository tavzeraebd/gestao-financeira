import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import RelatoriosErrorPage from "./error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("error.tsx dos relatórios", () => {
  it("mensagem segura com o próximo passo, só o digest, e tenta de novo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    const error = Object.assign(new Error("rpc account_flows falhou: SELECT"), {
      digest: "xyz789",
    });
    render(<RelatoriosErrorPage error={error} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o relatório",
    );
    expect(screen.getByText("xyz789")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/rpc|SELECT|account_flows/);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
