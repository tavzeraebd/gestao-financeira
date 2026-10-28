import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/auth/components/sign-in-form", () => ({
  SignInForm: ({ next }: { next?: string }) => (
    <form aria-label="Entrar" data-next={next ?? ""} />
  ),
}));

import LoginPage from "./page";

afterEach(cleanup);

async function renderLogin(params: Record<string, string | string[]>) {
  render(await LoginPage({ searchParams: Promise.resolve(params) }));
}

describe("LoginPage: aviso de conta excluída (CA-E9-48)", () => {
  it("?conta=excluida mostra o aviso informativo (status, não alerta)", async () => {
    await renderLogin({ conta: "excluida" });
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("Sua conta foi excluída.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("form", { name: "Entrar" })).toBeInTheDocument();
  });

  it.each(["x", "EXCLUIDA", ""])("?conta=%s é ignorado", async (valor) => {
    await renderLogin({ conta: valor });
    expect(screen.queryByText(/Sua conta foi excluída/)).toBeNull();
  });

  it("sem o parâmetro não mostra o aviso", async () => {
    await renderLogin({});
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("não atrapalha o aviso de sessão expirada nem o next", async () => {
    await renderLogin({
      conta: "excluida",
      motivo: "sessao_expirada",
      next: "/inicio",
    });
    expect(screen.getByText(/Sua conta foi excluída/)).toBeInTheDocument();
    expect(screen.getByText(/Sua sessão expirou/)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Entrar" })).toHaveAttribute(
      "data-next",
      "/inicio",
    );
  });

  it("só sessão expirada: sem o aviso de conta excluída", async () => {
    await renderLogin({ motivo: "sessao_expirada" });
    expect(screen.getByText(/Sua sessão expirou/)).toBeInTheDocument();
    expect(screen.queryByText(/Sua conta foi excluída/)).toBeNull();
  });

  it("aceita parâmetro repetido (usa o primeiro)", async () => {
    await renderLogin({ conta: ["excluida", "x"] });
    expect(screen.getByText(/Sua conta foi excluída/)).toBeInTheDocument();
  });
});
