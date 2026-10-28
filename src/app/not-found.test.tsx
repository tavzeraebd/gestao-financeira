import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NotFound from "./not-found";

afterEach(cleanup);

describe("404 (A-2, CA-E8-31 e CA-E8-20)", () => {
  it("tem um main#conteudo com tabindex -1 e único", () => {
    render(<NotFound />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "conteudo");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("tem um único h1 com o título em pt-BR", () => {
    render(<NotFound />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeInTheDocument();
  });

  it("oferece o link Pular para o conteúdo apontando para #conteudo", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("link", { name: "Pular para o conteúdo" }),
    ).toHaveAttribute("href", "#conteudo");
  });

  it("mantém o link de volta ao início", () => {
    render(<NotFound />);
    expect(
      screen.getByRole("link", { name: "Ir para o início" }),
    ).toHaveAttribute("href", "/inicio");
  });
});
