import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import OfflinePage, { dynamic, metadata } from "./page";

describe("/offline (CA-E8-11)", () => {
  it("é estática, noindex e com título próprio", () => {
    expect(dynamic).toBe("force-static");
    expect(metadata.title).toBe("Sem conexão");
    expect(metadata.robots).toEqual({ index: false });
  });

  it("tem um main#conteudo, um h1 e o botão Tentar novamente", () => {
    render(<OfflinePage />);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "conteudo");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Você está sem conexão" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Pular para o conteúdo" }),
    ).toHaveAttribute("href", "#conteudo");
  });

  it("não depende de sessão nem de banco", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/offline/page.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(
      /supabase|cookies\(|headers\(|requireUser|requireMembership/,
    );
  });
});
