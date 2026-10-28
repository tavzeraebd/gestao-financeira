import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableRow,
} from "@/components/ui/table";

function tabela(rotulo?: string) {
  return (
    <Table rotulo={rotulo}>
      <TableCaption className="sr-only">Despesas por conta</TableCaption>
      <TableBody>
        <TableRow>
          <TableCell>Conta</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function larguras(scroll: number, client: number) {
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scroll);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(client);
}

describe("Table (contêiner rolável)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sem rolagem não entra na ordem de Tab nem vira região", () => {
    larguras(300, 300);
    const { container } = render(tabela());
    const caixa = container.querySelector('[data-slot="table-container"]')!;
    expect(caixa).not.toHaveAttribute("tabindex");
    expect(caixa).not.toHaveAttribute("role");
  });

  it("com rolagem vira região focável nomeada pela caption", () => {
    larguras(600, 300);
    render(tabela());
    const regiao = screen.getByRole("region", { name: "Despesas por conta" });
    expect(regiao).toHaveAttribute("tabindex", "0");
    expect(regiao).toHaveAttribute("data-slot", "table-container");
  });

  it("`rotulo` tem precedência sobre a caption", () => {
    larguras(600, 300);
    render(tabela("Saldo por conta"));
    expect(
      screen.getByRole("region", { name: "Saldo por conta" }),
    ).toHaveAttribute("tabindex", "0");
  });

  it("sem caption usa o nome padrão", () => {
    larguras(600, 300);
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell>x</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(
      screen.getByRole("region", { name: "Tabela com rolagem horizontal" }),
    ).toBeInTheDocument();
  });
});
