import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
const resendConfirmation = vi.fn();

vi.mock("@/modules/auth/actions", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
  resendConfirmation: (...args: unknown[]) => resendConfirmation(...args),
}));

import { SignInForm } from "./sign-in-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const erro = (code: string, message: string) => ({
  ok: false as const,
  error: { code, message, requestId: "req-1" },
});

describe("SignInForm", () => {
  it("valida campos vazios sem chamar a action", async () => {
    const user = userEvent.setup();
    render(<SignInForm />);
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(
      await screen.findByText("Informe um e-mail válido."),
    ).toBeInTheDocument();
    expect(screen.getByText("Informe sua senha.")).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("mostra loading e desabilita o botão durante o envio", async () => {
    const user = userEvent.setup();
    let resolver: (value: unknown) => void = () => {};
    signIn.mockReturnValue(new Promise((resolve) => (resolver = resolve)));
    render(<SignInForm next="/familia" />);
    await user.type(screen.getByLabelText("E-mail"), "ana@exemplo.com");
    await user.type(
      screen.getByLabelText("Senha", { exact: true }),
      "segredo123",
    );
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const botao = await screen.findByRole("button", { name: "Entrar" });
    await waitFor(() => expect(botao).toBeDisabled());
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(signIn).toHaveBeenCalledWith({
      email: "ana@exemplo.com",
      password: "segredo123",
      next: "/familia",
    });
    resolver({ ok: true, data: undefined });
  });

  it("mostra o erro do servidor e mantém o e-mail digitado", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue(
      erro("INVALID_CREDENTIALS", "E-mail ou senha incorretos."),
    );
    render(<SignInForm />);
    await user.type(screen.getByLabelText("E-mail"), "ana@exemplo.com");
    await user.type(
      screen.getByLabelText("Senha", { exact: true }),
      "errada123",
    );
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "E-mail ou senha incorretos.",
    );
    expect(screen.getByLabelText("E-mail")).toHaveValue("ana@exemplo.com");
    expect(screen.getByLabelText("Senha", { exact: true })).toHaveValue("");
  });

  it("oferece reenviar confirmação quando o e-mail não foi confirmado", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue(
      erro("EMAIL_NOT_CONFIRMED", "Confirme seu e-mail."),
    );
    resendConfirmation.mockResolvedValue({ ok: true, data: null });
    render(<SignInForm />);
    await user.type(screen.getByLabelText("E-mail"), "ana@exemplo.com");
    await user.type(
      screen.getByLabelText("Senha", { exact: true }),
      "segredo123",
    );
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await user.click(
      await screen.findByRole("button", { name: "Reenviar confirmação" }),
    );
    expect(resendConfirmation).toHaveBeenCalledWith({
      email: "ana@exemplo.com",
    });
  });
});
