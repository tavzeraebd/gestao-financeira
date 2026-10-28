import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const deleteAccount = vi.fn();
const replace = vi.fn();

vi.mock("@/modules/profile/actions", () => ({
  deleteAccount: (...args: unknown[]) => deleteAccount(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/configuracoes",
}));

import { DeleteAccountDialog } from "./delete-account-dialog";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function failure(
  code: string,
  message: string,
  fieldErrors?: Record<string, string[]>,
) {
  return {
    ok: false,
    error: { code, message, requestId: "r1", fieldErrors },
  };
}

async function openDialog() {
  const user = userEvent.setup();
  render(<DeleteAccountDialog willEraseFamily={false} />);
  await user.click(
    await screen.findByRole("button", { name: "Excluir minha conta" }),
  );
  await screen.findByRole("alertdialog");
  return user;
}

const password = () => screen.getByLabelText("Senha", { exact: true });
const confirmation = () =>
  screen.getByLabelText("Digite EXCLUIR para confirmar");
const submit = () =>
  screen.getByRole("button", { name: "Excluir conta definitivamente" });

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(password(), "Senha-de-teste-1");
  await user.type(confirmation(), "EXCLUIR");
  await user.click(submit());
}

describe("DeleteAccountDialog", () => {
  it("só abre o diálogo ao clicar e não chama a action antes de confirmar", async () => {
    await openDialog();
    expect(
      screen.getByRole("alertdialog", { name: "Excluir sua conta?" }),
    ).toBeInTheDocument();
    expect(password()).toBeInTheDocument();
    expect(confirmation()).toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("texto do diálogo diz que a família inteira é apagada quando é o caso", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountDialog willEraseFamily />);
    await user.click(
      await screen.findByRole("button", { name: "Excluir minha conta" }),
    );
    expect(
      await screen.findByText(/ela e todos os dados dela serão apagados/),
    ).toBeInTheDocument();
  });

  it("campos vazios: mostra os erros ligados aos campos, foca o primeiro e não envia", async () => {
    const user = await openDialog();
    await user.click(submit());

    const erroSenha = await screen.findByText("Informe sua senha.");
    expect(password()).toHaveAttribute("aria-invalid", "true");
    expect(password().getAttribute("aria-describedby")).toBe(erroSenha.id);

    const erroConfirmacao = screen.getByText("Digite EXCLUIR para confirmar.");
    expect(confirmation().getAttribute("aria-describedby")).toContain(
      erroConfirmacao.id,
    );
    await waitFor(() => expect(password()).toHaveFocus());
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("confirmação diferente de EXCLUIR não envia", async () => {
    const user = await openDialog();
    await user.type(password(), "Senha-de-teste-1");
    await user.type(confirmation(), "excluir");
    await user.click(submit());

    expect(
      await screen.findByText("Digite EXCLUIR para confirmar."),
    ).toBeInTheDocument();
    await waitFor(() => expect(confirmation()).toHaveFocus());
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("envia senha e confirmação, mostra carregamento e bloqueia o cancelamento", async () => {
    // Promessa em aberto: o React emaranha ações assíncronas, então ela é resolvida ao final do teste.
    let liberar: (valor: unknown) => void = () => undefined;
    deleteAccount.mockReturnValue(
      new Promise((resolve) => {
        liberar = resolve;
      }),
    );
    const user = await openDialog();
    await fillAndSubmit(user);

    await waitFor(() =>
      expect(deleteAccount).toHaveBeenCalledWith({
        password: "Senha-de-teste-1",
        confirmation: "EXCLUIR",
      }),
    );
    await waitFor(() => expect(submit()).toBeDisabled());
    expect(submit()).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", { name: "Manter minha conta" }),
    ).toBeDisabled();

    liberar(failure("INTERNAL_ERROR", "Algo deu errado."));
    await waitFor(() => expect(submit()).toBeEnabled());
  });

  it("senha incorreta: erro no campo da senha com a mensagem do servidor, foco nela e senha limpa", async () => {
    deleteAccount.mockResolvedValue(
      failure(
        "INVALID_CREDENTIALS",
        "E-mail ou senha incorretos. Confira os dados ou redefina sua senha.",
      ),
    );
    const user = await openDialog();
    await fillAndSubmit(user);

    const erro = await screen.findByText(/E-mail ou senha incorretos/);
    expect(password().getAttribute("aria-describedby")).toBe(erro.id);
    expect(password()).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(password()).toHaveFocus());
    expect(password()).toHaveValue("");
    expect(confirmation()).toHaveValue("EXCLUIR");
    await waitFor(() => expect(submit()).toBeEnabled());
  });

  it("VALIDATION_ERROR do servidor aparece no campo e leva o foco até ele", async () => {
    deleteAccount.mockResolvedValue(
      failure("VALIDATION_ERROR", "Dados inválidos.", {
        confirmation: ["Digite EXCLUIR para confirmar."],
      }),
    );
    const user = await openDialog();
    await fillAndSubmit(user);

    const erro = await screen.findByText("Digite EXCLUIR para confirmar.");
    expect(confirmation().getAttribute("aria-describedby")).toContain(erro.id);
    await waitFor(() => expect(confirmation()).toHaveFocus());
  });

  it.each([
    ["RATE_LIMITED", "Muitas tentativas em pouco tempo."],
    ["REAUTH_REQUIRED", "Confirme sua senha para continuar."],
    ["ACCOUNT_ERASURE_UNAVAILABLE", "Não foi possível excluir a conta agora."],
    ["FORBIDDEN", "Você não tem permissão para fazer isso."],
    ["INTERNAL_ERROR", "Algo deu errado. Tente novamente."],
  ])(
    "%s: mostra a mensagem do servidor num aviso com foco, sem detalhes técnicos",
    async (code, message) => {
      deleteAccount.mockResolvedValue(failure(code, message));
      const user = await openDialog();
      await fillAndSubmit(user);

      const alerta = await screen.findByRole("alert");
      expect(alerta).toHaveTextContent(message);
      await waitFor(() => expect(alerta).toHaveFocus());
      expect(alerta).not.toHaveTextContent("r1");
      // Mantém o que foi digitado para tentar de novo.
      expect(confirmation()).toHaveValue("EXCLUIR");
      await waitFor(() => expect(submit()).toBeEnabled());
    },
  );

  it("OWNER_MUST_TRANSFER: orienta a transferir e leva à família", async () => {
    deleteAccount.mockResolvedValue(
      failure(
        "OWNER_MUST_TRANSFER",
        "Transfira a propriedade da família para outro integrante antes de sair.",
      ),
    );
    const user = await openDialog();
    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Transfira a propriedade",
    );
    expect(
      screen.getByRole("link", { name: /Ir para Família/ }),
    ).toHaveAttribute("href", "/familia");
  });

  it("falha de rede vira aviso geral, sem exceção solta", async () => {
    deleteAccount.mockRejectedValue(new Error("fetch failed"));
    const user = await openDialog();
    await fillAndSubmit(user);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Não foi possível falar com o servidor");
    expect(alerta).not.toHaveTextContent("fetch failed");
  });

  it("sessão expirada leva ao login com a rota atual", async () => {
    deleteAccount.mockResolvedValue(
      failure("UNAUTHENTICATED", "Sua sessão expirou."),
    );
    const user = await openDialog();
    await fillAndSubmit(user);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/login?motivo=sessao_expirada&next=%2Fconfiguracoes",
      ),
    );
  });

  it("cancelar fecha o diálogo e limpa os campos na próxima abertura", async () => {
    const user = await openDialog();
    await user.type(password(), "segredo");
    await user.click(
      screen.getByRole("button", { name: "Manter minha conta" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Excluir minha conta" }),
    );
    await screen.findByRole("alertdialog");
    expect(password()).toHaveValue("");
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});
