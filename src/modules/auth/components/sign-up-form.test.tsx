import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();

vi.mock("@/modules/auth/actions", () => ({
  signUp: (...args: unknown[]) => signUp(...args),
  resendConfirmation: vi.fn(),
}));

import { SignUpForm } from "./sign-up-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SignUpForm", () => {
  it("valida nome, e-mail e a regra da senha", async () => {
    const user = userEvent.setup();
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Senha", { exact: true }), "curta");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByText("Informe seu nome.")).toBeInTheDocument();
    expect(screen.getByText("Informe um e-mail válido.")).toBeInTheDocument();
    expect(
      screen.getByText("A senha deve ter ao menos 8 caracteres."),
    ).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("mostra a tela de confirmação de e-mail após o sucesso", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({ ok: true, data: { email: "ana@exemplo.com" } });
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Nome"), "Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@exemplo.com");
    await user.type(
      screen.getByLabelText("Senha", { exact: true }),
      "segredo123",
    );
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(
      await screen.findByRole("heading", { name: "Confirme seu e-mail" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ana@exemplo.com")).toBeInTheDocument();
  });

  it("mostra erro geral do servidor e mantém os dados", async () => {
    const user = userEvent.setup();
    signUp.mockResolvedValue({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Muitas tentativas.",
        requestId: "r",
      },
    });
    render(<SignUpForm />);
    await user.type(screen.getByLabelText("Nome"), "Ana");
    await user.type(screen.getByLabelText("E-mail"), "ana@exemplo.com");
    await user.type(
      screen.getByLabelText("Senha", { exact: true }),
      "segredo123",
    );
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Muitas tentativas.",
    );
    expect(screen.getByLabelText("Nome")).toHaveValue("Ana");
  });
});
