import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/profile/components/delete-account-dialog", () => ({
  DeleteAccountDialog: ({ willEraseFamily }: { willEraseFamily: boolean }) => (
    <button type="button" data-erase={String(willEraseFamily)}>
      Excluir minha conta
    </button>
  ),
}));

import type { AccountDeletionPreview } from "@/modules/profile/types";
import { DeleteAccountSection } from "./delete-account-section";

afterEach(cleanup);

const BASE: AccountDeletionPreview = {
  role: "member",
  otherActiveMembers: 2,
  willEraseFamily: false,
  canDelete: true,
  hasPassword: true,
};

function renderSection(preview: Partial<AccountDeletionPreview>) {
  render(<DeleteAccountSection preview={{ ...BASE, ...preview }} />);
  return screen.getByRole("region", { name: "Excluir conta" });
}

describe("DeleteAccountSection", () => {
  it("é uma região nomeada com título de nível 2", () => {
    const regiao = renderSection({});
    expect(
      within(regiao).getByRole("heading", { level: 2, name: "Excluir conta" }),
    ).toBeInTheDocument();
  });

  it.each(["member", "admin"] as const)(
    "%s: sai da família, perfil anonimizado, o que registrou fica",
    (role) => {
      const regiao = renderSection({ role });
      expect(regiao).toHaveTextContent("Você sai da família");
      expect(regiao).toHaveTextContent("continua com a família");
      expect(regiao).toHaveTextContent("Conta excluída");
      expect(regiao).not.toHaveTextContent(
        "todos os dados dela serão apagados",
      );
      const botao = within(regiao).getByRole("button", {
        name: "Excluir minha conta",
      });
      expect(botao).toHaveAttribute("data-erase", "false");
    },
  );

  it("dono único: avisa que a família inteira e todos os dados são apagados", () => {
    const regiao = renderSection({
      role: "owner",
      otherActiveMembers: 0,
      willEraseFamily: true,
    });
    expect(regiao).toHaveTextContent("Você é a única pessoa da família");
    expect(regiao).toHaveTextContent("todos os dados dela serão apagados");
    expect(
      within(regiao).getByRole("button", { name: "Excluir minha conta" }),
    ).toHaveAttribute("data-erase", "true");
  });

  it("sem família: não fala de sair da família e ainda permite excluir", () => {
    const regiao = renderSection({ role: null, otherActiveMembers: 0 });
    expect(regiao).toHaveTextContent("não faz parte de nenhuma família");
    expect(regiao).not.toHaveTextContent("Você sai da família");
    expect(
      within(regiao).getByRole("button", { name: "Excluir minha conta" }),
    ).toBeInTheDocument();
  });

  it("dono com outros integrantes: bloqueia, orienta e leva à família", () => {
    const regiao = renderSection({
      role: "owner",
      otherActiveMembers: 2,
      canDelete: false,
    });
    expect(regiao).toHaveTextContent("há mais 2 integrantes nela");
    expect(regiao).toHaveTextContent("Transfira a propriedade antes");
    expect(
      within(regiao).queryByRole("button", { name: "Excluir minha conta" }),
    ).toBeNull();
    expect(
      within(regiao).getByRole("link", { name: "Ir para Família" }),
    ).toHaveAttribute("href", "/familia");
  });

  it("dono com 1 outro integrante: singular", () => {
    const regiao = renderSection({
      role: "owner",
      otherActiveMembers: 1,
      canDelete: false,
    });
    expect(regiao).toHaveTextContent("há mais 1 integrante nela");
  });

  it("conta sem senha: explica que não dá para excluir por aqui, sem botão", () => {
    const regiao = renderSection({ hasPassword: false, canDelete: false });
    expect(regiao).toHaveTextContent("Não é possível excluir a conta por aqui");
    expect(
      within(regiao).queryByRole("button", { name: "Excluir minha conta" }),
    ).toBeNull();
    expect(within(regiao).queryByRole("link")).toBeNull();
  });
});
