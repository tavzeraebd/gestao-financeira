import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const changeMemberRole = vi.fn();
const transferOwnership = vi.fn();
const removeMember = vi.fn();
const refresh = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/modules/family/actions", () => ({
  changeMemberRole: (...args: unknown[]) => changeMemberRole(...args),
  transferOwnership: (...args: unknown[]) => transferOwnership(...args),
  removeMember: (...args: unknown[]) => removeMember(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn() }),
  usePathname: () => "/familia",
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { MemberActionsMenu } from "./member-actions-menu";

const MEMBER_ID = "0d9f8f0e-5a2b-4a56-9f5c-6c2f0a6b7a11";

const NONE = {
  makeAdmin: false,
  makeMember: false,
  transferOwnership: false,
  remove: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openMenu(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Ações para ${name}` }));
  await screen.findAllByRole("menuitem");
  return user;
}

describe("MemberActionsMenu", () => {
  it("não renderiza nada quando nenhuma ação é permitida", () => {
    const { container } = render(
      <MemberActionsMenu memberId={MEMBER_ID} displayName="Bruno" actions={NONE} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("owner sobre integrante: mostra só as ações permitidas", async () => {
    render(
      <MemberActionsMenu
        memberId={MEMBER_ID}
        displayName="Bruno"
        actions={{ ...NONE, makeAdmin: true, transferOwnership: true, remove: true }}
      />,
    );
    await openMenu("Bruno");
    expect(
      screen.getByRole("menuitem", { name: "Tornar administrador" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Transferir propriedade" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Remover da família" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Tornar integrante" })).toBeNull();
  });

  it("admin sobre integrante: só remover", async () => {
    render(
      <MemberActionsMenu
        memberId={MEMBER_ID}
        displayName="Bruno"
        actions={{ ...NONE, remove: true }}
      />,
    );
    await openMenu("Bruno");
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(
      screen.getByRole("menuitem", { name: "Remover da família" }),
    ).toBeInTheDocument();
  });

  it("remover pede confirmação e só chama a action ao confirmar", async () => {
    removeMember.mockResolvedValue({ ok: true, data: null });
    render(
      <MemberActionsMenu
        memberId={MEMBER_ID}
        displayName="Bruno"
        actions={{ ...NONE, remove: true }}
      />,
    );
    const user = await openMenu("Bruno");
    await user.click(screen.getByRole("menuitem", { name: "Remover da família" }));

    expect(
      await screen.findByText(/Bruno perde o acesso aos dados da família na hora/),
    ).toBeInTheDocument();
    expect(removeMember).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remover da família" }));
    await waitFor(() =>
      expect(removeMember).toHaveBeenCalledWith({ memberId: MEMBER_ID }),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Bruno foi removido da família."),
    );
  });

  it("integrante que já saiu: mostra a mensagem do integrante e recarrega", async () => {
    removeMember.mockResolvedValue({
      ok: false,
      error: { code: "NOT_FOUND", message: "Não encontrado.", requestId: "r1" },
    });
    render(
      <MemberActionsMenu
        memberId={MEMBER_ID}
        displayName="Bruno"
        actions={{ ...NONE, remove: true }}
      />,
    );
    const user = await openMenu("Bruno");
    await user.click(screen.getByRole("menuitem", { name: "Remover da família" }));
    await user.click(await screen.findByRole("button", { name: "Remover da família" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "Este integrante não faz mais parte da família. Atualize a página.",
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("tornar administrador chama a action sem diálogo", async () => {
    changeMemberRole.mockResolvedValue({ ok: true, data: null });
    render(
      <MemberActionsMenu
        memberId={MEMBER_ID}
        displayName="Bruno"
        actions={{ ...NONE, makeAdmin: true }}
      />,
    );
    const user = await openMenu("Bruno");
    await user.click(screen.getByRole("menuitem", { name: "Tornar administrador" }));
    await waitFor(() =>
      expect(changeMemberRole).toHaveBeenCalledWith({
        memberId: MEMBER_ID,
        role: "admin",
      }),
    );
  });
});
