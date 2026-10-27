import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AppErrorPage from "./error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("error.tsx do grupo (CA-E4-61, cobertura parcial)", () => {
  it("mostra mensagem segura e o código (digest), sem a mensagem interna", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    const error = Object.assign(new Error("rpc monthly_cash_flow falhou: SELECT …"), {
      digest: "abc123",
    });
    render(<AppErrorPage error={error} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Algo deu errado");
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/rpc|SELECT|monthly_cash_flow/);
    expect(document.body).not.toHaveTextContent(/R\$/);
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Tentar novamente" }),
    );
    expect(reset).toHaveBeenCalledOnce();
  });
});
