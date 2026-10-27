import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const createFamily = vi.fn();
const replace = vi.fn();

vi.mock("@/modules/family/actions", () => ({
  createFamily: (...args: unknown[]) => createFamily(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/onboarding",
}));

import { CreateFamilyForm } from "./create-family-form";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateFamilyForm", () => {
  it("exige o nome da família", async () => {
    const user = userEvent.setup();
    render(<CreateFamilyForm />);
    await user.click(screen.getByRole("button", { name: "Criar família" }));
    expect(
      await screen.findByText("Informe o nome da família."),
    ).toBeInTheDocument();
    expect(createFamily).not.toHaveBeenCalled();
  });

  it("envia o nome e mostra o erro do servidor mantendo o texto", async () => {
    const user = userEvent.setup();
    createFamily.mockResolvedValue({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Algo deu errado.",
        requestId: "r",
      },
    });
    render(<CreateFamilyForm />);
    await user.type(screen.getByLabelText("Nome da família"), "Família Silva");
    await user.click(screen.getByRole("button", { name: "Criar família" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Algo deu errado.",
    );
    expect(createFamily).toHaveBeenCalledWith({ name: "Família Silva" });
    expect(screen.getByLabelText("Nome da família")).toHaveValue(
      "Família Silva",
    );
  });

  it("vai ao início quando já pertence a uma família", async () => {
    const user = userEvent.setup();
    createFamily.mockResolvedValue({
      ok: false,
      error: { code: "ALREADY_IN_FAMILY", message: "Já está.", requestId: "r" },
    });
    render(<CreateFamilyForm />);
    await user.type(screen.getByLabelText("Nome da família"), "X");
    await user.click(screen.getByRole("button", { name: "Criar família" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/inicio"));
  });
});
